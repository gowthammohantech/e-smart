import type { ColorTokens } from './tokens';

/**
 * The browser's design tokens. The web app reads at a desk, with a pointer,
 * at arm's length, so it gets a denser type scale, tighter corners, borders
 * in place of soft shadows and a calmer palette around the same brand blue.
 * Native keeps `tokens.ts` untouched; `buildTheme` picks between the two.
 */

const dark: ColorTokens = {
  // Light enough to read at 4.5:1 on its own chip tint, as a selected nav item or
  // a secondary button's label (#3B8BFF was 4.4:1 there).
  primary: '#559BFF',
  primaryPressed: '#4A8EF0',
  primaryHover: '#6FAAFF',
  // Dark text: white on this blue is 3.3:1, under the 4.5:1 a button label needs.
  // Darkening the blue instead would fail it as link text on the dark page.
  onPrimary: '#0B0F17',
  bg: '#0B0F17',
  canvas: '#070A10',
  card: '#121826',
  card2: '#0F1420',
  paper: '#121826',
  line: '#1F2737',
  lineStrong: '#2C3649',
  inputBorder: '#636D80',
  text: '#E9EDF5',
  muted: '#8B95A8',
  good: '#3CCB7F',
  warn: '#F5B544',
  bad: '#F97066',
  info: '#6FAAFF',
  chip: 'rgba(85,155,255,0.14)',
  bezel: '#2C3649',
  overlay: 'rgba(3,6,12,0.66)',
  goodSoft: 'rgba(60,203,127,0.14)',
  warnSoft: 'rgba(245,181,68,0.14)',
  badSoft: 'rgba(249,112,102,0.14)',
  mutedSoft: 'rgba(139,149,168,0.14)',
};

const light: ColorTokens = {
  // Dark enough to read at 4.5:1 on its own chip tint, hovered or not, as a
  // selected nav item or a secondary button's label (#0A6CF0 was 3.6 to 4.3:1).
  primary: '#085BCC',
  primaryPressed: '#06429A',
  primaryHover: '#074FB3',
  onPrimary: '#FFFFFF',
  bg: '#F7F8FA',
  canvas: '#EEF1F5',
  card: '#FFFFFF',
  card2: '#F2F4F7',
  paper: '#FFFFFF',
  line: '#E4E7EC',
  lineStrong: '#D0D5DD',
  inputBorder: '#7D879A',
  text: '#101828',
  // Status tones deep enough to read at 4.5:1 on their own soft tints over the
  // grey card (badges, the overdue chip); the earlier red was 3.9:1 there.
  muted: '#556279',
  good: '#067647',
  warn: '#A8420A',
  bad: '#BF261B',
  info: '#085BCC',
  chip: 'rgba(8,91,204,0.08)',
  bezel: '#D0D5DD',
  overlay: 'rgba(16,24,40,0.48)',
  goodSoft: 'rgba(6,118,71,0.09)',
  warnSoft: 'rgba(168,66,10,0.09)',
  badSoft: 'rgba(191,38,27,0.08)',
  mutedSoft: 'rgba(85,98,121,0.10)',
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
