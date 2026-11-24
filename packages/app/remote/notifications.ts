import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

/**
 * expo-notifications, or null in Expo Go on Android: Expo Go there ships without its native topic
 * module, so even importing the package throws and takes every screen down. Push needs a
 * development or store build on Android anyway.
 */
export const Notifications: NotificationsModule | null =
  Platform.OS === 'web' || (Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient)
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-notifications') as NotificationsModule);
