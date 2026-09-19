/**
 * Design tokens ported 1:1 from the approved Elixir Books Smart HTML prototype.
 * The prototype is dark-first with a light override, so `dark` is the reference
 * palette and `light` mirrors it.
 */

export type ColorTokens = {
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  bg: string;
  canvas: string;
  card: string;
  card2: string;
  paper: string;
  line: string;
  text: string;
  muted: string;
  good: string;
  warn: string;
  bad: string;
  info: string;
  chip: string;
  bezel: string;
  overlay: string;
  goodSoft: string;
  warnSoft: string;
  badSoft: string;
  mutedSoft: string;
};

const dark: ColorTokens = {
  primary: '#007AFF',
  primaryPressed: '#0062CC',
  onPrimary: '#FFFFFF',
  bg: '#0E121A',
  canvas: '#05070B',
  card: '#1D2331',
  card2: '#151A24',
  paper: '#141A24',
  line: '#1D273B',
  text: '#FFFFFF',
  muted: '#8E98AC',
  good: '#34C88A',
  warn: '#F0B429',
  bad: '#FF6B6B',
  info: '#4DA3FF',
  chip: 'rgba(0,122,255,0.14)',
  bezel: '#23262C',
  overlay: 'rgba(0,0,0,0.60)',
  goodSoft: 'rgba(52,200,138,0.16)',
  warnSoft: 'rgba(240,180,41,0.16)',
  badSoft: 'rgba(255,107,107,0.16)',
  mutedSoft: 'rgba(142,152,172,0.16)',
};

const light: ColorTokens = {
  primary: '#007AFF',
  primaryPressed: '#0062CC',
  onPrimary: '#FFFFFF',
  bg: '#F4F6FA',
  canvas: '#DBE2EE',
  card: '#FFFFFF',
  card2: '#EDF1F7',
  paper: '#FFFFFF',
  line: '#E2E8F1',
  text: '#0E121A',
  muted: '#5A6478',
  good: '#12855C',
  warn: '#A8720A',
  bad: '#D33B3B',
  info: '#0A6CD1',
  chip: 'rgba(0,122,255,0.10)',
  bezel: '#C9D1DF',
  overlay: 'rgba(14,18,26,0.45)',
  goodSoft: 'rgba(18,133,92,0.12)',
  warnSoft: 'rgba(168,114,10,0.12)',
  badSoft: 'rgba(211,59,59,0.12)',
  mutedSoft: 'rgba(90,100,120,0.12)',
};

export const palettes = { dark, light };

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const fontSize = {
  micro: 10,
  caption: 12,
  small: 13,
  body: 15,
  title: 17,
  h3: 20,
  h2: 24,
  h1: 30,
  display: 36,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

/** Minimum touch target required by the PRD accessibility principles. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
export const MIN_TOUCH = 44;

/**
 * Per-script adjustments to the type scale, which is tuned for Latin.
 *
 * Tamil carries vowel signs above and below the line (ி ீ ை ொ), so it needs
 * more leading than RN's default and none of the negative tracking the
 * display sizes use — at −0.8 the marks collide with the letters they belong
 * to. Latin keeps `lineHeight: null`, which leaves the platform default in
 * place, so English rendering is unchanged to the pixel.
 */
export const typeMetrics = {
  latin: { lineHeight: null, tracking: 1 },
  tamil: { lineHeight: 1.5, tracking: 0 },
} as const;
