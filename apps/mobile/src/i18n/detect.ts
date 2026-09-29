import { getLocales } from 'expo-localization';
import { FALLBACK_LANGUAGE, LanguageCode, isLanguageCode } from './config';

/**
 * The device's preferred language, narrowed to one the app ships.
 *
 * `getLocales()` reads a cached native value and returns synchronously, so this
 * can run at module scope — the first paint is already in the right language,
 * with no async gap to flash English through.
 */
export function deviceLanguage(): LanguageCode {
  try {
    for (const locale of getLocales()) {
      if (isLanguageCode(locale.languageCode)) return locale.languageCode;
    }
  } catch {
    // getLocales() throws if the native module is missing (e.g. a bare jest
    // environment). English is the right answer there.
  }
  return FALLBACK_LANGUAGE;
}
