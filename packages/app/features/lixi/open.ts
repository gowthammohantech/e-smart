import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

/** Opens Lixi, optionally with a question it answers straight away. */
export function openLixi(ask?: string) {
  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  router.push({ pathname: '/(app)/lixi', params: ask ? { ask } : {} });
}
