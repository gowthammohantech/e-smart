import { randomBytes } from 'node:crypto';

/**
 * Marks requests the server makes to itself (sync replays through
 * `server.inject`). The value is a per-process secret, so a client can't
 * forge it; the rate limiter skips these because the outer /sync request
 * was already counted.
 */
export const INTERNAL_HEADER = 'x-esmart-internal';
export const INTERNAL_TOKEN = randomBytes(24).toString('base64url');
