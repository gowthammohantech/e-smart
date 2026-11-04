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

const WEB = Platform.OS === 'web' && typeof window !== 'undefined';
/** Marks the extra history entry a guarded form adds; the router only reads `id`. */
const TRAP = 'leaveGuard';

/**
 * Asks before a form with unsaved changes is left. Leaving its screen in the
 * app (its back link, the browser's Back, the sidebar) asks "Leave without
 * saving?" first; closing or reloading the browser tab gets the browser's own
 * prompt, which a page can't word. Switching to another browser tab loses
 * nothing, so it isn't asked.
 *
 * The browser's Back swaps the whole page without the screen being told, so
 * while there is something to lose the form adds one history entry of its own:
 * Back lands on it, and the question is asked there.
 *
 * Render `dialog`. A save awaits `release` before it navigates away, so its
 * own navigation goes through and leaves no extra entry behind.
 */
export function useLeaveGuard(dirty: boolean): { dialog: React.ReactNode; release: () => Promise<void> } {
  const { t: tr } = useTranslation(['common']);
  const navigation = useNavigation();
  const released = useRef(false);
  const guarding = useRef(dirty);
  useEffect(() => {
    guarding.current = dirty && !released.current;
  });
  const [pending, setPending] = useState<{ go: () => void; fromBack?: boolean } | null>(null);

  // The extra history entry: whether it is there, and a step back we took ourselves.
  const history = useRef<{ armed: boolean; ownStep: (() => void) | null; waiting: boolean }>({ armed: false, ownStep: null, waiting: false });
  // The form's own page. Coming back from a page opened on top of it (New item),
  // the form can have changes before the browser has stepped back to it.
  const [home] = useState(() => (WEB ? window.location.pathname : ''));
  const arm = () => {
    if (!WEB || history.current.armed) return;
    if (window.location.pathname !== home) {
      // Added once the browser is back here, not to the page being left.
      history.current.waiting = true;
      return;
    }
    history.current.waiting = false;
    // A step back taken while no listener was there to see it has long happened.
    history.current.ownStep = null;
    window.history.pushState({ ...window.history.state, [TRAP]: true }, '', window.location.href);
    history.current.armed = true;
  };
  /** Takes the extra entry away again, before the form navigates by itself. */
  const disarm = () =>
    new Promise<void>((resolve) => {
      if (!WEB || !history.current.armed) return resolve();
      history.current.armed = false;
      history.current.ownStep = resolve;
      window.history.back();
    });

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (!guarding.current) return;
        e.preventDefault();
        setPending({ go: () => navigation.dispatch(e.data.action) });
      }),
    [navigation],
  );

  useEffect(() => {
    if (!dirty) return undefined;
    const ask = (proceed: () => void) => (guarding.current ? setPending({ go: proceed }) : proceed());
    asking = ask;
    return () => {
      if (asking === ask) asking = null;
    };
  }, [dirty]);

  useEffect(() => {
    if (!WEB || !dirty) return undefined;
    arm();
    const onPop = () => {
      if (history.current.waiting) {
        if (window.location.pathname === home) arm();
        return;
      }
      const own = history.current.ownStep;
      if (own) {
        history.current.ownStep = null;
        own();
        return;
      }
      // Back from a page opened on top of the form, onto the extra entry: still here.
      if ((window.history.state as Record<string, unknown> | null)?.[TRAP]) {
        history.current.armed = true;
        return;
      }
      if (!history.current.armed) return;
      // Back from the form: the extra entry is spent, and the form is still on screen.
      history.current.armed = false;
      if (guarding.current) setPending({ go: () => window.history.back(), fromBack: true });
      else window.history.back();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!guarding.current) return;
      e.preventDefault();
      // Older browsers only prompt when this is set.
      e.returnValue = '';
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('beforeunload', onUnload);
      // Nothing to lose any more (the changes were undone): the entry goes.
      if (!released.current) void disarm();
    };
    // arm and disarm only touch refs and the browser's history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const release = async () => {
    released.current = true;
    guarding.current = false;
    await disarm();
  };

  const dialog = (
    <ConfirmDialog
      visible={!!pending}
      title={tr('common:leaveGuard.title')}
      message={tr('common:leaveGuard.message')}
      confirmLabel={tr('common:leaveGuard.leave')}
      cancelLabel={tr('common:leaveGuard.stay')}
      destructive
      icon="exit-to-app"
      onCancel={() => {
        // Staying after the browser's Back: the next Back is asked about too.
        if (pending?.fromBack) arm();
        setPending(null);
      }}
      onConfirm={() => {
        const leave = pending;
        setPending(null);
        void release().then(() => leave?.go());
      }}
    />
  );
  return { dialog, release };
}
