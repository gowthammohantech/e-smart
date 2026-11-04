import { ApiError } from '@esmart/api-client';
import { useAppStore } from '../store/appStore';
import { api, isNetworkError } from './api';
import { reportError } from '../lib/reporter';
import { useConnectivity } from './connectivity';
import { applyChanges, applyEntity, purgeLocalDefaults, remapIds, replaceForCompany, unwrap, type Change } from './apply';
import { flushPendingLogos, refreshLogoLinks } from './logo';
import { uploadAttachment } from './attachments';
import { knownToServer, useRemoteMeta } from './meta';
import * as outbox from './outbox';
import { useReceiptQueue } from './receiptQueue';
import i18n from '@esmart/i18n';

const BATCH = 200;
/** After this many failed attempts with the server reachable, a picked receipt is given up on. */
const MAX_RECEIPT_TRIES = 5;

/**
 * The sync engine. One run: push the outbox in order, pull what changed on
 * the server since the last cursor, then refresh the lists the server owns
 * (notifications, the audit trail, stock movements, devices). Runs never
 * overlap; asking for one while one is in flight returns that one.
 */
let running: Promise<void> | null = null;
let again = false;
/** Moves on at sign-out. An answer to a request from an earlier session is dropped, not applied. */
let session = 0;
class SessionEnded extends Error {}
function assertSession(started: number) {
  if (started !== session) throw new SessionEnded();
}

/** What became of a queue entry the user is waiting on. */
export type Outcome = { kind: 'applied'; serverId?: string } | { kind: 'rejected' | 'conflict'; error: string } | { kind: 'queued' };
const waiting = new Map<string, (o: Outcome) => void>();
/** Told when the server refuses a change no screen is waiting on (one kept while offline), with its label. */
export const onRefusedLater = new Set<(label: string, error: string) => void>();
function report(id: string, o: Outcome, label?: string) {
  const listener = waiting.get(id);
  waiting.delete(id);
  if (listener) listener(o);
  else if ((o.kind === 'rejected' || o.kind === 'conflict') && label) onRefusedLater.forEach((l) => l(label, o.error));
}

/**
 * Resolves once the server has answered each entry, or with `queued` for those it
 * couldn't: no connection, still waiting behind a failed change, or no answer in time.
 */
export function waitForOutcome(ids: string[], timeoutMs: number): Promise<Map<string, Outcome>> {
  const out = new Map<string, Outcome>();
  if (!ids.length) return Promise.resolve(out);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      for (const id of ids) if (!out.has(id)) report(id, { kind: 'queued' });
    }, timeoutMs);
    for (const id of ids) {
      waiting.set(id, (o) => {
        out.set(id, o);
        if (out.size === ids.length) {
          clearTimeout(timer);
          resolve(out);
        }
      });
    }
  });
}

/** At the end of a run: anything not sent in it won't be until the next. */
function settleWaiting(all: boolean) {
  const queue = outbox.entries();
  for (const id of [...waiting.keys()]) {
    const e = queue.find((q) => q.id === id);
    if (all || !e || (e.status === 'pending' && outbox.blockerOf(e, queue))) report(id, { kind: 'queued' });
  }
}

export function endSyncSession() {
  session += 1;
}
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
  await running?.catch(() => undefined);
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

/** Seen at most this often when screens are opened: fresh from the server, yet light when moving around quickly. */
const FOCUS_REFRESH_MS = 3_000;
let lastFocusRefresh = 0;

