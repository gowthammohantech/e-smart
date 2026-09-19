import 'i18next';
import type en from './locales/en';

/**
 * Types every key against the English catalogue, so under `strict` a misspelt
 * or missing key is a compile error rather than a string rendered at runtime.
 * The type grows as each namespace is filled in, stage by stage.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: typeof en;
    returnNull: false;
  }
}
