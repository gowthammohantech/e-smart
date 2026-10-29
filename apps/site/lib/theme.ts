import { palettes } from '@esmart/ui/theme/tokens';

/**
 * The two looks the site can wear. "app" is the product's own dark palette
 * (packages/ui tokens), so the page matches what people install; "indigo" is
 * the reference design's palette. Both feed the CSS variables and the
 * three.js scenes from this one table, so a switch recolours everything.
 */
export type PaletteKey = 'app' | 'indigo';

export const PALETTE_KEYS: PaletteKey[] = ['app', 'indigo'];
export const DEFAULT_PALETTE: PaletteKey = 'app';
export const PALETTE_STORAGE_KEY = 'esmart-site-palette';

type Palette = {
  label: string;
  /** CSS custom properties, without the leading `--`. */
  css: Record<string, string>;
  /** Solid hex colours for three.js materials, which ignore alpha in CSS strings. */
  three: { primary: string; soft: string; glowA: string; glowB: string; deep: string; body: string };
};

const app = palettes.dark;

export const PALETTES: Record<PaletteKey, Palette> = {
  app: {
    label: 'App blue',
    css: {
      bg: app.canvas,
      surface: app.card2,
      'surface-2': app.paper,
      'surface-footer': '#0A0D13',
      line: 'rgba(0,122,255,0.18)',
      'line-strong': 'rgba(0,122,255,0.45)',
      primary: app.primary,
      'primary-pressed': app.primaryPressed,
      'primary-soft': '#9CCBFF',
      'primary-tint': 'rgba(0,122,255,0.10)',
      deep: '#06265A',
      'deep-2': '#0A3D8F',
      'glow-a': 'rgba(10,61,143,0.55)',
      'glow-b': 'rgba(12,120,150,0.28)',
      text: app.text,
      'text-muted': app.muted,
      'text-dim': '#566074',
      star: app.good,
      good: app.good,
      warn: app.warn,
      bad: app.bad,
      'card-art-from': '#4DA3FF',
      'card-art-to': '#0A3D8F',
    },
    three: { primary: app.primary, soft: '#9CCBFF', glowA: '#0A3D8F', glowB: '#0C7896', deep: '#06265A', body: '#0B0F16' },
  },
  indigo: {
    label: 'Indigo',
    css: {
      bg: '#090909',
      surface: '#111015',
      'surface-2': '#161419',
      'surface-footer': '#131313',
      line: 'rgba(120,123,255,0.18)',
      'line-strong': 'rgba(119,123,255,0.45)',
      primary: '#777BFF',
      'primary-pressed': '#5A5FD9',
      'primary-soft': '#AAB1FF',
      'primary-tint': 'rgba(119,123,255,0.08)',
      deep: '#0C2174',
      'deep-2': '#1A2FA0',
      'glow-a': 'rgba(59,31,107,0.6)',
      'glow-b': 'rgba(90,30,62,0.32)',
      text: '#FFFFFF',
      'text-muted': '#A3A3AD',
      'text-dim': '#6B6B75',
      star: '#00B67A',
      good: '#34C88A',
      warn: '#F0B429',
      bad: '#FF6B6B',
      'card-art-from': '#7A7DFF',
      'card-art-to': '#2B3BB8',
    },
    three: { primary: '#777BFF', soft: '#AAB1FF', glowA: '#3B1F6B', glowB: '#5A1E3E', deep: '#0C2174', body: '#0E0D12' },
  },
};

export function isPaletteKey(value: unknown): value is PaletteKey {
  return typeof value === 'string' && (PALETTE_KEYS as string[]).includes(value);
}

/** The stylesheet for every palette, keyed by `data-palette` on <html>. */
export function paletteCss(): string {
  return PALETTE_KEYS.map((key) => {
    const vars = Object.entries(PALETTES[key].css)
      .map(([name, value]) => `--${name}:${value};`)
      .join('');
    return `[data-palette="${key}"]{${vars}}`;
  }).join('\n');
}

/**
 * Runs in <head> before first paint: a `?palette=` link wins, then the
 * visitor's last choice, then the default. Storage can throw (private mode),
 * so every access is guarded.
 */
export const paletteBootScript = `(function(){try{var k=${JSON.stringify(PALETTE_KEYS)};var q=new URLSearchParams(location.search).get('palette');var s=null;try{s=localStorage.getItem('${PALETTE_STORAGE_KEY}')}catch(e){}var p=k.indexOf(q)>-1?q:k.indexOf(s)>-1?s:'${DEFAULT_PALETTE}';document.documentElement.dataset.palette=p}catch(e){}})();`;

export function readPalette(): PaletteKey {
  if (typeof document === 'undefined') return DEFAULT_PALETTE;
  const value = document.documentElement.dataset.palette;
  return isPaletteKey(value) ? value : DEFAULT_PALETTE;
}

export function setPalette(key: PaletteKey) {
  document.documentElement.dataset.palette = key;
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, key);
  } catch {
    // Storage blocked: the choice still holds for this visit.
  }
}

/** Subscribes to changes of `data-palette`, for useSyncExternalStore. */
export function subscribePalette(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette'] });
  return () => observer.disconnect();
}
