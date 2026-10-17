/**
 * Categorical series palettes, selected per surface and validated with the
 * data-viz six-check validator (lightness band, chroma floor, adjacent-pair
 * CVD separation, normal-vision floor, contrast vs surface).
 *
 * Dark steps are validated against the dark card surface #1D2331,
 * light steps against the light card surface #FFFFFF. Slots are assigned in
 * fixed order and never cycled — a 7th series folds into "Other".
 *
 * Status colours (good / warn / bad) are reserved for state and are never
 * reused as a series colour.
 */

export const SERIES_DARK = [
  '#007AFF', // blue (brand)
  '#D9721F', // orange
  '#0E9CA0', // teal
  '#AD8A1A', // yellow
  '#C05BE0', // purple
  '#1E9E6A', // green
] as const;

export const SERIES_LIGHT = [
  '#1F6FD0',
  '#C25F14',
  '#00918F',
  '#8A6A10',
  '#9B3FC4',
  '#157A52',
] as const;

export const MAX_SERIES = SERIES_DARK.length;

export function seriesPalette(scheme: 'light' | 'dark'): readonly string[] {
  return scheme === 'dark' ? SERIES_DARK : SERIES_LIGHT;
}

/** Fixed-order slot assignment; index past the palette folds into "Other". */
export function seriesColor(scheme: 'light' | 'dark', index: number): string {
  const p = seriesPalette(scheme);
  return index < p.length ? p[index] : scheme === 'dark' ? '#5A6478' : '#8E98AC';
}

/**
 * Single-hue sequential ramp for ordered magnitude (aging buckets: the later
 * the bucket, the darker the step). Light -> dark, one hue, never a rainbow.
 */
export const SEQUENTIAL_DARK = ['#9EC9FF', '#6BAAFF', '#3D8BFF', '#0A6CD1', '#0A4F97'] as const;
export const SEQUENTIAL_LIGHT = ['#BBD8FF', '#7FB0F5', '#3D8BFF', '#1F6FD0', '#134A8C'] as const;

export function sequentialRamp(scheme: 'light' | 'dark'): readonly string[] {
  return scheme === 'dark' ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT;
}
