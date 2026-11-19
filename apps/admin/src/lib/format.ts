import { formatDate } from '@esmart/core/lib/date';
import { formatNumber } from '@esmart/core/lib/format';

export const fmtInt = (n: number) => formatNumber(n, 0);
export const fmtDate = (iso: string | null | undefined) => (iso ? formatDate(iso, 'dd MMM yyyy') : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? formatDate(iso, 'dd MMM yyyy, HH:mm') : '—');
export const fmtDay = (iso: string) => formatDate(iso, 'dd MMM');

export const PLAN_LABELS: Record<string, string> = { free: 'Free', basic: 'Basic', pro: 'Pro', business: 'Business' };
export const PLANS = ['free', 'basic', 'pro', 'business'] as const;

/** The GST gateways (GSPs) a company can file through, and the NIC environment each is used in. */
export const GSP_LABELS = { adaequare: 'Adaequare', whitebooks: 'Whitebooks' } as const;
export const GSP_ENV_LABELS = { sandbox: 'Sandbox', production: 'Production' } as const;

/** `Adaequare – Production`: one target, the way an operator picks it. */
export const gspTargetLabel = (t: { gateway: keyof typeof GSP_LABELS; environment: keyof typeof GSP_ENV_LABELS }) => `${GSP_LABELS[t.gateway]} – ${GSP_ENV_LABELS[t.environment]}`;

/** `account.suspend` → `Suspended account`; an action with no label here shows as it is. */
const ACTIONS: Record<string, string> = {
  'account.suspend': 'Suspended account',
  'account.reactivate': 'Reactivated account',
  'company.plan.override': 'Changed plan',
  'company.gsp.set': 'Changed GST gateway',
  'user.disable': 'Disabled user',
  'user.enable': 'Enabled user',
  'operator.role_granted': 'Changed platform role',
  'operator.role_removed': 'Removed platform access',
  'operator.signed_in': 'Signed in',
  // Looking is recorded too (see the platform handlers).
  'account.viewed': 'Viewed account',
  'company.viewed': 'Viewed company',
  'users.searched': 'Searched users',
  'account.purged': 'Purged account',
  'company.purged': 'Purged company',
  // Two-step sign-in (lib/mfaFlow, and db:platform-admin --reset-mfa).
  'mfa.enrolled': 'Set up two-step sign-in',
  'mfa.verified': 'Passed two-step sign-in',
  'mfa.failed': 'Failed two-step sign-in',
  'mfa.recovery_code_used': 'Used a recovery code',
  'mfa.disabled': 'Turned off two-step sign-in',
  'mfa.reset': 'Reset two-step sign-in',
};
export const actionLabel = (action: string) => ACTIONS[action] ?? action;

/** Third parties the API calls, as the Third-Party Call Logs page names them; one not listed shows as it is stored. */
export const SERVICE_LABELS: Record<string, string> = {
  adaequare: 'Adaequare',
  whitebooks: 'Whitebooks',
  gsp: 'GST gateway',
  razorpay: 'Razorpay',
  msg91: 'MSG91',
  pay4sms: 'Pay4SMS',
  resend: 'Resend',
  ses: 'AWS SES',
  acs: 'Azure email',
  whatsapp: 'WhatsApp',
  expo: 'Expo push',
  ai: 'AI model',
  openexchangerates: 'Open Exchange Rates',
};
export const serviceLabel = (service: string) => SERVICE_LABELS[service] ?? service;

export const fmtMs = (ms: number | null | undefined) => (ms === null || ms === undefined ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s` : `${ms} ms`);
