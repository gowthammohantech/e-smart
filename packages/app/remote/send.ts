import { ApiError } from '@esmart/api-client';
import { api, isNetworkError } from './api';
import { applyEntity, remapIds, unwrap } from './apply';
import { useRemoteMeta } from './meta';
import { reportError } from '../lib/reporter';
import * as outbox from './outbox';

/** What became of one change sent to the server. */
export type Outcome =
  | { kind: 'applied'; serverId?: string }
  | { kind: 'rejected' | 'conflict'; error: string; code?: string }
  | { kind: 'unreachable' };

type Row = Record<string, unknown>;
type Method = outbox.Method;
type Init = { body?: unknown; headers?: Record<string, string> };
type Caller = (path: string, init: Init) => Promise<{ data?: unknown }>;

/** One request against any route. The path is already filled in, so the client's typed paths don't apply. */
function call(method: Method | 'GET', path: string, init: Init = {}): Promise<{ data?: unknown }> {
  return (api as unknown as Record<string, Caller>)[method](path, init);
}

/** A list the plan or role doesn't allow is simply left empty. */
export async function allowed<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return fallback;
    throw err;
  }
}

/** The documents a payment's body (or the server's copy of it) allocates to. */
function allocatedDocuments(body: unknown): string[] {
  const allocations = (body as { allocations?: { documentId?: string }[] } | null | undefined)?.allocations ?? [];
  return allocations.map((a) => a.documentId).filter((id): id is string => typeof id === 'string');
}

/**
 * A payment moves the invoices it pays on a version. A change to one of them later in the same save
 * was made on the old one and would come back as a conflict with nobody's edit: give it the new one.
 */
async function rebaseAllocatedDocuments(entry: outbox.Entry, entity: Row | undefined) {
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

/** What the server said, as a refusal a person can read. */
function refusal(err: ApiError): Outcome {
  const detail = err.problem.detail ?? err.problem.title ?? err.message;
  return { kind: 'rejected', error: detail, ...(err.code && { code: err.code }) };
}

/** Sends one change straight to its route and applies the server's answer to the store. */
async function sendOne(entry: outbox.Entry): Promise<Outcome> {
  const headers: Record<string, string> = {};
  // Its own id as the key: a retry of the same change is answered, not applied twice.
  if (entry.method === 'POST') headers['Idempotency-Key'] = entry.id;
  if (entry.baseVersion !== undefined) headers['If-Match'] = `"v${entry.baseVersion}"`;
  const body = entry.body === undefined ? (entry.method === 'POST' ? {} : undefined) : entry.body;
  let data: unknown;
  try {
    ({ data } = await call(entry.method, entry.path, { body, headers }));
  } catch (err) {
    if (isNetworkError(err)) return { kind: 'unreachable' };
    if (!(err instanceof ApiError)) return { kind: 'rejected', error: err instanceof Error ? err.message : String(err) };
    if (err.status === 412) {
      // Changed elsewhere since it was read: show the server's copy, and say so.
      const current = entry.method === 'POST' ? undefined : await call('GET', entry.path).catch(() => undefined);
      const entity = unwrap(current?.data);
      if (entity) applyEntity(entry.entityType, entity);
      return { kind: 'conflict', error: err.problem.detail ?? 'Changed on another device since you edited it', code: err.code };
    }
    return refusal(err);
  }
  const entity = unwrap(data);
  const serverId = typeof entity?.id === 'string' ? entity.id : undefined;
  if (entry.clientEntityId && serverId && serverId !== entry.clientEntityId) {
    remapIds({ [entry.clientEntityId]: serverId });
  }
  outbox.drop(entry.id);
  const entityId = entry.clientEntityId && serverId ? serverId : entry.entityId;
  const version = typeof entity?.version === 'number' ? entity.version : undefined;
  if (version !== undefined) {
    useRemoteMeta.getState().setVersion(entityId, version);
    outbox.rebase(entityId, version);
  }
  if (entity && entry.method !== 'DELETE' && !outbox.hasQueuedAfter(entityId)) applyEntity(entry.entityType, entity);
  if (entry.entityType === 'payment' && entry.method !== 'DELETE') {
    // Saved already: a failed refresh of the documents it settles is caught up by the next pull.
    await rebaseAllocatedDocuments(entry, entity).catch((err: unknown) => reportError(err, { source: 'rebaseAllocatedDocuments' }));
  }
  return { kind: 'applied', serverId };
}

/**
 * Sends these changes in order, each to its own route. Ids the server assigns to something created
 * early in the list are swapped into what follows before it goes (remapIds rewrites the outbox). The
 * first change that doesn't go through stops the rest: they were made on top of it.
 */
export function sendEntries(ids: string[]): Promise<Map<string, Outcome>> {
  ids.forEach((id) => inFlight.add(id));
  // One save at a time, in the order they were made: a change made while an earlier create is still
  // out waits for it, and goes with the server's id that create brings back.
  const run = turn.then(() => sendInOrder(ids)).finally(() => ids.forEach((id) => inFlight.delete(id)));
  turn = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

let turn: Promise<void> = Promise.resolve();

/** Changes a save is sending right now; a drain leaves them to it. */
const inFlight = new Set<string>();

/**
 * Changes an earlier, offline-first build of the app left on this device: sent once now, in order.
 * One the server refuses is dropped. Nothing is ever left waiting again.
 */
export async function drainLeftovers(): Promise<void> {
  const left = outbox.entries().filter((e) => !inFlight.has(e.id) && e.status !== 'synced');
  if (!left.length) return;
  const outcomes = await sendEntries(left.map((e) => e.id));
  if ([...outcomes.values()].some((o) => o.kind === 'unreachable')) return;
  outbox.dropAll(left.map((e) => e.id).filter((id) => outcomes.get(id)?.kind !== 'applied'));
}

async function sendInOrder(ids: string[]): Promise<Map<string, Outcome>> {
  const out = new Map<string, Outcome>();
  for (const id of ids) {
    const entry = outbox.entries().find((e) => e.id === id);
    if (!entry) continue;
    const outcome = await sendOne(entry);
    out.set(id, outcome);
    if (outcome.kind !== 'applied') {
      for (const rest of ids) if (!out.has(rest)) out.set(rest, outcome.kind === 'unreachable' ? outcome : { kind: 'rejected', error: 'Not sent: an earlier change was refused' });
      break;
    }
  }
  return out;
}
