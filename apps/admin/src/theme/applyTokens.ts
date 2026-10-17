import { SERIES_DARK, SERIES_LIGHT } from '@esmart/ui/theme/chartColors';
import { palettes, radius, type ColorTokens } from '@esmart/ui/theme/tokens';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function vars(c: ColorTokens, series: readonly string[]) {
  return [
    ...Object.entries(c).map(([k, v]) => `--${kebab(k)}: ${v};`),
    ...series.map((v, i) => `--series-${i + 1}: ${v};`),
  ].join(' ');
}

/**
 * Turns the shared design tokens into CSS custom properties: light by
 * default, dark under prefers-color-scheme, and either forced with
 * `data-theme` on <html>.
 */
export function tokensCss(): string {
  const light = vars(palettes.light, SERIES_LIGHT);
  const dark = vars(palettes.dark, SERIES_DARK);
  const radii = Object.entries(radius)
    .map(([k, v]) => `--radius-${k}: ${v}px;`)
    .join(' ');
  return [
    `:root { ${radii} ${light} color-scheme: light; }`,
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${dark} color-scheme: dark; } }`,
    `:root[data-theme="dark"] { ${dark} color-scheme: dark; }`,
  ].join('\n');
}

export function applyTokens() {
  const style = document.createElement('style');
  style.dataset.tokens = '';
  style.textContent = tokensCss();
  document.head.prepend(style);
}
