import type { SyncQueueEntry } from '@esmart/core/types';
import { useAppStore } from '../store/appStore';
import { knownToServer, useRemoteMeta } from './meta';
import { uuid } from './uuid';

export type Method = 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Entry = SyncQueueEntry & { method: Method; path: string };

/** Entries still to send: pending, or failed and waiting for a retry. */
export const isOpen = (e: SyncQueueEntry) => e.status !== 'synced';
const hasMutation = (e: SyncQueueEntry): e is Entry => !!e.method && !!e.path;

export function entries(): Entry[] {
  return useAppStore.getState().syncQueue.filter(hasMutation);
}

function write(next: SyncQueueEntry[]) {
  useAppStore.setState({ syncQueue: next });
}

function listeners() {
  onEnqueue.forEach((l) => l());
}
/** The sync engine subscribes, to push soon after a change. */
export const onEnqueue = new Set<() => void>();

type New = { method: Method; path: string; body?: unknown; entityType: string; entityId: string; label: string; clientEntityId?: string; baseVersion?: number };

export function push(n: New) {
  const entry: Entry = {
    id: uuid(),
    label: n.label,
    entityType: n.entityType,
    entityId: n.entityId,
    action: n.method === 'DELETE' ? 'delete' : n.method === 'POST' ? (n.clientEntityId ? 'create' : 'action') : 'update',
    status: 'pending',
    attempts: 0,
    queuedAt: new Date().toISOString(),
    method: n.method,
    path: n.path,
    body: n.body,
    baseVersion: n.baseVersion,
    clientEntityId: n.clientEntityId,
  };
  write([...useAppStore.getState().syncQueue, entry]);
  listeners();
}

/** The not-yet-sent create for an entity minted offline. */
export function pendingCreate(entityId: string): Entry | undefined {
  return entries().find((e) => e.clientEntityId === entityId && e.method === 'POST' && e.status === 'pending');
}

function replace(id: string, patch: Partial<Entry>) {
  write(useAppStore.getState().syncQueue.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  listeners();
}

/**
 * Create-or-update. Something the server hasn't seen yet is a POST carrying
 * its offline id; a second edit before that POST is sent just rewrites it.
 * Something the server knows is a PUT (or PATCH) against the version we have,
 * and consecutive unsent edits collapse into one.
 */
export function upsert(o: { entityType: string; id: string; collectionPath: string; itemPath: string; body: unknown; label: string; updateMethod?: 'PUT' | 'PATCH' }) {
  const create = pendingCreate(o.id);
  if (create) return replace(create.id, { body: o.body, label: o.label });
  if (!knownToServer(o.id)) {
    return push({ method: 'POST', path: o.collectionPath, body: o.body, entityType: o.entityType, entityId: o.id, label: o.label, clientEntityId: o.id });
  }
  const method = o.updateMethod ?? 'PUT';
  const queued = entries().find((e) => e.entityId === o.id && e.method === method && e.path === o.itemPath && e.status === 'pending');
  if (queued) return replace(queued.id, { body: o.body, label: o.label });
  push({ method, path: o.itemPath, body: o.body, entityType: o.entityType, entityId: o.id, label: o.label, baseVersion: useRemoteMeta.getState().versions[o.id] });
}

/**
 * Delete. If the server never saw the entity, nothing needs sending: its
 * create and every queued change to it are dropped instead.
 */
export function remove(o: { entityType: string; id: string; itemPath: string; label: string }) {
  if (pendingCreate(o.id)) {
    write(useAppStore.getState().syncQueue.filter((e) => !(e.entityId === o.id && e.status === 'pending')));
    listeners();
    return;
  }
  write(useAppStore.getState().syncQueue.filter((e) => !(e.entityId === o.id && e.status === 'pending' && (e.method === 'PUT' || e.method === 'PATCH'))));
  push({ method: 'DELETE', path: o.itemPath, entityType: o.entityType, entityId: o.id, label: o.label, baseVersion: useRemoteMeta.getState().versions[o.id] });
}

/** A one-off operation (finalise, convert, mark read, a singleton PUT…). Never coalesced. */
export function action(o: New) {
  push(o);
}

export function update(id: string, patch: Partial<Entry>) {
  replace(id, patch);
}

export function drop(id: string) {
  write(useAppStore.getState().syncQueue.filter((e) => e.id !== id));
  listeners();
}
