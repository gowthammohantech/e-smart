import { createApiClient } from '@esmart/api-client';
import { API_BASE_URL } from './config';
import { getTokens, setTokens } from './tokens';
import { uuid } from './uuid';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { useMfaGate } from '../features/security/mfaGateStore';
import { useUpdateGate } from '../features/session/updateGateStore';

/**
 * Every build names its version, so the server can turn away one it no longer serves. The web is
 * always the build just deployed, so it says so instead.
 */
const version = Platform.OS === 'web' ? 'web' : (Application.nativeApplicationVersion ?? 'unknown');

/** The typed API client. Only used in remote mode. A session held for an authenticator code raises the gate. */
export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getTokens,
  setTokens,
  idempotencyKey: uuid,
  headers: { 'X-App-Version': version },
  onProblem: (e) => {
    if (e.code === 'MFA_REQUIRED') useMfaGate.getState().require();
    if (e.code === 'APP_UPDATE_REQUIRED') useUpdateGate.getState().require(String((e.problem as { minVersion?: string }).minVersion ?? ''));
  },
});

/** A request that never reached the server (offline, DNS, refused). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && /network|fetch|timeout|abort/i.test(err.message) && !('status' in err));
}
