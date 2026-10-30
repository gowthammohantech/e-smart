'use client';

import { useSyncExternalStore } from 'react';

import { DEFAULT_THEME, readTheme, subscribeTheme, THEMES, type ThemeKey } from './theme';

export function useThemeKey(): ThemeKey {
  return useSyncExternalStore(subscribeTheme, readTheme, () => DEFAULT_THEME);
}

/** The active theme's settings for three.js materials. */
export function useThreeTheme() {
  return THEMES[useThemeKey()];
}

/** The active theme's solid colours, for three.js materials. */
export function useThreeColors() {
  return useThreeTheme().three;
}

const reducedQuery = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(reducedQuery);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
}

let webgl: boolean | null = null;

function probeWebGL(): boolean {
  if (webgl === null) {
    try {
      const canvas = document.createElement('canvas');
      webgl = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/** Whether this browser can open a WebGL context; false during prerender. */
export function useWebGL(): boolean {
  return useSyncExternalStore(
    () => () => {},
    probeWebGL,
    () => false,
  );
}
