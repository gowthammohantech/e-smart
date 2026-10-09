import { useSyncExternalStore } from 'react';
import { Animated, Easing } from 'react-native';

/** How wide the Lixi side panel is when open. */
export const LIXI_PANEL_WIDTH = 420;

type PanelState = {
  open: boolean;
  /** A question to answer first. A new `nonce` starts a fresh chat for it. */
  ask?: string;
  nonce: number;
};

let state: PanelState = { open: false, nonce: 0 };
const listeners = new Set<() => void>();

/**
 * The panel's current width, animated. The panel draws itself with it and the
 * page beside it takes whatever is left, so opening Lixi squeezes the page
 * rather than covering it.
 */
export const lixiPanelWidth = new Animated.Value(0);

function set(next: PanelState) {
  state = next;
  Animated.timing(lixiPanelWidth, {
    toValue: next.open ? LIXI_PANEL_WIDTH : 0,
    duration: 260,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: false,
  }).start();
  listeners.forEach((l) => l());
}

export function openLixiPanel(ask?: string) {
  set({ open: true, ask, nonce: ask ? state.nonce + 1 : state.nonce });
}

export function closeLixiPanel() {
  set({ ...state, open: false });
}

export function toggleLixiPanel() {
  if (state.open) closeLixiPanel();
  else openLixiPanel();
}

export function useLixiPanel(): PanelState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
