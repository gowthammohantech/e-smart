import { ImageSourcePropType } from 'react-native';

/**
 * Every illustration the app can show, by semantic name.
 *
 * The files in `assets/illustrations/` are placeholders in the Storyset
 * "Rafiki" spirit. To use the real artwork, drop the download over the file of
 * the same name — nothing here needs to change. See
 * `assets/illustrations/README.md` for which Rafiki illustration belongs to
 * each slot.
 *
 * `require` must stay a literal path: Metro resolves these at build time, so a
 * name can only be added here alongside a file that exists.
 */
export const ILLUSTRATIONS = {
  /* Heroes — animated */
  welcome: require('../../assets/illustrations/welcome.gif'),
  'setup-complete': require('../../assets/illustrations/setup-complete.gif'),
  scanning: require('../../assets/illustrations/scanning.gif'),
  'empty-dashboard': require('../../assets/illustrations/empty-dashboard.gif'),

  /* Full-size empty states */
  'not-found': require('../../assets/illustrations/not-found.png'),
  'mail-sent': require('../../assets/illustrations/mail-sent.png'),
  'search-idle': require('../../assets/illustrations/search-idle.png'),
  'search-empty': require('../../assets/illustrations/search-empty.png'),
  'single-location': require('../../assets/illustrations/single-location.png'),
  'no-scan-result': require('../../assets/illustrations/no-scan-result.png'),
  'unknown-report': require('../../assets/illustrations/unknown-report.png'),
  offline: require('../../assets/illustrations/offline.png'),

  /* Compact empty states */
  'no-documents': require('../../assets/illustrations/no-documents.png'),
  'no-contacts': require('../../assets/illustrations/no-contacts.png'),
  'no-items': require('../../assets/illustrations/no-items.png'),
  'no-expenses': require('../../assets/illustrations/no-expenses.png'),
  'no-payments': require('../../assets/illustrations/no-payments.png'),
  'all-settled': require('../../assets/illustrations/all-settled.png'),
  'no-notifications': require('../../assets/illustrations/no-notifications.png'),
  'no-movements': require('../../assets/illustrations/no-movements.png'),
} satisfies Record<string, ImageSourcePropType>;

export type IllustrationName = keyof typeof ILLUSTRATIONS;

/** Display heights, in points. The art is 4:3, so width follows. */
export const ILLUSTRATION_SIZES = {
  hero: 200,
  full: 160,
  compact: 104,
} as const;

export type IllustrationSize = keyof typeof ILLUSTRATION_SIZES;

/** Credit required by the Storyset free licence. */
export const ILLUSTRATION_CREDIT = {
  label: 'Illustrations by Storyset',
  url: 'https://storyset.com',
};
