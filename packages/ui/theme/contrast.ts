/**
 * WCAG colour maths for #RRGGBB colours: relative luminance, contrast ratio,
 * alpha blending, and a way to pull a brand or palette colour far enough
 * towards the text colour to be readable on a given background.
 */

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(rgb: number[]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` at `alpha` (0–1) over an opaque `bg`. */
export function blend(fg: string, bg: string, alpha: number): string {
  const f = channels(fg);
  const b = channels(bg);
  return toHex(f.map((v, i) => v * alpha + b[i] * (1 - alpha)));
}

/**
 * `color` if it already reads on `bg` at `min`:1; otherwise `color` mixed
 * towards `toward` (the theme's text colour) in small steps until it does,
 * so it keeps its hue as far as it can.
 */
export function readableOn(color: string, bg: string, toward: string, min = 4.5): string {
  for (let step = 0; step <= 20; step++) {
    const mixed = blend(toward, color, step / 20);
    if (contrast(mixed, bg) >= min) return mixed;
  }
  return toward;
}
