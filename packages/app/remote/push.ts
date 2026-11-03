import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { reportError } from '../lib/reporter';
import { api } from './api';

/** The token this device registered, so signing out can take it back. */
const KEY = 'ebs.push.token';

/** Android channels, matching the server's `channelId` per kind (apps/api/src/lib/notify.ts). */
const CHANNELS: { id: string; name: string; importance: Notifications.AndroidImportance }[] = [
  { id: 'payments', name: 'Payments and overdue invoices', importance: Notifications.AndroidImportance.HIGH },
  { id: 'compliance', name: 'E-invoices and e-way bills', importance: Notifications.AndroidImportance.HIGH },
  { id: 'stock', name: 'Low stock', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'general', name: 'Everything else', importance: Notifications.AndroidImportance.DEFAULT },
];

/** Expo's push service issues tokens per Expo project; without one there's nothing to register. */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
}

/** Shown while the app is open too, as a banner. Phones only: the web app gets no push. */
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export async function pushPermission(): Promise<PushPermission> {
  if (Platform.OS === 'web' || !projectId()) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  return status as PushPermission;
}

/**
 * Registers this phone for push. With `ask`, the system prompt shows if the person hasn't answered it
 * yet; without, it only refreshes a token they already allowed (at launch). Never asks twice: once
 * denied, only the phone's settings can turn it back on.
 */
export async function ensurePushRegistered(opts: { ask: boolean }): Promise<boolean> {
  try {
    const id = projectId();
    if (Platform.OS === 'web' || !id) return false;
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && opts.ask && canAskAgain) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return false;
    if (Platform.OS === 'android') {
      for (const c of CHANNELS) await Notifications.setNotificationChannelAsync(c.id, { name: c.name, importance: c.importance });
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
    // The server moves a token to whoever registers it last (a handed-over phone).
    await api.POST('/me/push-tokens', { body: { token, provider: 'expo' } });
    await AsyncStorage.setItem(KEY, token);
    return true;
  } catch (err) {
    reportError(err, { source: 'push.register' });
    return false;
  }
}

/** Before signing out: this phone stops getting that account's notifications. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(KEY);
    if (!token) return;
    await AsyncStorage.removeItem(KEY);
    await api.DELETE('/me/push-tokens/{token}', { params: { path: { token } } });
  } catch {
    // Offline: the server drops it when the session ends or the receipts say it's gone.
  }
}

/** Where a tapped notification opens, from the data the server sent with it. */
export function routeForNotification(data: Record<string, unknown> | undefined): string | null {
  const id = typeof data?.entityId === 'string' ? data.entityId : null;
  switch (data?.entityType) {
    case 'document':
      return id ? `/(app)/documents/${id}` : null;
    case 'payment':
      return id ? `/(app)/payments/${id}` : null;
    case 'export_job':
      return '/(app)/settings/backup';
    case 'eway_bill':
      return '/(app)/compliance';
    default:
      return '/(app)/notifications';
  }
}
