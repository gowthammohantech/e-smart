import { createApiClient } from '@esmart/api-client';
import { API_BASE_URL } from './config';
import { getTokens, setTokens } from './tokens';
import { uuid } from './uuid';
import { useMfaGate } from '../features/security/mfaGateStore';

/** The typed API client. Only used in remote mode. A session held for an authenticator code raises the gate. */
export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getTokens,
  setTokens,
  idempotencyKey: uuid,
  onProblem: (e) => {
    if (e.code === 'MFA_REQUIRED') useMfaGate.getState().require();
  },
});

/** A request that never reached the server (offline, DNS, refused). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && /network|fetch|timeout|abort/i.test(err.message) && !('status' in err));
}
