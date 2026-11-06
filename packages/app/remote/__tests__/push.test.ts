import * as Notifications from 'expo-notifications';
import { api } from '../api';
import { ensurePushRegistered, routeForNotification, unregisterPush } from '../push';

// Hoisted above the imports by jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'proj-1' } } } } }));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[abc]' })),
}));
jest.mock('../api', () => ({ api: { POST: jest.fn(async () => ({})), DELETE: jest.fn(async () => ({})) } }));

const perms = Notifications.getPermissionsAsync as jest.Mock;
const ask = Notifications.requestPermissionsAsync as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('push registration', () => {
  it('registers silently when already allowed, and takes the token back on sign-out', async () => {
    perms.mockResolvedValue({ status: 'granted', canAskAgain: true });
    expect(await ensurePushRegistered({ ask: false })).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    expect(api.POST).toHaveBeenCalledWith('/me/push-tokens', { body: { token: 'ExponentPushToken[abc]', provider: 'expo' } });
    await unregisterPush();
    expect(api.DELETE).toHaveBeenCalledWith('/me/push-tokens/{token}', { params: { path: { token: 'ExponentPushToken[abc]' } } });
  });

  it('asks only when told to, and never after a refusal', async () => {
    perms.mockResolvedValue({ status: 'undetermined', canAskAgain: true });
    expect(await ensurePushRegistered({ ask: false })).toBe(false);
    expect(ask).not.toHaveBeenCalled();
    ask.mockResolvedValue({ status: 'denied' });
    expect(await ensurePushRegistered({ ask: true })).toBe(false);
    perms.mockResolvedValue({ status: 'denied', canAskAgain: false });
    await ensurePushRegistered({ ask: true });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(api.POST).not.toHaveBeenCalled();
  });

  it('opens what a tapped notification is about', () => {
    expect(routeForNotification({ entityType: 'document', entityId: 'doc_1' })).toBe('/(app)/documents/doc_1');
    expect(routeForNotification({ entityType: 'payment', entityId: 'pay_1' })).toBe('/(app)/payments/pay_1');
    expect(routeForNotification({ kind: 'system' })).toBe('/(app)/notifications');
  });
});
