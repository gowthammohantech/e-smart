import { useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'admin.theme';

export function readThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** `system` drops `data-theme` so the prefers-color-scheme rule in applyTokens wins. */
export function applyThemeMode(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'system') delete root.dataset.theme;
  else root.dataset.theme = mode;
  try {
    if (mode === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, mode);
  } catch {
    // Private windows can refuse storage; the choice still applies for this visit.
  }
}

export function useThemeMode() {
  const [mode, setMode] = useState(readThemeMode);
  return [
    mode,
    (next: ThemeMode) => {
      applyThemeMode(next);
      setMode(next);
    },
  ] as const;
}
