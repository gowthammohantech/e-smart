import { ApiError } from '@esmart/api-client';
import { useAppStore } from '../store/appStore';
import { api, isNetworkError } from './api';
import { applyEntity, purgeLocalDefaults, remapIds, removeEntity, replaceForCompany, unwrap } from './apply';
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
    await pushAll();
    await pullAll();
    await refreshLists();
    meta.patch({ online: true, lastSyncAt: new Date().toISOString(), lastError: undefined });
    clearRetry();
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

async function pushAll() {
  const tried = new Set<string>();
  for (;;) {
    const batch = outbox
      .entries()
      .filter((e) => e.status === 'pending' && !tried.has(e.id))
      .slice(0, BATCH);
    if (!batch.length) return;
    batch.forEach((e) => tried.add(e.id));
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
        if (entity && entry.method !== 'DELETE') applyEntity(entry.entityType, entity);
        outbox.drop(entry.id);
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

async function pullAll() {
  const meta = useRemoteMeta.getState();
  let cursor = meta.cursor;
  for (;;) {
    const { data } = await api.GET('/sync/pull', { params: { query: { ...(cursor ? { since: cursor } : {}), limit: 500 } } });
    for (const ch of data?.changes ?? []) {
      if (!ch.entityType || !ch.entityId) continue;
      if (ch.op === 'delete') removeEntity(ch.entityType, ch.entityId);
      else if (ch.data) applyEntity(ch.entityType, ch.data);
    }
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
}
