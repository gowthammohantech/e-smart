import { useAppStore } from '../store/appStore';
import { reportError } from '../lib/reporter';
import { api, isNetworkError } from './api';
import { applyChanges, replaceForCompany } from './apply';
import { refreshLogoLinks } from './logo';
import { useRemoteMeta } from './meta';
import { allowed, drainLeftovers } from './send';

/**
 * Keeps the in-memory books current. Nothing is kept on the device: signing in, opening the app and
 * switching business load the open business's setup (branches, tax rates, series, accounts…) from
 * each entity's own list; screens read everything else from the server as they open. One run at a
 * time; asking while one is going returns that one, and runs again after it.
 */
let running: Promise<void> | null = null;
let again = false;
/** Moves on at sign-out. An answer to a request from an earlier session is dropped, not applied. */
let session = 0;
class SessionEnded extends Error {}
function assertSession(started: number) {
  if (started !== session) throw new SessionEnded();
}

export function endRefreshSession() {
  session += 1;
}

/** Far beyond any real list (200 per page); only a server paging in a loop would reach it. */
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
  reportError(new Error(`A list stopped after ${MAX_PAGES} pages`), { source: 'refresh.all' });
  return out;
}

type Row = { id?: string; version?: number; [k: string]: unknown };
type Page = { data?: Row[]; nextCursor?: string | null };
type Getter = (path: string, init: { params: { path: { companyId: string }; query?: Record<string, unknown> } }) => Promise<{ data?: unknown }>;
const get = api.GET as unknown as Getter;

/** The setup a business needs on screen at all, by entity type, and the list it comes from. */
const SETUP_LISTS: [entityType: string, path: string][] = [
  ['branch', '/companies/{companyId}/branches'],
  ['tax_category', '/companies/{companyId}/tax-categories'],
  ['expense_category', '/companies/{companyId}/expense-categories'],
  ['item_category', '/companies/{companyId}/item-categories'],
  ['brand', '/companies/{companyId}/brands'],
  ['custom_field', '/companies/{companyId}/custom-fields'],
  ['vehicle', '/companies/{companyId}/vehicles'],
  ['voucher_template', '/companies/{companyId}/voucher-templates'],
  ['payment_account', '/companies/{companyId}/payment-accounts'],
  ['exchange_rate', '/companies/{companyId}/exchange-rates'],
  ['transporter', '/companies/{companyId}/transporters'],
  ['numbering_series', '/companies/{companyId}/numbering-series'],
  ['ledger_account', '/companies/{companyId}/ledger-accounts'],
  ['cost_centre', '/companies/{companyId}/cost-centres'],
  ['integration', '/companies/{companyId}/integrations'],
];

/** One list, every page. One the plan or role doesn't open comes back empty. */
function setupList(companyId: string, path: string): Promise<Row[]> {
  return allowed(
    all<Row>((cursor) => get(path, { params: { path: { companyId }, query: { limit: 200, ...(cursor ? { cursor } : {}) } } }).then((r) => r.data as Page | undefined)),
    [],
  );
}

/**
 * Loads one business's setup from the server, replacing what was in memory for it. Everything is
 * fetched first, so a load that fails part-way leaves the business as it was.
 */
export async function loadCompany(companyId: string, started = session): Promise<void> {
  const [lists, compliance] = await Promise.all([
    Promise.all(SETUP_LISTS.map(([type, path]) => setupList(companyId, path).then((rows) => [type, rows] as const))),
    allowed(
      get('/companies/{companyId}/compliance-settings', { params: { path: { companyId } } }).then((r) => r.data as Row | undefined),
      undefined,
    ),
  ]);
  assertSession(started);
  // What the server no longer has goes: each list is the whole of it. One write per collection.
  const s = useAppStore.getState() as unknown as Record<string, Row[]>;
  const next: Record<string, Row[]> = {};
  const { setVersion } = useRemoteMeta.getState();
  for (const [entityType, rows] of lists) {
    const collection = COLLECTION_OF[entityType];
    next[collection] = [...s[collection].filter((r) => r.companyId !== companyId), ...rows.map((r) => ({ ...r, companyId: r.companyId ?? companyId }))];
    for (const r of rows) if (r.id && typeof r.version === 'number') setVersion(r.id, r.version);
  }
  if (compliance) next.complianceSettings = [...s.complianceSettings.filter((r) => r.companyId !== companyId), { ...compliance, companyId }];
  useAppStore.setState(next as never);
}

const COLLECTION_OF: Record<string, string> = {
  branch: 'branches',
  tax_category: 'taxCategories',
  expense_category: 'expenseCategories',
  item_category: 'itemCategories',
  brand: 'brands',
  custom_field: 'customFields',
  vehicle: 'vehicles',
  voucher_template: 'voucherTemplates',
  payment_account: 'paymentAccounts',
  exchange_rate: 'exchangeRates',
  transporter: 'transporters',
  numbering_series: 'numberingSeries',
  ledger_account: 'ledgerAccounts',
  cost_centre: 'costCentres',
  integration: 'integrations',
};

