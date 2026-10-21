import { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useToast } from '@esmart/ui/components/Toast';
import { planInfo } from '@esmart/core/domain/plan';
import type { PlanTier } from '@esmart/core/types';
import { changePlan } from '../../remote/billing';
import { describeError } from '../../remote/errors';

/**
 * "Choose this plan": opens the payment page and leaves the current plan alone
 * until the payment is confirmed (the plan then changes through the billing
 * webhook). A failure is said out loud rather than swallowed.
 */
export function usePlanChange(companyId: string, cycle: 'monthly' | 'yearly') {
  const { t: tr } = useTranslation(['plan']);
  const toast = useToast();
  const [pending, setPending] = useState<PlanTier | null>(null);

  const choose = async (tier: PlanTier) => {
    if (pending) return;
    setPending(tier);
    try {
      const name = planInfo(tier).name;
      const result = await changePlan(companyId, tier, cycle);
      if (result.kind === 'cancelScheduled') {
        toast.show(tr('plan:billing.cancelScheduled', { plan: name }), 'info');
        return;
      }
      toast.show(tr('plan:billing.checkoutOpened', { plan: name }), 'info');
      // The same tab on the web: a window opened after an async call is blocked as a popup.
      if (Platform.OS === 'web') window.location.assign(result.url);
      else await Linking.openURL(result.url);
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setPending(null);
    }
  };

  return { choose, pending };
}
