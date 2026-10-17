import React from 'react';
import { ThemeProvider } from '@esmart/ui/theme/ThemeProvider';
import { scriptOf } from '@esmart/i18n/config';
import { useUiStore } from '../store/uiStore';
import { useResolvedLanguage } from '../i18n/I18nProvider';

/**
 * Feeds the ui store's theme preference into the UI kit's ThemeProvider.
 *
 * The type scale is tuned for Latin, so it follows the language as well as
 * the colour scheme. This is why I18nProvider mounts outside it.
 */
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useUiStore((s) => s.themeMode);
  const script = scriptOf(useResolvedLanguage());
  return (
    <ThemeProvider mode={mode} script={script}>
      {children}
    </ThemeProvider>
  );
}
