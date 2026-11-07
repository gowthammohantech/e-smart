import { ApiError } from '@esmart/api-client';
import { useAppStore } from '../store/appStore';
import { RECENT_DAYS, SETUP_ENTITY_TYPES } from './collections';
import { api, isNetworkError } from './api';
import { reportError } from '../lib/reporter';
import { applyChanges, replaceForCompany, type Change } from './apply';
import { drainLeftovers } from './send';
import { flushPendingLogos, refreshLogoLinks } from './logo';
import { uploadAttachment } from './attachments';
import { knownToServer, useRemoteMeta } from './meta';
import { useReceiptQueue } from './receiptQueue';
import i18n from '@esmart/i18n';

/** After this many failed attempts with the server reachable, a picked receipt is given up on. */
const MAX_RECEIPT_TRIES = 5;

/**
 * The refresh engine. One run: send anything an older build left queued, pull what changed on
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

/** Told when a receipt picked earlier is given up on, with what it was for. */
export const onRefusedLater = new Set<(label: string, error: string) => void>();

export function endSyncSession() {
  session += 1;
}

/**
 * Replaces the book with the server's; `replace` empties it. Everything is fetched
 * first, so a reload that can't reach the server leaves the book as it was.
 */
export async function reloadSnapshot(replace: () => void) {
  await running?.catch(() => undefined);
  const changes: Change[] = [];
  let cursor: string | undefined;
  for (;;) {
    const { data } = await api.GET('/sync/pull', { params: { query: { ...(cursor ? { since: cursor } : {}), ...narrowed(cursor), limit: 500 } } });
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

/**
 * A snapshot (no cursor yet, or one of its later pages) brings the setup in full and anything else
 * only if it changed lately; changes after a cursor always come in full.
 */
function narrowed(cursor: string | null | undefined) {
  if (cursor && !cursor.startsWith('s:')) return {};
  return { entityTypes: SETUP_ENTITY_TYPES, changedSince: new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString() };
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
  if (!useAppStore.getState().session.authenticated) return;
  meta.patch({ syncing: true });
  try {
    // Saves go straight to the server (send.ts); only what an older build left here is sent now.
    await drainLeftovers();
    assertSession(started);
    // A logo picked during setup goes up once its business exists on the server.
    await flushPendingLogos();
    await flushPendingReceipts(started);
    await pullNewCompanies(started);
    await pullAll(started);
    await pullChangedPlans(started);
    await refreshLists(started);
    // Best effort: a logo link that can't refresh now is retried on the next run.
    await refreshLogoLinks().catch(() => undefined);
    meta.patch({ online: true, lastSyncAt: new Date().toISOString(), lastError: undefined });
    // Signing in waits only for the open business's branches; if that read failed, pick one now.
    const s = useAppStore.getState();
    if (s.activeCompanyId && !s.activeBranchId) {
      const branches = s.branches.filter((b) => b.companyId === s.activeCompanyId);
      const branch = branches.find((b) => b.isPrimary) ?? branches[0];
      if (branch) useAppStore.setState({ activeBranchId: branch.id });
    }
    clearRetry();
  } catch (err) {
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
 * The cursor only moves forward, so a business joined on another device has its
 * history behind it. Anything new in the account's list gets its own snapshot.
 */
async function pullNewCompanies(started: number) {
  const { data: me } = await api.GET('/me');
  assertSession(started);
  // Only a real list says what's gone; an answer without one changes nothing here.
  if (!Array.isArray(me?.companies)) return;
  const listed = new Set((me.companies as { id?: string }[]).map((c) => c.id));
  // Archived, or no longer theirs to open: it goes from this device too. One made here and not yet
  // sent isn't on the server's list either, so it stays.
  for (const c of useAppStore.getState().companies) {
    if (!listed.has(c.id) && knownToServer(c.id)) useAppStore.getState().forgetCompany(c.id);
  }
  const known = new Set(useAppStore.getState().companies.map((c) => c.id));
  for (const id of listed) {
    if (id && !known.has(id)) await pullCompany(id, started);
  }
}

/** One business's whole history, from the start; the main cursor stays where it is. */
async function pullCompany(companyId: string, started: number) {
  let since: string | undefined;
  for (;;) {
    const { data } = await api.GET('/sync/pull', { params: { query: { companyId, ...(since ? { since } : {}), ...narrowed(since), limit: 500 } } });
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
    const { data } = await api.GET('/sync/pull', { params: { query: { ...(cursor ? { since: cursor } : {}), ...narrowed(cursor), limit: 500 } } });
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

/** Notifications on the device: the last 90 days. The server keeps the rest. */
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
  // Stock movements of the last weeks only: screens read the ledger from the server. The audit trail
  // isn't kept on the device at all; its screen pages it from the server.
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const [notifications, movements, devices, users, integrations] = await Promise.all([
    all((cursor) => api.GET('/companies/{companyId}/notifications', { params: { path, query: { limit: 200, cursor } } }).then((r) => r.data), recent),
    allowed(all((cursor) => api.GET('/companies/{companyId}/stock/movements', { params: { path, query: { from: since, limit: 200, cursor } } }).then((r) => r.data)), []),
    api.GET('/me/devices').then((r) => r.data?.data ?? []),
    // Team members aren't in the change log until someone edits them.
    api.GET('/users').then((r) => r.data?.data ?? []),
    // The catalogue of providers: a business that has connected none has nothing in the change log.
    allowed(api.GET('/companies/{companyId}/integrations', { params: { path } }).then((r) => r.data?.data ?? []), []),
  ]);
  assertSession(started);
  replaceForCompany('notifications', companyId, notifications as never);
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
