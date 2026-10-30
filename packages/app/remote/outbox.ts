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
  return entries().find((e) => e.clientEntityId === entityId && e.method === 'POST' && e.status === 'pending' && !e.sentAt);
}

/** The create for an entity minted offline, sent or not, while it can still go through. */
export function openCreate(entityId: string): Entry | undefined {
  return entries().find((e) => e.clientEntityId === entityId && e.method === 'POST' && e.status === 'pending');
}

function failedCreate(entityId: string): Entry | undefined {
  return entries().find((e) => e.clientEntityId === entityId && e.method === 'POST' && e.status === 'failed');
}

function replace(id: string, patch: Partial<Entry>) {
  write(useAppStore.getState().syncQueue.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  listeners();
}

/**
 * Create-or-update. Something the server hasn't seen yet is a POST carrying
 * its offline id; a second edit before that POST is sent just rewrites it.
 * Something the server knows is a PUT (or PATCH) against the version we have,
 * and consecutive unsent edits collapse into one. An entry already sent keeps
 * its body, since the server answers a resend from what it first received: the
 * edit goes behind it as an update. So does an edit of a convert or duplicate,
 * whose body is the action's and not the document.
 */
export function upsert(o: { entityType: string; id: string; collectionPath: string; itemPath: string; body: unknown; label: string; updateMethod?: 'PUT' | 'PATCH' }) {
  const method = o.updateMethod ?? 'PUT';
  const create = pendingCreate(o.id);
  if (create?.path === o.collectionPath) return replace(create.id, { body: o.body, label: o.label });
  const failed = failedCreate(o.id);
  // A new id: the server keeps its refusal of the old one and would only repeat it.
  if (failed?.path === o.collectionPath) return replace(failed.id, { id: uuid(), status: 'pending', sentAt: undefined, lastError: undefined, body: o.body, label: o.label });
  if (create || failed || openCreate(o.id)) {
    return push({ method, path: o.itemPath, body: o.body, entityType: o.entityType, entityId: o.id, label: o.label });
  }
  if (!knownToServer(o.id)) {
    return push({ method: 'POST', path: o.collectionPath, body: o.body, entityType: o.entityType, entityId: o.id, label: o.label, clientEntityId: o.id });
  }
  const queued = entries().find((e) => e.entityId === o.id && e.method === method && e.path === o.itemPath && e.status === 'pending' && !e.sentAt);
  if (queued) return replace(queued.id, { body: o.body, label: o.label });
  push({ method, path: o.itemPath, body: o.body, entityType: o.entityType, entityId: o.id, label: o.label, baseVersion: useRemoteMeta.getState().versions[o.id] });
}

/**
 * Delete. If the server never saw the entity, nothing needs sending: its
 * create and every queued change to it are dropped instead.
 */
export function remove(o: { entityType: string; id: string; itemPath: string; label: string }) {
  if (pendingCreate(o.id) || failedCreate(o.id)) {
    write(useAppStore.getState().syncQueue.filter((e) => e.entityId !== o.id));
    listeners();
    return;
  }
  write(useAppStore.getState().syncQueue.filter((e) => !(e.entityId === o.id && e.status === 'pending' && !e.sentAt && (e.method === 'PUT' || e.method === 'PATCH'))));
  push({ method: 'DELETE', path: o.itemPath, entityType: o.entityType, entityId: o.id, label: o.label, baseVersion: useRemoteMeta.getState().versions[o.id] });
}

/** A one-off operation (finalise, convert, mark read, a singleton PUT…). Never coalesced. */
export function action(o: New) {
  push(o);
}

export function update(id: string, patch: Partial<Entry>) {
  replace(id, patch);
}

/** Noted before the request goes out, so nothing folds into it from here on. */
export function markSent(ids: string[]) {
  const at = new Date().toISOString();
  write(useAppStore.getState().syncQueue.map((e) => (ids.includes(e.id) ? { ...e, sentAt: e.sentAt ?? at } : e)));
}

/** Whether a change to this entity is still waiting behind one the server just answered. */
export function hasQueuedAfter(entityId: string): boolean {
  return entries().some((e) => e.entityId === entityId && e.status === 'pending');
}

/** The server applied this device's own write: what's queued behind it builds on the new version. */
export function rebase(entityId: string, version: number) {
  write(useAppStore.getState().syncQueue.map((e) => (e.entityId === entityId && e.status === 'pending' && e.baseVersion !== undefined ? { ...e, baseVersion: version } : e)));
}

export function drop(id: string) {
  write(useAppStore.getState().syncQueue.filter((e) => e.id !== id));
  listeners();
}