/** A screen opened while online shows what the server has now, not what the last 60-second sync saw. */
export function refreshOnFocus() {
  if (!useRemoteMeta.getState().online || Date.now() - lastFocusRefresh < FOCUS_REFRESH_MS) return;
  lastFocusRefresh = Date.now();
  syncSoon(0);
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

/** One tab syncs at a time; another that wants to just skips this run. */
async function oneTabAtATime(run: () => Promise<void>) {
  const locks = (globalThis.navigator as { locks?: { request: (name: string, options: { ifAvailable: boolean }, fn: (lock: unknown) => Promise<void>) => Promise<void> } } | undefined)?.locks;
  if (!locks) return run();
  await locks.request('ebs.sync', { ifAvailable: true }, (lock) => (lock ? run() : Promise.resolve()));
}

async function runOnce() {
  await oneTabAtATime(runLocked);
}

/** Uploads receipts picked offline, once their expense has reached the server. */
async function flushPendingReceipts(started: number) {
  const queue = useReceiptQueue.getState();
  for (const [expenseId, p] of Object.entries(queue.pending)) {
    if (!knownToServer(expenseId)) continue;
    let attachmentId: string;
    try {
      attachmentId = (await uploadAttachment({ companyId: p.companyId, uri: p.uri, name: 'Receipt', entityType: 'expense', entityId: expenseId })).id;
    } catch (err) {
      if (isNetworkError(err) && !useRemoteMeta.getState().online) throw err;
      if (p.tries + 1 >= MAX_RECEIPT_TRIES) {
        queue.clear(expenseId);
        const reason = err instanceof Error ? err.message : String(err);
        useRemoteMeta.getState().patch({ lastError: reason });
        // Given up on: say so, rather than the receipt silently never arriving.
        const expense = useAppStore.getState().expenses.find((e) => e.id === expenseId);
        onRefusedLater.forEach((l) => l(i18n.t('purchases:form.receiptFor', { number: expense?.number ?? '' }), reason));
      } else queue.tried(expenseId);
      continue;
    }
    assertSession(started);
    queue.clear(expenseId);
    const s = useAppStore.getState();
    const expense = s.expenses.find((e) => e.id === expenseId);
    if (expense) s.saveExpense({ ...expense, attachmentIds: [...(expense.attachmentIds ?? []), attachmentId] });
  }
}

async function runLocked() {
  const meta = useRemoteMeta.getState();
  const started = session;
  if (!useAppStore.getState().session.authenticated && !bootstrapping) return;
  meta.patch({ syncing: true });
  try {
    // A failed push still lets this device see what changed; only a lost connection ends the run.
    let resend = false;
    let pushError: unknown;
    try {
      // Offline mode holds the outbox until the connection has stayed back (connectivity.ts drains it).
      if (useConnectivity.getState().mode !== 'offline') resend = await pushAll(started);
    } catch (err) {
      if (isNetworkError(err) || err instanceof SessionEnded) throw err;
      pushError = err;
    }
    // A logo picked during setup goes up once its business exists on the server.
    await flushPendingLogos();
    await flushPendingReceipts(started);
    await pullNewCompanies(started);
    await pullAll(started);
    await pullChangedPlans(started);
    await refreshLists(started);
    if (pushError) throw pushError;
    // Best effort: a logo link that can't refresh now is retried on the next run.
    await refreshLogoLinks().catch(() => undefined);
    meta.patch({ online: true, lastSyncAt: new Date().toISOString(), lastError: undefined });
    if (resend) scheduleRetry();
    else clearRetry();
    settleWaiting(false);
  } catch (err) {
    settleWaiting(true);
    if (err instanceof SessionEnded) return;
    if (isNetworkError(err)) {
      meta.patch({ online: false });
      scheduleRetry();
    }
    else meta.patch({ lastError: err instanceof Error ? err.message : String(err) });
  } finally {
    useRemoteMeta.getState().patch({ syncing: false });
  }
}

/**
 * The next entries to send, in order. A change waits while something it builds
 * on has failed. Only one entry per entity goes at a time, so each is sent
 * against the version the last one produced. A new company goes alone: what
 * follows it refers to its local defaults until the server's are adopted.
 */
function nextBatch(tried: Set<string>, size: number): outbox.Entry[] {
  const all = outbox.entries();
  const going = new Set<string>();
  const batch: outbox.Entry[] = [];
  for (const e of all) {
    if (batch.length === size) break;
    if (e.status !== 'pending' || tried.has(e.id)) continue;
    if (outbox.blockerOf(e, all)) continue;
    if (e.path === '/companies' && e.clientEntityId) {
      if (batch.length) break;
      return [e];
    }
    if (!outbox.standsAlone(e)) {
      if (going.has(e.entityId)) continue;
      going.add(e.entityId);
    }
    // A payment changes the invoices it pays (their paid amount, status and version): a change to one
    // of them waits for the next batch, built on the version the payment leaves.
    if (e.entityType === 'payment') for (const id of allocatedDocuments(e.body)) going.add(id);
    batch.push(e);
  }
  return batch;
}

/**
 * A company created offline got local copies of its defaults, and queued
 * changes may refer to them. The server made its own when the create went
 * through: match them up, so those changes point at the server's.
 */
async function adoptCompanyDefaults(companyId: string) {
  const path = { companyId };
  // A list the plan doesn't open (expenses on Free) comes back empty. Thrown, it would stop the
  // create from ever counting as done: resent each sync, and a logo picked in setup never sent.
  const list = (p: Promise<{ data?: unknown }>) => allowed<{ data?: unknown }>(p, {});
  const [branches, series, taxes, categories, accounts] = await Promise.all([
    list(api.GET('/companies/{companyId}/branches', { params: { path } })),
    list(api.GET('/companies/{companyId}/numbering-series', { params: { path } })),
    list(api.GET('/companies/{companyId}/tax-categories', { params: { path } })),
    list(api.GET('/companies/{companyId}/expense-categories', { params: { path } })),
    list(api.GET('/companies/{companyId}/payment-accounts', { params: { path } })),
  ]);
  type Row = { id?: string; companyId?: string; [k: string]: unknown };
  const s = useAppStore.getState();
  const rowsOf = (r: { data?: unknown }) => ((r.data as { data?: Row[] } | undefined)?.data ?? []) as Row[];
  const sets: { type: string; server: Row[]; local: Row[]; key: (r: Row) => string }[] = [
    { type: 'branch', server: rowsOf(branches), local: s.branches as never, key: (r) => (r.isPrimary ? 'primary' : String(r.code)) },
    { type: 'numbering_series', server: rowsOf(series), local: s.numberingSeries as never, key: (r) => String(r.kind) },
    { type: 'tax_category', server: rowsOf(taxes), local: s.taxCategories as never, key: (r) => String(Number(r.rate)) },
    { type: 'expense_category', server: rowsOf(categories), local: s.expenseCategories as never, key: (r) => String(r.name).toLowerCase() },
    { type: 'payment_account', server: rowsOf(accounts), local: s.paymentAccounts as never, key: (r) => (r.isDefault ? 'default' : String(r.name)) },
  ];
  const map: Record<string, string> = {};
  for (const { server, local, key } of sets) {
    const byKey = new Map(server.map((r) => [key(r), r.id]));
    for (const row of local) {
      const to = row.companyId === companyId && row.id ? byKey.get(key(row)) : undefined;
      if (to && row.id) map[row.id] = to;
    }
  }
  remapIds(map);
  for (const { type, server } of sets) for (const row of server) applyEntity(type, row);
}

/** The documents a payment's body (or the server's copy of it) allocates to. */
function allocatedDocuments(body: unknown): string[] {
  const allocations = (body as { allocations?: { documentId?: string }[] } | null | undefined)?.allocations ?? [];
  return allocations.map((a) => a.documentId).filter((id): id is string => typeof id === 'string');
}

/**
 * A payment just applied moved its invoices on a version. Changes to them still queued here were made
 * on the old one and would come back as conflicts with nobody's edit: give them the new version. Safe,
 * because what the payment changed (paid amount, status) is the server's to compute, not the edit's.
 */
async function rebaseAllocatedDocuments(entry: outbox.Entry, entity: Record<string, unknown> | undefined) {
  const ids = new Set([...allocatedDocuments(entry.body), ...allocatedDocuments(entity)]);
  const companyId = /^\/companies\/([^/]+)\//.exec(entry.path)?.[1];
  if (!companyId) return;
  for (const id of ids) {
    if (!outbox.hasQueuedAfter(id)) continue;
    const { data } = await api.GET('/companies/{companyId}/documents/{id}', { params: { path: { companyId, id } } });
    const version = (data as { version?: number } | undefined)?.version;
    if (typeof version !== 'number') continue;
    useRemoteMeta.getState().setVersion(id, version);
    outbox.rebase(id, version);
  }
}

/** Sends what's queued. True if the server asked for something to be sent again later. */
async function pushAll(session: number): Promise<boolean> {
  const tried = new Set<string>();
  let again = false;
  let size = BATCH;
  for (;;) {
    const batch = nextBatch(tried, size);
    if (!batch.length) return again;
    outbox.markSent(batch.map((e) => e.id));
    let data;
    try {
      ({ data } = await api.POST('/sync/push', {
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
      }));
    } catch (err) {
      // The server refused the whole request: narrow it down, so one bad entry can't hold up the rest.
      if (!(err instanceof ApiError) || ![400, 413, 422].includes(err.status)) throw err;
      if (batch.length > 1) {
        size = Math.ceil(batch.length / 2);
        continue;
      }
      assertSession(session);
      tried.add(batch[0].id);
      outbox.update(batch[0].id, { status: 'failed', attempts: batch[0].attempts + 1, lastError: err.message });
      report(batch[0].id, { kind: 'rejected', error: err.message }, batch[0].label);
      continue;
    }
    assertSession(session);
    batch.forEach((e) => tried.add(e.id));
    for (const r of data?.results ?? []) {
      const entry = batch.find((e) => e.id === r.id);
      if (!entry) continue;
      const entity = unwrap(r.entity);
      if (r.status === 'applied') {
        const serverId = typeof entity?.id === 'string' ? entity.id : undefined;
        if (entry.clientEntityId && serverId && serverId !== entry.clientEntityId) {
          remapIds({ [entry.clientEntityId]: serverId });
          if (entry.path === '/companies') {
            // Before the entry goes: if this fails, the resend gets the same answer and comes back here.
            await adoptCompanyDefaults(serverId);
            assertSession(session);
            purgeLocalDefaults(serverId);
          }
        }
        outbox.drop(entry.id);
        report(entry.id, { kind: 'applied', serverId });
        const entityId = entry.clientEntityId && serverId ? serverId : entry.entityId;
        const version = typeof entity?.version === 'number' ? entity.version : undefined;
        if (version !== undefined) {
          useRemoteMeta.getState().setVersion(entityId, version);
          outbox.rebase(entityId, version);
        }
        // Something newer is queued for it: the local copy stays until that's answered too.
        if (entity && entry.method !== 'DELETE' && !outbox.hasQueuedAfter(entityId)) applyEntity(entry.entityType, entity);
        if (entry.entityType === 'payment' && entry.method !== 'DELETE') {
          await rebaseAllocatedDocuments(entry, entity as Record<string, unknown> | undefined);
          assertSession(session);
        }
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
        report(entry.id, { kind: 'conflict', error: r.error?.detail ?? 'Changed on another device since you edited it' }, entry.label);
      } else {
        const error = r.error?.detail ?? r.error?.title ?? 'The server refused this change';
        outbox.update(entry.id, { status: 'failed', attempts: entry.attempts + 1, lastError: error });
        report(entry.id, { kind: 'rejected', error }, entry.label);
      }
    }
  }
}

/**
 * The cursor only moves forward, so a business joined on another device has its
 * history behind it. Anything new in the account's list gets its own snapshot.
 */
async function pullNewCompanies(started: number) {
  const { data: me } = await api.GET('/me');
  assertSession(started);
  const known = new Set(useAppStore.getState().companies.map((c) => c.id));
  for (const { id } of (me?.companies ?? []) as { id?: string }[]) {
    if (id && !known.has(id)) await pullCompany(id, started);
  }
}

/** One business's whole history, from the start; the main cursor stays where it is. */
async function pullCompany(companyId: string, started: number) {
  let since: string | undefined;
  for (;;) {
    const { data } = await api.GET('/sync/pull', { params: { query: { companyId, ...(since ? { since } : {}), limit: 500 } } });
    assertSession(started);
    applyChanges(data?.changes ?? []);
    since = data?.cursor ?? since;
    if (!data?.hasMore) break;
  }
}

/**
 * A plan opens more of a business (expenses on Pro). What the old plan
 * couldn't read came through the pull empty and was passed over, so a
 * business whose plan has changed is pulled again from the start.
 */
async function pullChangedPlans(started: number) {
  for (const c of useAppStore.getState().companies) {
    const seen = useRemoteMeta.getState().plans[c.id];
    if (seen === c.plan || !knownToServer(c.id)) continue;
    if (seen !== undefined) await pullCompany(c.id, started);
    const { plans, patch } = useRemoteMeta.getState();
    patch({ plans: { ...plans, [c.id]: c.plan } });
  }
}

async function pullAll(started = session) {
  const meta = useRemoteMeta.getState();
  let cursor = meta.cursor;
  for (;;) {
    const { data } = await api.GET('/sync/pull', { params: { query: { ...(cursor ? { since: cursor } : {}), limit: 500 } } });
    assertSession(started);
    applyChanges(data?.changes ?? []);
    cursor = data?.cursor ?? cursor;
    useRemoteMeta.getState().patch({ cursor });
    if (!data?.hasMore) return;
  }
}

/** Far beyond any real book (200 per page); only a server paging in a loop would reach it. */
const MAX_PAGES = 1000;

/**
 * Pages a list endpoint to the end. A newest-first list can stop early: `keep` says whether a row is
 * still wanted, and the first one that isn't ends the paging (notifications older than 90 days).
 */
export async function all<T>(fetchPage: (cursor?: string) => Promise<{ data?: T[]; nextCursor?: string | null } | undefined>, keep?: (row: T) => boolean): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchPage(cursor);
    const rows = page?.data ?? [];
    const cut = keep ? rows.findIndex((r) => !keep(r)) : -1;
    out.push(...(cut >= 0 ? rows.slice(0, cut) : rows));
    if (cut >= 0 || !page?.nextCursor) return out;
    cursor = page.nextCursor;
  }
  reportError(new Error(`A list stopped after ${MAX_PAGES} pages`), { source: 'sync.all' });
  return out;
}

