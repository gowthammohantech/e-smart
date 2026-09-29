import { useTheme } from '@/theme/ThemeProvider';
import { LIXI } from '@/features/lixi/LixiOrb';

/**
 * Colours for the Welcome scene. Surfaces and outlines follow the theme so the
 * scene sits on either page colour; the accents are fixed so it stays colourful
 * in both. Skin and hair match the placeholder art in tools/illustrations.
 */
export function useScenePalette() {
  const t = useTheme();
  const dark = t.scheme === 'dark';
  return {
    dark,
    paper: t.c.card,
    paper2: t.c.card2,
    edge: t.c.line,
    ink: t.c.muted,
    inkSoft: t.c.mutedSoft,
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
