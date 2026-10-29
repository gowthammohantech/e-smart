import { palettes } from '@esmart/ui/theme/tokens';

/**
 * The site's two themes, both in the product's App-blue palette (packages/ui
 * tokens), so the page matches the app people install. Both feed the CSS
 * variables and the three.js scenes from this one table, so a switch
 * recolours everything.
 */
export type ThemeKey = 'dark' | 'light';

export const THEME_KEYS: ThemeKey[] = ['dark', 'light'];
export const DEFAULT_THEME: ThemeKey = 'dark';
export const THEME_STORAGE_KEY = 'esmart-site-theme';

type Theme = {
  /** CSS custom properties, without the leading `--`. */
  css: Record<string, string>;
  /** Solid hex colours for three.js materials, which ignore alpha in CSS strings. */
  three: { primary: string; soft: string; glowA: string; glowB: string; deep: string; frame: string; particles: string; propBody: string; paper: string };
  /** Light backgrounds swallow additive light, so glows switch to normal blending there. */
  additiveGlow: boolean;
};

const dark = palettes.dark;
const light = palettes.light;

export const THEMES: Record<ThemeKey, Theme> = {
  dark: {
    css: {
      bg: dark.canvas,
      surface: dark.card2,
      'surface-2': dark.paper,
      'surface-footer': '#0A0D13',
      line: 'rgba(0,122,255,0.18)',
      'line-strong': 'rgba(0,122,255,0.45)',
      primary: dark.primary,
      'primary-pressed': dark.primaryPressed,
      'primary-soft': '#9CCBFF',
      'primary-tint': 'rgba(0,122,255,0.10)',
      deep: '#06265A',
      'deep-2': '#0A3D8F',
      'glow-a': 'rgba(10,61,143,0.55)',
      'glow-b': 'rgba(12,120,150,0.28)',
      text: dark.text,
      'text-muted': dark.muted,
      'text-dim': '#566074',
      star: dark.good,
      good: dark.good,
      warn: dark.warn,
      bad: dark.bad,
      'card-art-from': '#4DA3FF',
      'card-art-to': '#0A3D8F',
      bezel: '#101216',
      glass: 'rgba(21,26,36,0.72)',
      'edge-a': 'rgba(77,163,255,0.55)',
      'edge-b': 'rgba(77,163,255,0.08)',
      'edge-c': 'rgba(0,122,255,0.30)',
      'edge-hover': 'rgba(120,186,255,0.95)',
      spot: 'rgba(0,122,255,0.16)',
      'card-glow': 'rgba(0,122,255,0.22)',
      'frame-a': '#5B6068',
      'frame-b': '#202328',
      'frame-c': '#3A3E45',
    },
    three: { primary: dark.primary, soft: '#9CCBFF', glowA: '#0A3D8F', glowB: '#0C7896', deep: '#06265A', frame: '#7A7F88', particles: '#9CCBFF', propBody: '#06265A', paper: '#1D2331' },
    additiveGlow: true,
  },
  light: {
    css: {
      bg: light.bg,
      surface: light.card,
      'surface-2': light.card,
      'surface-footer': light.card2,
      line: light.line,
      'line-strong': 'rgba(0,122,255,0.40)',
      primary: light.primary,
      'primary-pressed': light.primaryPressed,
      'primary-soft': '#CFE5FF',
      'primary-tint': light.chip,
      deep: '#0A3D8F',
      'deep-2': '#1B5BC4',
      'glow-a': 'rgba(0,122,255,0.14)',
      'glow-b': 'rgba(77,163,255,0.12)',
      text: light.text,
      'text-muted': light.muted,
      'text-dim': '#8A93A6',
      star: '#12A06B',
      good: light.good,
      warn: light.warn,
      bad: light.bad,
      'card-art-from': '#4DA3FF',
      'card-art-to': '#0A3D8F',
      bezel: '#1A1D23',
      glass: 'rgba(255,255,255,0.72)',
      'edge-a': 'rgba(0,122,255,0.35)',
      'edge-b': 'rgba(14,18,26,0.06)',
      'edge-c': 'rgba(0,122,255,0.18)',
      'edge-hover': 'rgba(0,122,255,0.75)',
      spot: 'rgba(0,122,255,0.08)',
      'card-glow': 'rgba(0,122,255,0.14)',
      'frame-a': '#D9D4CC',
      'frame-b': '#8E8A84',
      'frame-c': '#BDB8B0',
    },
    three: { primary: light.primary, soft: '#4DA3FF', glowA: '#9CCBFF', glowB: '#BFDDFF', deep: '#0A3D8F', frame: '#CFC8BC', particles: '#4D7FD1', propBody: '#7DB8FF', paper: '#FFFFFF' },
    additiveGlow: false,
  },
};

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && (THEME_KEYS as string[]).includes(value);
}

/** The stylesheet for both themes, keyed by `data-theme` on <html>. */
export function themeCss(): string {
  return THEME_KEYS.map((key) => {
    const vars = Object.entries(THEMES[key].css)
      .map(([name, value]) => `--${name}:${value};`)
      .join('');
    return `[data-theme="${key}"]{${vars}color-scheme:${key};}`;
  }).join('\n');
}

/**
 * Runs in <head> before first paint: a `?theme=` link wins, then the
 * visitor's last choice, then their system setting. Storage can throw
 * (private mode), so every access is guarded.
 */
export const themeBootScript = `(function(){try{var k=${JSON.stringify(THEME_KEYS)};var q=new URLSearchParams(location.search).get('theme');var s=null;try{s=localStorage.getItem('${THEME_STORAGE_KEY}')}catch(e){}var sys=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';var t=k.indexOf(q)>-1?q:k.indexOf(s)>-1?s:sys;document.documentElement.dataset.theme=t}catch(e){}})();`;

export function readTheme(): ThemeKey {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const value = document.documentElement.dataset.theme;
  return isThemeKey(value) ? value : DEFAULT_THEME;
}

export function setTheme(key: ThemeKey) {
  document.documentElement.dataset.theme = key;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, key);
  } catch {
    // Storage blocked: the choice still holds for this visit.
  }
}

/** Subscribes to changes of `data-theme`, for useSyncExternalStore. */
export function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
