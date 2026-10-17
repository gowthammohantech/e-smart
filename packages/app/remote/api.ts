import { createApiClient } from '@esmart/api-client';
import { API_BASE_URL } from './config';
import { getTokens, setTokens } from './tokens';
import { uuid } from './uuid';

/** The typed API client. Only used in remote mode. */
export const api = createApiClient({ baseUrl: API_BASE_URL, getTokens, setTokens, idempotencyKey: uuid });

/** A request that never reached the server (offline, DNS, refused). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && /network|fetch|timeout|abort/i.test(err.message) && !('status' in err));
}
