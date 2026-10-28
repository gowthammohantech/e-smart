import { useRemoteMeta } from './meta';
import * as outbox from './outbox';
import { syncNow, syncSoon } from './sync';
import { uuid } from './uuid';

/**
 * Back in line under a new id: the server keeps its answer to the old one and
 * would only repeat it. A conflict goes against the server's current version,
 * so "send mine again" replaces theirs instead of conflicting once more.
 */
function requeue(e: outbox.Entry) {
  outbox.update(e.id, {
    id: uuid(),
    status: 'pending',
    lastError: undefined,
    conflict: undefined,
    baseVersion: e.baseVersion === undefined ? undefined : (useRemoteMeta.getState().versions[e.entityId] ?? e.baseVersion),
  });
}

const requeueFailed = () => outbox.entries().filter((e) => e.status === 'failed').forEach(requeue);

/** Puts one failed or conflicted change back in line and syncs now (Settings → Sync). */
export function retrySync(id: string) {
  const entry = outbox.entries().find((e) => e.id === id);
  if (entry) requeue(entry);
  syncSoon(0);
}

/** Puts every failed change back in line and syncs now. */
export function retryFailed() {
  requeueFailed();
  syncSoon(0);
}

/** Settings → Sync now: failed changes are sent again too, not only pending ones. */
export function syncAll() {
  requeueFailed();
  return syncNow();
}