/** The businesses this person can open, as the server lists them now. One no longer listed goes. */
async function loadCompanies(started: number) {
  const { data: me } = await api.GET('/me');
  assertSession(started);
  if (!Array.isArray(me?.companies)) return;
  const listed = me.companies as Row[];
  const ids = new Set(listed.map((c) => c.id));
  for (const c of useAppStore.getState().companies) if (!ids.has(c.id)) useAppStore.getState().forgetCompany(c.id);
  applyChanges(listed.filter((c) => c.id).map((c) => ({ entityType: 'company', entityId: c.id!, op: 'upsert', data: c })));
}

/** Notifications on the device: the last 90 days. The server keeps the rest. */
const recent = (row: { createdAt?: string }) => !row.createdAt || Date.parse(row.createdAt) > Date.now() - 90 * 86_400_000;
/** Stock movements of the last weeks only: screens read the ledger from the server. */
const RECENT_DAYS = 30;

async function refreshLists(started = session) {
  const companyId = useAppStore.getState().activeCompanyId;
  if (!companyId) return;
  const path = { companyId };
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const [notifications, movements, devices, users] = await Promise.all([
    all((cursor) => api.GET('/companies/{companyId}/notifications', { params: { path, query: { limit: 200, cursor } } }).then((r) => r.data), recent),
    allowed(all((cursor) => api.GET('/companies/{companyId}/stock/movements', { params: { path, query: { from: since, limit: 200, cursor } } }).then((r) => r.data)), []),
    api.GET('/me/devices').then((r) => r.data?.data ?? []),
    api.GET('/users').then((r) => r.data?.data ?? []),
  ]);
  assertSession(started);
  replaceForCompany('notifications', companyId, notifications as never);
  replaceForCompany('stockMovements', companyId, movements as never);
  useAppStore.setState({ devices: devices as never, users: users as never });
  const { setVersion } = useRemoteMeta.getState();
  for (const u of users as Row[]) if (u.id && typeof u.version === 'number') setVersion(u.id, u.version);
}

/** The open business has a branch to work in: the primary one, unless one was chosen. */
function pickBranch() {
  const s = useAppStore.getState();
  if (!s.activeCompanyId || s.branches.some((b) => b.id === s.activeBranchId && b.companyId === s.activeCompanyId)) return;
  const branches = s.branches.filter((b) => b.companyId === s.activeCompanyId);
  useAppStore.setState({ activeBranchId: (branches.find((b) => b.isPrimary) ?? branches[0])?.id ?? '' });
}

/** After a run that couldn't reach the server, try again by itself: 5s, 10s, 20s… up to a minute. */
const RETRY_MIN_MS = 5_000;
const RETRY_MAX_MS = 60_000;
let retryIn = RETRY_MIN_MS;
let retry: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry() {
  if (retry) return;
  retry = setTimeout(() => {
    retry = null;
    void refreshNow();
  }, retryIn);
  retryIn = Math.min(retryIn * 2, RETRY_MAX_MS);
}

function clearRetry() {
  if (retry) clearTimeout(retry);
  retry = null;
  retryIn = RETRY_MIN_MS;
}

async function runOnce() {
  const started = session;
  if (!useAppStore.getState().session.authenticated) return;
  const meta = useRemoteMeta.getState();
  meta.patch({ syncing: true });
  try {
    // What an older build left on this device goes first; saves made here go straight away (send.ts).
    await drainLeftovers();
    await loadCompanies(started);
    const companyId = useAppStore.getState().activeCompanyId;
    if (companyId) await loadCompany(companyId, started);
    pickBranch();
    await refreshLists(started);
    // Best effort: a logo link that can't refresh now is tried again on the next run.
    await refreshLogoLinks().catch(() => undefined);
    useRemoteMeta.getState().patch({ online: true, lastSyncAt: new Date().toISOString(), lastError: undefined });
    clearRetry();
  } catch (err) {
    if (err instanceof SessionEnded) return;
    if (isNetworkError(err)) {
      useRemoteMeta.getState().patch({ online: false });
      scheduleRetry();
    } else useRemoteMeta.getState().patch({ lastError: err instanceof Error ? err.message : String(err) });
  } finally {
    useRemoteMeta.getState().patch({ syncing: false });
  }
}

/** Loads what the open business needs from the server now. */
export function refreshNow(): Promise<void> {
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

let soon: ReturnType<typeof setTimeout> | null = null;
/** Coalesces a burst of asks into one run shortly after the last. */
export function refreshSoon(delayMs = 400) {
  if (soon) clearTimeout(soon);
  soon = setTimeout(() => {
    soon = null;
    void refreshNow();
  }, delayMs);
}

/** Seen at most this often when screens are opened: fresh, yet light when moving around quickly. */
const FOCUS_REFRESH_MS = 30_000;
let lastFocusRefresh = 0;

/** A screen opened while online shows the setup as the server has it now. */
export function refreshOnFocus() {
  if (!useRemoteMeta.getState().online || Date.now() - lastFocusRefresh < FOCUS_REFRESH_MS) return;
  lastFocusRefresh = Date.now();
  refreshSoon(0);
}

/** A business switched to loads its setup at once. */
let watching = false;
export function watchActiveCompany() {
  if (watching) return;
  watching = true;
  let last = useAppStore.getState().activeCompanyId;
  useAppStore.subscribe((s) => {
    if (s.activeCompanyId === last) return;
    last = s.activeCompanyId;
    if (s.activeCompanyId && s.session.authenticated) refreshSoon(0);
  });
}
