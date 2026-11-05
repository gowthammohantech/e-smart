import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { ensurePushRegistered, routeForNotification } from '../../remote/push';

/** The notification that opened the app is handled once, not on every later sign-in. */
let launchHandled = false;

/**
 * Once signed in: refreshes the push token if the person already allowed notifications (never asks
 * here), and opens what a tapped notification is about, including the one that launched the app.
 */
export function usePushNotifications(signedIn: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!signedIn || Platform.OS === 'web') return;
    void ensurePushRegistered({ ask: false });
    const open = (response: Notifications.NotificationResponse | null) => {
      const route = routeForNotification(response?.notification.request.content.data as Record<string, unknown> | undefined);
      if (route) router.push(route as never);
    };
    if (!launchHandled) {
      launchHandled = true;
      void Notifications.getLastNotificationResponseAsync().then(open);
    }
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [signedIn, router]);
}
