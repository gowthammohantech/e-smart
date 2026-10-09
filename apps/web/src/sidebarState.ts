import { useSyncExternalStore } from 'react';
import { Animated } from 'react-native';

export const SIDEBAR_WIDTH = 248;

/** Between the desktop and full-sidebar breakpoints only the icons show. */
export const SIDEBAR_COMPACT_WIDTH = 68;

const COLLAPSED_KEY = 'esmart.sidebar.collapsed';

function readSaved(): boolean {
  try {
    return globalThis.localStorage?.getItem(COLLAPSED_KEY) === '1';
  } catch {
    // Storage can be blocked; the sidebar just starts expanded.
    return false;
  }
}

let collapsed = readSaved();
const listeners = new Set<() => void>();

/**
 * The sidebar's current width, animated. The sidebar draws itself with it and
 * the page column reads it too, so the page grows into the space a folded
 * sidebar gives back.
 */
export const sidebarWidth = new Animated.Value(collapsed ? SIDEBAR_COMPACT_WIDTH : SIDEBAR_WIDTH);

/** Whether the person folded the sidebar to icons; remembered per browser. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => collapsed,
    () => false,
  );
  const toggle = () => {
    collapsed = !collapsed;
    try {
      globalThis.localStorage?.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // Not remembering is fine.
    }
    listeners.forEach((l) => l());
  };
  return [value, toggle];
}
