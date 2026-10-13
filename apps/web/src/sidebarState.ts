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

const EXPANDED_KEY = 'esmart.sidebar.expanded';
const NONE_EXPANDED: readonly string[] = [];

function readExpanded(): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(EXPANDED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : NONE_EXPANDED;
  } catch {
    // Blocked or garbled storage: every section starts closed.
    return NONE_EXPANDED;
  }
}

let expanded = readExpanded();
const expandedListeners = new Set<() => void>();

function saveExpanded(next: readonly string[]) {
  expanded = next;
  try {
    globalThis.localStorage?.setItem(EXPANDED_KEY, JSON.stringify(next));
  } catch {
    // Not remembering is fine.
  }
  expandedListeners.forEach((l) => l());
}

/**
 * Which sidebar sections have their pages listed, remembered per browser.
 * `open` only ever adds, so landing in a section shows its pages without
 * undoing a section the person closed elsewhere.
 */
export function useExpandedSections(): {
  isOpen: (section: string) => boolean;
  toggle: (section: string) => void;
  open: (section: string) => void;
} {
  const value = useSyncExternalStore(
    (cb) => {
      expandedListeners.add(cb);
      return () => expandedListeners.delete(cb);
    },
    () => expanded,
    () => NONE_EXPANDED,
  );
  return {
    isOpen: (section) => value.includes(section),
    toggle: (section) =>
      saveExpanded(expanded.includes(section) ? expanded.filter((s) => s !== section) : [...expanded, section]),
    open: (section) => {
      if (!expanded.includes(section)) saveExpanded([...expanded, section]);
    },
  };
}
