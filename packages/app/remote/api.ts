import { createApiClient } from '@esmart/api-client';
import { API_BASE_URL } from './config';
import { getTokens, setTokens } from './tokens';
import { uuid } from './uuid';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { useMfaGate } from '../features/security/mfaGateStore';
import { useUpdateGate } from '../features/session/updateGateStore';

/** Native builds name their version, so the server can turn away one it no longer serves. The web is always current. */
const version = Platform.OS === 'web' ? null : Application.nativeApplicationVersion;

/** The typed API client. Only used in remote mode. A session held for an authenticator code raises the gate. */
export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getTokens,
  setTokens,
  idempotencyKey: uuid,
  headers: version ? { 'X-App-Version': version } : undefined,
  onProblem: (e) => {
    if (e.code === 'MFA_REQUIRED') useMfaGate.getState().require();
    if (e.code === 'APP_UPDATE_REQUIRED') useUpdateGate.getState().require(String((e.problem as { minVersion?: string }).minVersion ?? ''));
  },
});

/** A request that never reached the server (offline, DNS, refused). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && /network|fetch|timeout|abort/i.test(err.message) && !('status' in err));
}
