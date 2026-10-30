import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * When a change replayed from an offline queue was made on the device. Carried
 * through the internal request rather than a header, so a client can't claim it.
 */
export const replayQueuedAt = new AsyncLocalStorage<Date>();
