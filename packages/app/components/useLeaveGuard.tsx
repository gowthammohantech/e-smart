import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { useNavigation } from 'expo-router';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';

/** The form on screen with unsaved changes, if any, asking before `proceed` runs. */
let asking: ((proceed: () => void) => void) | null = null;

/**
 * For navigation that swaps the whole page rather than leaving the screen (the
 * web sidebar), which a screen can't stop on its own: asks the form on screen
 * first, and goes straight on when nothing is unsaved.
 */
export function leaveGuarded(proceed: () => void) {
  if (asking) asking(proceed);
  else proceed();
}

/**
 * Asks before a form with unsaved changes is left. Leaving its screen in the
 * app (back, the sidebar, a link) asks "Leave without saving?" first; closing
 * or reloading the browser tab gets the browser's own prompt, which a page
 * can't word. Switching to another browser tab loses nothing, so it isn't asked.
 *
 * Render `dialog`. A save calls `release` before it navigates away, so its
 * own navigation goes through.
 */
export function useLeaveGuard(dirty: boolean): { dialog: React.ReactNode; release: () => void } {
  const { t: tr } = useTranslation(['common']);
  const navigation = useNavigation();
  const released = useRef(false);
  const guarding = useRef(dirty);
  useEffect(() => {
    guarding.current = dirty && !released.current;
  });
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!guarding.current) return;
        e.preventDefault();
        setPending(() => () => navigation.dispatch(e.data.action));
      }),
    [navigation],
  );

  useEffect(() => {
    if (!dirty) return undefined;
    const ask = (proceed: () => void) => (guarding.current ? setPending(() => proceed) : proceed());
    asking = ask;
    return () => {
      if (asking === ask) asking = null;
    };
  }, [dirty]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !dirty) return undefined;
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!guarding.current) return;
      e.preventDefault();
      // Older browsers only prompt when this is set.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const dialog = (
    <ConfirmDialog
      visible={!!pending}
      title={tr('common:leaveGuard.title')}
      message={tr('common:leaveGuard.message')}
      confirmLabel={tr('common:leaveGuard.leave')}
      cancelLabel={tr('common:leaveGuard.stay')}
      destructive
      icon="exit-to-app"
      onCancel={() => setPending(null)}
      onConfirm={() => {
        const leave = pending;
        setPending(null);
        released.current = true;
        guarding.current = false;
        leave?.();
      }}
    />
  );
  return {
    dialog,
    release: () => {
      released.current = true;
      guarding.current = false;
    },
  };
}
