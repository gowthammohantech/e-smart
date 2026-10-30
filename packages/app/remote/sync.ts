import { ApiError } from '@esmart/api-client';
import { useAppStore } from '../store/appStore';
import { api, isNetworkError } from './api';
import { applyChanges, applyEntity, purgeLocalDefaults, remapIds, replaceForCompany, unwrap, type Change } from './apply';
import { flushPendingLogos, refreshLogoLinks } from './logo';
import { useRemoteMeta } from './meta';
import * as outbox from './outbox';

const BATCH = 200;

/**
 * The sync engine. One run: push the outbox in order, pull what changed on
 * the server since the last cursor, then refresh the lists the server owns
 * (notifications, the audit trail, stock movements, devices). Runs never
 * overlap; asking for one while one is in flight returns that one.
 */
let running: Promise<void> | null = null;
let again = false;
/** Set while a new session loads its first snapshot, before `session` flips. */
let bootstrapping = false;

/**
 * Replaces the book with the server's; `replace` empties it. Everything is fetched
 * first, so a reload that can't reach the server leaves the book as it was.
 */
export async function reloadSnapshot(replace: () => void) {
  await running?.catch(() => undefined);
  const changes: Change[] = [];
  let cursor: string | undefined;
  for (;;) {
    const { data } = await api.GET('/sync/pull', { params: { query: { ...(cursor ? { since: cursor } : {}), limit: 500 } } });
    changes.push(...((data?.changes ?? []) as Change[]));
    cursor = data?.cursor ?? cursor;
    if (!data?.hasMore) break;
  }
  replace();
  applyChanges(changes);
  useRemoteMeta.getState().patch({ cursor: cursor ?? null });
  await refreshLists();
  useRemoteMeta.getState().patch({ online: true, lastSyncAt: new Date().toISOString() });
}

/** Loads everything for a fresh session: a full pull and the owned lists. */
export async function loadSnapshot() {
  bootstrapping = true;
  try {
    useRemoteMeta.getState().patch({ cursor: null });
    await pullAll();
    await refreshLists();
    useRemoteMeta.getState().patch({ online: true, lastSyncAt: new Date().toISOString() });
  } finally {
    bootstrapping = false;
  }
}

export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await runOnce();
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

/**
 * After a run that couldn't reach the server, try again by itself: 5s, 10s,
 * 20s… up to a minute. Connectivity events help, but aren't relied on; some
 * networks never report "reachable", and what matters is reaching our API.
 */
const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 60_000;
let retryIn = RETRY_MIN_MS;
let retry: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry() {
  if (retry) return;
  retry = setTimeout(() => {
    retry = null;
    void syncNow();
  }, retryIn);
  retryIn = Math.min(retryIn * 2, RETRY_MAX_MS);
}

function clearRetry() {
  if (retry) clearTimeout(retry);
  retry = null;
  retryIn = RETRY_MIN_MS;
}

let soon: ReturnType<typeof setTimeout> | null = null;
/** Coalesces a burst of edits into one run shortly after the last. */
export function syncSoon(delayMs = 400) {
  if (soon) clearTimeout(soon);
  soon = setTimeout(() => {
    soon = null;
    void syncNow();
  }, delayMs);
}

async function runOnce() {
  const meta = useRemoteMeta.getState();
  if (!useAppStore.getState().session.authenticated && !bootstrapping) return;
  meta.patch({ syncing: true });
  try {
    const resend = await pushAll();
    // A logo picked during setup goes up once its business exists on the server.
    await flushPendingLogos();
    await pullNewCompanies();
    await pullAll();
    await refreshLists();
    // Best effort: a logo link that can't refresh now is retried on the next run.
    await refreshLogoLinks().catch(() => undefined);
    meta.patch({ online: true, lastSyncAt: new Date().toISOString(), lastError: undefined });
    if (resend) scheduleRetry();
    else clearRetry();
  } catch (err) {
    if (isNetworkError(err)) {
      meta.patch({ online: false });
      scheduleRetry();
    }
    else meta.patch({ lastError: err instanceof Error ? err.message : String(err) });
  } finally {
    useRemoteMeta.getState().patch({ syncing: false });
  }
}

/** Stock movements and notification marks don't build on one another. */
const standsAlone = (e: outbox.Entry) => /\/(stock|notifications)(\/|$)/.test(e.path);

/**
 * The next entries to send, in order. A change waits while an earlier change to
 * the same entity has failed, or if it mentions an offline id whose create
 * failed: it was made on top of something the server doesn't have. Only one
 * entry per entity goes at a time, so each is sent against the version the last
 * one produced.
 */
function nextBatch(tried: Set<string>): outbox.Entry[] {
  const all = outbox.entries();
  const failed = all.filter((e) => e.status === 'failed');
  const blocked = new Set(failed.filter((e) => !standsAlone(e)).map((e) => e.entityId));
  const missing = failed.flatMap((e) => (e.clientEntityId ? [e.clientEntityId] : []));
  const going = new Set<string>();
  const batch: outbox.Entry[] = [];
  for (const e of all) {
    if (batch.length === BATCH) break;
    if (e.status !== 'pending' || tried.has(e.id)) continue;
    if (!standsAlone(e)) {
      if (blocked.has(e.entityId) || going.has(e.entityId)) continue;
      if (missing.length) {
        const text = `${e.path} ${JSON.stringify(e.body ?? null)}`;
        if (missing.some((id) => text.includes(id))) continue;
      }
      going.add(e.entityId);
    }
    batch.push(e);
  }
  return batch;
}

