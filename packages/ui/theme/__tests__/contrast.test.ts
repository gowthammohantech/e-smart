import { palettes, type ColorTokens } from '../tokens';
import { webPalettes } from '../webTokens';

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const sets: [string, ColorTokens][] = [
  ['web light', webPalettes.light],
  ['web dark', webPalettes.dark],
  ['native light', palettes.light],
  ['native dark', palettes.dark],
];

// Body text needs 4.5:1 (WCAG 1.4.3); a control's edge needs 3:1 (1.4.11).
describe.each(sets)('%s palette contrast', (_name, c) => {
  const surfaces = { bg: c.bg, paper: c.paper, card: c.card };

  it.each(Object.entries(surfaces))('text and muted text read on %s', (_s, surface) => {
    expect(contrast(c.text, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.muted, surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries({ ...surfaces, card2: c.card2 }))('an input border stands out on %s', (_s, surface) => {
    expect(contrast(c.inputBorder, surface)).toBeGreaterThanOrEqual(3);
  });
});

// Native keeps the iOS system blue, which carries white at 4.0:1: allowed for
// its large, bold button labels but not small text, so only the web is held to 4.5.
describe.each(sets.slice(0, 2))('%s primary button', (_name, c) => {
  it('label reads on the button', () => {
    expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onPrimary, c.primaryHover)).toBeGreaterThanOrEqual(4.5);
  });
});
