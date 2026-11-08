import { ApiError } from '@esmart/api-client';
import { MfaCancelled } from '../../features/security/mfaGateStore';
import { RemoteError } from '../errors';
import { sessionEnded } from '../session';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
jest.mock('../config', () => ({ API_BASE_URL: 'http://api.test/v1', DEMO_LOGIN: { email: '', password: '' } }));
jest.mock('../api', () => ({
  api: { GET: jest.fn(), POST: jest.fn(), PUT: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() },
  isNetworkError: (e: unknown) => e instanceof TypeError,
}));

const problem = (status: number, code?: string) => new ApiError(status, { status, code, title: 'x' } as never);

describe('a failed launch', () => {
  it('signs out only when the server refused the session', () => {
    expect(sessionEnded(problem(401, 'SESSION_REVOKED'))).toBe(true);
    expect(sessionEnded(problem(403, 'ACCOUNT_SUSPENDED'))).toBe(true);
    expect(sessionEnded(new MfaCancelled())).toBe(true);
    expect(sessionEnded(new RemoteError('incompleteSession', 'no user'))).toBe(true);
  });

  it('keeps the session through a deploy, a rate limit, an update gate or the authenticator prompt', () => {
    for (const err of [problem(502), problem(503), problem(500), problem(429), problem(426, 'APP_UPDATE_REQUIRED'), problem(403, 'MFA_REQUIRED')]) {
      expect(sessionEnded(err)).toBe(false);
    }
  });
});
