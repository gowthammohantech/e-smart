import { formatDate } from '@esmart/core/lib/date';
import { formatNumber } from '@esmart/core/lib/format';

export const fmtInt = (n: number) => formatNumber(n, 0);
export const fmtDate = (iso: string | null | undefined) => (iso ? formatDate(iso, 'dd MMM yyyy') : '—');
export const fmtDateTime = (iso: string | null | undefined) => (iso ? formatDate(iso, 'dd MMM yyyy, HH:mm') : '—');
export const fmtDay = (iso: string) => formatDate(iso, 'dd MMM');

export const PLAN_LABELS: Record<string, string> = { free: 'Free', basic: 'Basic', pro: 'Pro', business: 'Business' };
export const PLANS = ['free', 'basic', 'pro', 'business'] as const;

/** `account.suspend` → `Account suspended`. */
const ACTIONS: Record<string, string> = {
  'account.suspend': 'Suspended account',
  'account.reactivate': 'Reactivated account',
  'company.plan.override': 'Changed plan',
  'user.disable': 'Disabled user',
  'user.enable': 'Enabled user',
};
export const actionLabel = (action: string) => ACTIONS[action] ?? action;
