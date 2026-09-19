/**
 * The languages the app ships. `system` follows the device and falls back to
 * English for anything not on this list, so adding a locale is one entry here
 * plus one folder under `locales/`.
 */
export const LANGUAGE_CODES = ['en', 'ta'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

/** What the picker stores. `system` resolves at render, the rest are explicit. */
export type AppLanguage = 'system' | LanguageCode;

export type LanguageInfo = {
  code: LanguageCode;
  /** The language's name in English, for the English UI. */
  label: string;
  /** The language's name in its own script — what the picker shows. */
  native: string;
};

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
];

export const FALLBACK_LANGUAGE: LanguageCode = 'en';

export function isLanguageCode(v: string | undefined | null): v is LanguageCode {
  return !!v && (LANGUAGE_CODES as readonly string[]).includes(v);
}

/** The scripts the type scale is tuned for. Tamil needs its own metrics. */
export type Script = 'latin' | 'tamil';

export function scriptOf(lang: LanguageCode): Script {
  return lang === 'ta' ? 'tamil' : 'latin';
}

export const NAMESPACES = [
  'common',
  'nav',
  'auth',
  'onboarding',
  'sales',
  'purchases',
  'inventory',
  'contacts',
  'compliance',
  'reports',
  'settings',
  'lixi',
  'domain',
  'plan',
  'errors',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

export const DEFAULT_NS = 'common';
