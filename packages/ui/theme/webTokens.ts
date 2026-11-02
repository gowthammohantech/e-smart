import type { ColorTokens } from './tokens';

/**
 * The browser's design tokens. The web app reads at a desk, with a pointer,
 * at arm's length, so it gets a denser type scale, tighter corners, borders
 * in place of soft shadows and a calmer palette around the same brand blue.
 * Native keeps `tokens.ts` untouched; `buildTheme` picks between the two.
 */

const dark: ColorTokens = {
  primary: '#3B8BFF',
  primaryPressed: '#2F74DB',
  primaryHover: '#5A9DFF',
  onPrimary: '#FFFFFF',
  bg: '#0B0F17',
  canvas: '#070A10',
  card: '#121826',
  card2: '#0F1420',
  paper: '#121826',
  line: '#1F2737',
  lineStrong: '#2C3649',
  text: '#E9EDF5',
  muted: '#8B95A8',
  good: '#3CCB7F',
  warn: '#F5B544',
  bad: '#F97066',
  info: '#5A9DFF',
  chip: 'rgba(59,139,255,0.14)',
  bezel: '#2C3649',
  overlay: 'rgba(3,6,12,0.66)',
  goodSoft: 'rgba(60,203,127,0.14)',
  warnSoft: 'rgba(245,181,68,0.14)',
  badSoft: 'rgba(249,112,102,0.14)',
  mutedSoft: 'rgba(139,149,168,0.14)',
};

const light: ColorTokens = {
  primary: '#0A6CF0',
  primaryPressed: '#0749A6',
  primaryHover: '#0859C9',
  onPrimary: '#FFFFFF',
  bg: '#F7F8FA',
  canvas: '#EEF1F5',
  card: '#FFFFFF',
  card2: '#F2F4F7',
  paper: '#FFFFFF',
  line: '#E4E7EC',
  lineStrong: '#D0D5DD',
  text: '#101828',
  muted: '#5D6B82',
  good: '#067647',
  warn: '#B54708',
  bad: '#D92D20',
  info: '#0A6CF0',
  chip: 'rgba(10,108,240,0.08)',
  bezel: '#D0D5DD',
  overlay: 'rgba(16,24,40,0.48)',
  goodSoft: 'rgba(6,118,71,0.09)',
  warnSoft: 'rgba(181,71,8,0.09)',
  badSoft: 'rgba(217,45,32,0.08)',
  mutedSoft: 'rgba(93,107,130,0.10)',
};

export const webPalettes = { dark, light };

/** Desktop reading sizes: a 14px body, as most web apps settle on. */
export const webFontSize = {
  micro: 11,
  caption: 12,
  small: 13,
  body: 14,
  title: 16,
  h3: 18,
  h2: 22,
  h1: 28,
  display: 32,
} as const;

export const webRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

/**
 * Inter, self-hosted by the web app (apps/web/src/fonts.ts). Inter has no
 * Tamil glyphs, so Tamil falls through to the platform's Tamil face.
 */
export const WEB_FONT_FAMILY =
  'InterWeb, "Noto Sans Tamil", "Tamil Sangam MN", "Latha", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function webShadows(scheme: 'light' | 'dark', primary: string) {
  return {
    card:
      scheme === 'dark'
        ? { shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 }
        : { shadowColor: '#101828', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    sheet:
      scheme === 'dark'
        ? { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: 16 }, elevation: 16 }
        : { shadowColor: '#101828', shadowOpacity: 0.14, shadowRadius: 32, shadowOffset: { width: 0, height: 16 }, elevation: 16 },
    fab: { shadowColor: primary, shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  };
}
