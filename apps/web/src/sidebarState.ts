import { useSyncExternalStore } from 'react';
import { Animated } from 'react-native';
import { pushRecent, RECENT_LIMIT } from '@esmart/app/navigation/menu';

export const SIDEBAR_WIDTH = 248;

/** Between the desktop and full-sidebar breakpoints only the icons show. */
export const SIDEBAR_COMPACT_WIDTH = 64;

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

const RECENT_KEY = 'esmart.sidebar.recent';
const NONE: readonly string[] = [];

function readRecent(): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string').slice(0, RECENT_LIMIT + 1) : NONE;
  } catch {
    // Blocked or garbled storage: the list starts empty and fills as you go.
    return NONE;
  }
}

let recent = readRecent();
const recentListeners = new Set<() => void>();

// One more than the list shows: the page you're on is left out of it.
const KEEP = RECENT_LIMIT + 1;

/** Notes a visit to a menu page (by key); the newest comes first. */
export function visitPage(key: string) {
  if (recent[0] === key) return;
  recent = pushRecent(recent, key, KEEP);
  try {
    globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    // Not remembering is fine.
  }
  recentListeners.forEach((l) => l());
}

/** The menu pages visited last, newest first, remembered per browser. */
export function useRecentPages(): readonly string[] {
  return useSyncExternalStore(
    (cb) => {
      recentListeners.add(cb);
      return () => recentListeners.delete(cb);
    },
    () => recent,
    () => NONE,
  );
}
