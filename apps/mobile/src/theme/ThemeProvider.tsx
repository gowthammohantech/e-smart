import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import {
  ColorTokens,
  fontSize,
  fontWeight,
  palettes,
  radius,
  spacing,
  typeMetrics,
} from './tokens';
import { useUiStore } from '@/store/uiStore';
import { useResolvedLanguage } from '@/i18n/I18nProvider';
import { Script, scriptOf } from '@/i18n/config';

export type ThemeMode = 'system' | 'light' | 'dark';

export type Theme = {
  scheme: 'light' | 'dark';
  /** The script the active language is written in; drives the type metrics. */
  script: Script;
  type: {
    /** Letter spacing for this script. Tamil gets none. */
    tracking: (px: number) => number;
    /** Line height for this script, or undefined to leave the platform default. */
    lineHeight: (size: number) => number | undefined;
  };
  c: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  /** Elevation preset used by cards and sheets. */
  shadow: {
    card: object;
    sheet: object;
    fab: object;
  };
};

const ThemeContext = createContext<Theme | null>(null);

function buildTheme(scheme: 'light' | 'dark', script: Script): Theme {
  const c = palettes[scheme];
  const metrics = typeMetrics[script];
  return {
    scheme,
    script,
    type: {
      // `|| 0` normalises -0, which multiplying a negative by zero produces.
      tracking: (px) => px * metrics.tracking || 0,
      lineHeight: (size) => (metrics.lineHeight ? Math.round(size * metrics.lineHeight) : undefined),
    },
    c,
    spacing,
    radius,
    fontSize,
    fontWeight,
    shadow: {
      card:
        scheme === 'dark'
          ? { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 }
          : { shadowColor: '#5A6478', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
      sheet:
        scheme === 'dark'
          ? { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 16 }
          : { shadowColor: '#5A6478', shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: -4 }, elevation: 16 },
      fab: {
        shadowColor: '#007AFF',
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      },
    },
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const mode = useUiStore((s) => s.themeMode);

  const scheme: 'light' | 'dark' =
    mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode;

  // The type scale is tuned for Latin, so it follows the language as well as
  // the colour scheme. This is why I18nProvider mounts outside ThemeProvider.
  const script = scriptOf(useResolvedLanguage());

  const theme = useMemo(() => buildTheme(scheme, script), [scheme, script]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside <ThemeProvider>');
  return t;
}
