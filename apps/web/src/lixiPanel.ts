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
 * How far open the panel is, 0 (shut) to 1, animated. The panel slides in over
 * the page with it and the scrim behind it fades in, so the page keeps its width.
 */
export const lixiPanelProgress = new Animated.Value(0);

function set(next: PanelState) {
  state = next;
  Animated.timing(lixiPanelProgress, {
    toValue: next.open ? 1 : 0,
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
