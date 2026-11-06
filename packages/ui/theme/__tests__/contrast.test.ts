import { blend, contrast, readableOn } from '../contrast';
import { palettes, type ColorTokens } from '../tokens';
import { webPalettes } from '../webTokens';

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

  // A selected nav item, a secondary button, a chip: primary text on the
  // chip tint laid over a surface, and on the stronger hovered tint.
  it.each([
    ['paper', 'chip'],
    ['card2', 'chip'],
    ['card2', 'hover'],
  ] as const)('primary text reads on its tint over %s (%s)', (surface, tint) => {
    const alpha = Number(/,\s*([\d.]+)\)$/.exec(c.chip)![1]) + (tint === 'hover' ? 0.06 : 0);
    expect(contrast(c.primary, blend(c.primary, c[surface], alpha))).toBeGreaterThanOrEqual(4.5);
  });
});

// Badges and status chips: a tone's text on its own soft tint, over the page and the grey card.
describe.each(sets.slice(0, 2))('%s status tones on their tints', (_name, c) => {
  const alphaOf = (rgba: string) => Number(/,\s*([\d.]+)\)$/.exec(rgba)![1]);
  it.each([
    ['good', 'goodSoft'],
    ['warn', 'warnSoft'],
    ['bad', 'badSoft'],
    ['muted', 'mutedSoft'],
  ] as const)('%s reads on %s', (tone, soft) => {
    for (const surface of [c.paper, c.card2, c.bg]) {
      expect(contrast(c[tone], blend(c[tone], surface, alphaOf(c[soft])))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('readableOn', () => {
  it('keeps a colour that already reads', () => {
    expect(readableOn('#101828', '#FFFFFF', '#000000')).toBe('#101828');
  });

  it('pulls a pale colour towards the text colour until it reads', () => {
    const out = readableOn('#00C2C7', '#DEF7F8', '#101828');
    expect(contrast(out, '#DEF7F8')).toBeGreaterThanOrEqual(4.5);
  });
});
