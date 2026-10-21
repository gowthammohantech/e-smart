import type { PlanTier } from '@esmart/core/types';
import { api } from './api';

export type PlanChange =
  /** A payment page to open; the plan changes only once the provider confirms it. */
  | { kind: 'checkout'; url: string }
  /** The paid plan ends with the current period. */
  | { kind: 'cancelScheduled' };

/**
 * Starts a plan change on the server. A paid plan returns the checkout to pay
 * on; Free cancels the subscription at the end of the period. Nothing here
 * changes the plan itself: the payments webhook does, then the app pulls.
 */
export async function changePlan(companyId: string, plan: PlanTier, cycle: 'monthly' | 'yearly'): Promise<PlanChange> {
  if (plan === 'free') {
    await api.POST('/companies/{companyId}/subscription/cancel', { params: { path: { companyId } } });
    return { kind: 'cancelScheduled' };
  }
  const { data } = await api.POST('/companies/{companyId}/subscription/checkout', { params: { path: { companyId } }, body: { plan, cycle } });
  if (!data?.checkoutUrl) throw new Error('The payment page is not available right now');
  return { kind: 'checkout', url: data.checkoutUrl };
}
