import type { ComponentType } from 'react';
import type { SceneProps } from './scenes/kit';
import { EmptyDashboard, Loading, Scanning, SetupComplete, Welcome } from './scenes/heroes';
import {
  AllSettled,
  NoContacts,
  NoDocuments,
  NoExpenses,
  NoItems,
  NoMovements,
  NoNotifications,
  NoPayments,
  NoScanResult,
  NotFound,
  SearchEmpty,
  SearchIdle,
  SingleLocation,
  UnknownReport,
} from './scenes/states';
import { ErrorScene, Invite, Locked, MailSent, Offline, Secure } from './scenes/system';
import {
  OnboardingBranches,
  OnboardingBusiness,
  OnboardingCountry,
  OnboardingNumbering,
  OnboardingTax,
} from './scenes/onboarding';

/**
 * Every illustration the app can show, by semantic name. Each is an animated
 * SVG scene drawn in `scenes/`: it follows the theme, stays crisp at any size,
 * ships no image files, and holds still under Reduce Motion.
 */
export const ILLUSTRATIONS = {
  /* Heroes */
  welcome: Welcome,
  'setup-complete': SetupComplete,
  scanning: Scanning,
  'empty-dashboard': EmptyDashboard,
  loading: Loading,

  /* Full-size states */
  'not-found': NotFound,
  'mail-sent': MailSent,
  'search-idle': SearchIdle,
  'search-empty': SearchEmpty,
  'single-location': SingleLocation,
  'no-scan-result': NoScanResult,
  'unknown-report': UnknownReport,
  offline: Offline,
  error: ErrorScene,
  locked: Locked,
  secure: Secure,
  invite: Invite,

  /* Compact empty states */
  'no-documents': NoDocuments,
  'no-contacts': NoContacts,
  'no-items': NoItems,
  'no-expenses': NoExpenses,
  'no-payments': NoPayments,
  'all-settled': AllSettled,
  'no-notifications': NoNotifications,
  'no-movements': NoMovements,

  /* Onboarding steps, keyed `onboarding-<step>` */
  'onboarding-business': OnboardingBusiness,
  'onboarding-country': OnboardingCountry,
  'onboarding-tax': OnboardingTax,
  'onboarding-numbering': OnboardingNumbering,
  'onboarding-branches': OnboardingBranches,
} satisfies Record<string, ComponentType<SceneProps>>;

export type IllustrationName = keyof typeof ILLUSTRATIONS;

export function isIllustrationName(name: string): name is IllustrationName {
  return name in ILLUSTRATIONS;
}

/** Display heights, in points. The art is 4:3, so width follows. */
export const ILLUSTRATION_SIZES = {
  hero: 200,
  full: 160,
  compact: 104,
} as const;

export type IllustrationSize = keyof typeof ILLUSTRATION_SIZES;
