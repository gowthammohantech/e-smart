import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { useToast } from '@esmart/ui/components/Toast';
import { useBusy } from '../remote/busy';

const WEB = Platform.OS === 'web' && typeof window !== 'undefined';

/**
 * While a save is on its way to the server, the app stays on the screen that made it: a clear
 * layer over everything takes the taps and clicks (the sidebar, the top bar, the tabs, a link on
 * the page) and says it is still saving, and closing or reloading the browser tab asks first.
 * The screen's own buttons are busy then anyway; it goes the moment the answer is back.
 */
export function NavigationLock() {
  const busy = useBusy();
  const toast = useToast();
  const { t: tr } = useTranslation(['common']);

  useEffect(() => {
    if (!WEB || !busy) return undefined;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers only prompt when this is set.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [busy]);

  if (!busy) return null;
  return (
    <Pressable
      accessibilityLabel={tr('common:leaveGuard.saving')}
      onPress={() => toast.show(tr('common:leaveGuard.saving'), 'info', { icon: 'progress-clock' })}
      style={[StyleSheet.absoluteFill, { zIndex: 10_000, backgroundColor: 'transparent' }, WEB ? ({ cursor: 'progress' } as object) : null]}
    />
  );
}