/** Sends what's queued. True if the server asked for something to be sent again later. */
async function pushAll(): Promise<boolean> {
  const tried = new Set<string>();
  let again = false;
  for (;;) {
    const batch = nextBatch(tried);
    if (!batch.length) return again;
    batch.forEach((e) => tried.add(e.id));
    outbox.markSent(batch.map((e) => e.id));
    const { data } = await api.POST('/sync/push', {
      body: {
        mutations: batch.map((e) => ({
          id: e.id,
          method: e.method,
          path: e.path,
          body: (e.body ?? undefined) as Record<string, never> | undefined,
          baseVersion: e.baseVersion,
          clientEntityId: e.clientEntityId,
          queuedAt: e.queuedAt,
        })),
      },
    });
    for (const r of data?.results ?? []) {
      const entry = batch.find((e) => e.id === r.id);
      if (!entry) continue;
      const entity = unwrap(r.entity);
      if (r.status === 'applied') {
        const serverId = typeof entity?.id === 'string' ? entity.id : undefined;
        if (entry.clientEntityId && serverId && serverId !== entry.clientEntityId) {
          remapIds({ [entry.clientEntityId]: serverId });
          if (entry.path === '/companies') purgeLocalDefaults(serverId);
        }
        outbox.drop(entry.id);
        const entityId = entry.clientEntityId && serverId ? serverId : entry.entityId;
        const version = typeof entity?.version === 'number' ? entity.version : undefined;
        if (version !== undefined) {
          useRemoteMeta.getState().setVersion(entityId, version);
          outbox.rebase(entityId, version);
        }
        // Something newer is queued for it: the local copy stays until that's answered too.
        if (entity && entry.method !== 'DELETE' && !outbox.hasQueuedAfter(entityId)) applyEntity(entry.entityType, entity);
      } else if (r.status === 'retry') {
        // Stays pending under the same id: the server may yet have an answer for it.
        again = true;
        outbox.update(entry.id, { attempts: entry.attempts + 1, lastError: r.error?.detail ?? r.error?.title });
      } else if (r.status === 'conflict') {
        if (entity) applyEntity(entry.entityType, entity);
        outbox.update(entry.id, {
          status: 'failed',
          attempts: entry.attempts + 1,
          conflict: entity,
          lastError: r.error?.detail ?? 'Changed on another device since you edited it',
        });
      } else {
        outbox.update(entry.id, { status: 'failed', attempts: entry.attempts + 1, lastError: r.error?.detail ?? r.error?.title ?? 'The server refused this change' });
      }
    }
  }
}

/**
 * The cursor only moves forward, so a business joined on another device has its
 * history behind it. Anything new in the account's list gets its own snapshot.
 */
async function pullNewCompanies() {
  const { data: me } = await api.GET('/me');
  const known = new Set(useAppStore.getState().companies.map((c) => c.id));
  for (const { id } of (me?.companies ?? []) as { id?: string }[]) {
    if (!id || known.has(id)) continue;
    let since: string | undefined;
    for (;;) {
      const { data } = await api.GET('/sync/pull', { params: { query: { companyId: id, ...(since ? { since } : {}), limit: 500 } } });
      applyChanges(data?.changes ?? []);
      since = data?.cursor ?? since;
      if (!data?.hasMore) break;
    }
  }
}

async function pullAll() {
  const meta = useRemoteMeta.getState();
  let cursor = meta.cursor;
  for (;;) {
    const { data } = await api.GET('/sync/pull', { params: { query: { ...(cursor ? { since: cursor } : {}), limit: 500 } } });
    applyChanges(data?.changes ?? []);
    cursor = data?.cursor ?? cursor;
    useRemoteMeta.getState().patch({ cursor });
    if (!data?.hasMore) return;
  }
}

/** Pages a list endpoint to the end. */
async function all<T>(fetchPage: (cursor?: string) => Promise<{ data?: T[]; nextCursor?: string | null } | undefined>): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await fetchPage(cursor);
    out.push(...(page?.data ?? []));
    if (!page?.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

/** A list the plan or role doesn't allow is simply left empty. */
async function allowed<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return fallback;
    throw err;
  }
}

async function refreshLists() {
  const companyId = useAppStore.getState().activeCompanyId;
  if (!companyId) return;
  const path = { companyId };
  const [notifications, audit, movements, devices, users] = await Promise.all([
    all((cursor) => api.GET('/companies/{companyId}/notifications', { params: { path, query: { limit: 200, cursor } } }).then((r) => r.data)),
    allowed(all((cursor) => api.GET('/companies/{companyId}/audit-events', { params: { path, query: { limit: 200, cursor } } }).then((r) => r.data)), []),
    allowed(all((cursor) => api.GET('/companies/{companyId}/stock/movements', { params: { path, query: { limit: 200, cursor } } }).then((r) => r.data)), []),
    api.GET('/me/devices').then((r) => r.data?.data ?? []),
    // Team members aren't in the change log until someone edits them.
    api.GET('/users').then((r) => r.data?.data ?? []),
  ]);
  replaceForCompany('notifications', companyId, notifications as never);
  replaceForCompany('auditEvents', companyId, audit as never);
  replaceForCompany('stockMovements', companyId, movements as never);
  useAppStore.setState({ devices: devices as never, users: users as never });
  // Team members may not be in the change log, yet the server knows them: an edit is an update.
  const { setVersion } = useRemoteMeta.getState();
  for (const u of users as { id?: string; version?: number }[]) if (u.id && typeof u.version === 'number') setVersion(u.id, u.version);
}
