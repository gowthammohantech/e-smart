import * as outbox from './outbox';
import { syncSoon } from './sync';

/** Puts one failed or conflicted change back in line and syncs now (Settings → Sync). */
export function retrySync(id: string) {
  outbox.update(id, { status: 'pending', lastError: undefined, conflict: undefined });
  syncSoon(0);
}

/** Puts every failed change back in line and syncs now. */
export function retryFailed() {
  for (const e of outbox.entries()) if (e.status === 'failed') outbox.update(e.id, { status: 'pending', lastError: undefined, conflict: undefined });
  syncSoon(0);
}
