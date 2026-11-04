import { useTheme } from '../theme/ThemeProvider';
import { LIXI } from '../components/LixiOrb';

/**
 * Colours for the illustrations. Surfaces and outlines follow the theme so the
 * scene sits on either page colour; the accents are fixed so it stays colourful
 * in both.
 */
export function useScenePalette() {
  const t = useTheme();
  const dark = t.scheme === 'dark';
  return {
    dark,
    paper: t.c.card,
    paper2: t.c.card2,
    edge: t.c.line,
    edgeStrong: t.c.lineStrong,
    ink: t.c.muted,
    inkSoft: t.c.mutedSoft,
    /** Secondary strokes — text lines on a page, dashed outlines. */
    inkFaint: dark ? 'rgba(142,152,172,0.5)' : 'rgba(90,100,120,0.32)',
    primarySoft: '#7FB6FF',
    primary: t.c.primary,
    info: t.c.info,
    good: t.c.good,
    warn: t.c.warn,
    bad: t.c.bad,
    blob: dark ? 0.16 : 0.1,
    wood: '#C98B4A',
    woodDark: '#A06A33',
    box: '#7FB6FF',
    boxEdge: '#4F93EA',
    skin: '#F2C6A0',
    hair: '#3A4256',
    phone: '#2A3142',
    ...LIXI,
  };
}

export type ScenePalette = ReturnType<typeof useScenePalette>;
