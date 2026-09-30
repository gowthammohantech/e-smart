import type { SyncQueueEntry } from '@esmart/core/types';
import { useAppStore } from '../store/appStore';
import { COLLECTIONS, COMPANY_DEFAULTS, type CollectionKey } from './collections';
import { knownToServer, useRemoteMeta } from './meta';

type Row = Record<string, unknown>;

/** Every string equal to a key of `ids` becomes its value, at any depth. */
function rewrite<T>(value: T, ids: Map<string, string>): T {
  if (typeof value === 'string') return (ids.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((v) => rewrite(v, ids)) as T;
  if (value && typeof value === 'object') {
    const out: Row = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewrite(v, ids);
    return out as T;
  }
  return value;
}

/** `/companies/cmp_local/parties` → `/companies/cmp_server/parties`. */
function rewritePath(path: string, ids: Map<string, string>): string {
  return path
    .split('/')
    .map((seg) => ids.get(decodeURIComponent(seg)) ?? seg)
    .join('/');
}

/**
 * Swaps ids minted offline for the ones the server assigned, everywhere: in
 * every collection (references included), the active company and branch, the
 * signed-in user, and entries still waiting in the outbox.
 */
export function remapIds(map: Record<string, string>) {
  const ids = new Map(Object.entries(map).filter(([a, b]) => a !== b));
  if (!ids.size) return;
  const s = useAppStore.getState();
  const next: Row = {};
  for (const { collection } of Object.values(COLLECTIONS)) next[collection] = rewrite(s[collection] as unknown, ids);
  for (const key of ['stockMovements', 'notifications', 'auditEvents', 'devices'] as const) next[key] = rewrite(s[key] as unknown, ids);
  next.syncQueue = s.syncQueue.map((e: SyncQueueEntry) => ({
    ...e,
    entityId: ids.get(e.entityId) ?? e.entityId,
    path: e.path ? rewritePath(e.path, ids) : undefined,
    body: rewrite(e.body, ids),
  }));
  useAppStore.setState({
    ...next,
    activeCompanyId: ids.get(s.activeCompanyId) ?? s.activeCompanyId,
    activeBranchId: s.activeBranchId ? (ids.get(s.activeBranchId) ?? s.activeBranchId) : s.activeBranchId,
    session: { ...s.session, userId: s.session.userId ? (ids.get(s.session.userId) ?? s.session.userId) : null },
  } as never);
  const meta = useRemoteMeta.getState();
  for (const [from, to] of ids) {
    if (meta.versions[from] !== undefined) {
      meta.setVersion(to, meta.versions[from]);
      meta.forget(from);
    }
  }
}

/** Inserts or replaces a server copy in its collection. Unknown types are ignored. */
export function applyEntity(entityType: string, data: unknown) {
  const map = COLLECTIONS[entityType];
  if (!map || !data || typeof data !== 'object') return;
  const row = data as Row;
  const key = row[map.key];
  if (typeof key !== 'string') return;
  const list = useAppStore.getState()[map.collection] as Row[];
  const at = list.findIndex((r) => r[map.key] === key);
  const next = at >= 0 ? list.map((r, i) => (i === at ? { ...r, ...row } : r)) : [...list, row];
  useAppStore.setState({ [map.collection]: next } as never);
  if (typeof row.version === 'number' && typeof row.id === 'string') useRemoteMeta.getState().setVersion(row.id, row.version);
}

export function removeEntity(entityType: string, id: string) {
  const map = COLLECTIONS[entityType];
  if (!map) return;
  const list = useAppStore.getState()[map.collection] as Row[];
  useAppStore.setState({ [map.collection]: list.filter((r) => r[map.key] !== id) } as never);
  useRemoteMeta.getState().forget(id);
}

/** Replaces one collection's rows for a company with the server's list. */
export function replaceForCompany(collection: CollectionKey, companyId: string, rows: Row[]) {
  const list = useAppStore.getState()[collection] as Row[];
  useAppStore.setState({ [collection]: [...list.filter((r) => r.companyId !== companyId), ...rows] } as never);
}

/**
 * A company created offline got local copies of its defaults (branch,
 * series, tax categories…). The server made its own when the create synced,
 * and the next pull brings them, so drop the local ones it never saw.
 */
export function purgeLocalDefaults(companyId: string) {
  const s = useAppStore.getState();
  const next: Row = {};
  for (const collection of COMPANY_DEFAULTS) {
    next[collection] = (s[collection] as Row[]).filter((r) => r.companyId !== companyId || knownToServer(String(r.id ?? r.companyId)));
  }
  useAppStore.setState(next as never);
}

/**
 * The entity inside a push result. Most operations answer with the entity
 * itself; finalise answers `{ document, compliance }`, e-way bill operations
 * `{ ewayBill }` and connect `{ integration }`.
 */
export function unwrap(entity: unknown): Row | undefined {
  if (!entity || typeof entity !== 'object') return undefined;
  const e = entity as Row;
  for (const k of ['document', 'ewayBill', 'integration']) if (e[k] && typeof e[k] === 'object') return e[k] as Row;
  return e;
}