/** Notifications and the audit trail on the device: the last 90 days. The server keeps the rest. */
const recent = (row: { createdAt?: string }) => !row.createdAt || Date.parse(row.createdAt) > Date.now() - 90 * 86_400_000;

/** A list the plan or role doesn't allow is simply left empty. */
async function allowed<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return fallback;
    throw err;
  }
}

async function refreshLists(started = session) {
  const companyId = useAppStore.getState().activeCompanyId;
  if (!companyId) return;
  const path = { companyId };
  const [notifications, audit, movements, devices, users, integrations] = await Promise.all([
    all((cursor) => api.GET('/companies/{companyId}/notifications', { params: { path, query: { limit: 200, cursor } } }).then((r) => r.data), recent),
    allowed(all((cursor) => api.GET('/companies/{companyId}/audit-events', { params: { path, query: { limit: 200, cursor } } }).then((r) => r.data), recent), []),
    allowed(all((cursor) => api.GET('/companies/{companyId}/stock/movements', { params: { path, query: { limit: 200, cursor } } }).then((r) => r.data)), []),
    api.GET('/me/devices').then((r) => r.data?.data ?? []),
    // Team members aren't in the change log until someone edits them.
    api.GET('/users').then((r) => r.data?.data ?? []),
    // The catalogue of providers: a business that has connected none has nothing in the change log.
    allowed(api.GET('/companies/{companyId}/integrations', { params: { path } }).then((r) => r.data?.data ?? []), []),
  ]);
  assertSession(started);
  replaceForCompany('notifications', companyId, notifications as never);
  replaceForCompany('auditEvents', companyId, audit as never);
  replaceForCompany('stockMovements', companyId, movements as never);
  // A person with a change still to send (an invite, an edit) keeps it on screen until it is answered.
  const s = useAppStore.getState();
  const unsent = new Set(s.syncQueue.filter((e) => e.status !== 'synced').map((e) => e.entityId));
  const kept = s.users.filter((u) => unsent.has(u.id));
  useAppStore.setState({ devices: devices as never, integrations: integrations as never, users: [...(users as typeof s.users).filter((u) => !unsent.has(u.id)), ...kept] });
  // Team members may not be in the change log, yet the server knows them: an edit is an update.
  const { setVersion } = useRemoteMeta.getState();
  for (const u of users as { id?: string; version?: number }[]) if (u.id && typeof u.version === 'number') setVersion(u.id, u.version);
}
