import React, { useEffect } from 'react';
import { useUiStore } from '../store/uiStore';
import { initReactI18next } from 'react-i18next';
import i18n, { initI18n } from '@esmart/i18n';
import type { LanguageCode } from '@esmart/i18n/config';
import { deviceLanguage } from './detect';

// Built at module scope, before React mounts, so the very first paint is
// already in the device's language rather than English-then-Tamil.
initI18n(deviceLanguage(), { plugins: [initReactI18next], debugMissingKeys: __DEV__ });

/** Resolves the stored preference to a language the app actually ships. */
export function useResolvedLanguage(): LanguageCode {
  const language = useUiStore((s) => s.language);
  return language === 'system' ? deviceLanguage() : language;
}

/**
 * Owns the one binding between the preference in `uiStore` and the i18next
 * instance — the same shape as ThemeProvider, which binds `themeMode` to the
 * palette. There is no `I18nextProvider` here on purpose: the default global
 * instance is what `useTranslation()` picks up anywhere in the tree.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const resolved = useResolvedLanguage();

  useEffect(() => {
    if (i18n.language !== resolved) void i18n.changeLanguage(resolved);
  }, [resolved]);

  return <>{children}</>;
}
