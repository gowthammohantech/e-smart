/// <reference path="./i18next.d.ts" />
// Hermes implements Intl.Collator, NumberFormat and DateTimeFormat but NOT
// Intl.PluralRules, which i18next's v4 JSON format depends on. Without this
// polyfill every plural silently resolves to `_other` — wrong for English, and
// wrong in a different way for Tamil, whose CLDR rule counts 0 as singular.
// It must be imported before init, and before anything calls `t`.
import 'intl-pluralrules';

// `use` is aliased: bare `use` trips the react-hooks rule, which reads any
// lowercase `use*` call as a hook.
import i18n, { changeLanguage, init, use as withPlugin, type Module } from 'i18next';

import { DEFAULT_NS, FALLBACK_LANGUAGE, LANGUAGE_CODES, LanguageCode, NAMESPACES } from './config';
import en from './locales/en';
import ta from './locales/ta';

export const resources = { en, ta } as const;

export type InitOptions = {
  /**
   * i18next plugins to register before init. The React apps pass
   * `initReactI18next`; the API passes nothing, so this package stays free of
   * React.
   */
  plugins?: Module[];
  /** Bracket missing keys on screen. Defaults to on outside production. */
  debugMissingKeys?: boolean;
};

// Read through globalThis so the package needs neither React Native's nor
// Node's ambient types.
function isDev(): boolean {
  const g = globalThis as { __DEV__?: boolean; process?: { env?: Record<string, string | undefined> } };
  if (typeof g.__DEV__ === 'boolean') return g.__DEV__;
  return g.process?.env?.NODE_ENV !== 'production';
}

/**
 * Builds the singleton. Safe to call more than once — the second call only
 * switches language, which is what a test doing `initI18n('ta')` wants.
 */
export function initI18n(lng: LanguageCode = FALLBACK_LANGUAGE, options: InitOptions = {}) {
  if (i18n.isInitialized) {
    if (i18n.language !== lng) void changeLanguage(lng);
    return i18n;
  }

  const debugMissingKeys = options.debugMissingKeys ?? isDev();
  for (const plugin of options.plugins ?? []) void withPlugin(plugin);

  void init({
    lng,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: [...LANGUAGE_CODES],
    resources,
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NS,
    fallbackNS: DEFAULT_NS,
    returnNull: false,
    returnEmptyString: false,
    // Resources are bundled, not fetched, so load them synchronously: no gap
    // to flash the wrong language through, and no async setup for tests to
    // await. (This was `initImmediate: false` before i18next 26.)
    initAsync: false,
    // React Native has no HTML to escape, and escaping would mangle ₹ and ·.
    interpolation: { escapeValue: false },
    // There is no Suspense boundary in app/_layout.tsx.
    react: { useSuspense: false },
    // The cheapest possible tracker for an un-migrated or mistyped key: it
    // shows up bracketed on screen in dev, and degrades to the bare key in
    // production rather than rendering nothing.
    parseMissingKeyHandler: (key) => (debugMissingKeys ? `⟦${key}⟧` : key),
  });

  return i18n;
}

export default i18n;
