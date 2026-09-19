import { useTranslation } from 'react-i18next';
import type { PlanInfo } from '@/domain/plan';
import type { Translate } from '@/i18n/labels';

/**
 * The words for a plan tier. `src/domain/plan.ts` keeps the prices, the slugs
 * and the gating; everything a person reads is resolved here.
 *
 * Tier names are deliberately absent: 'Smart Pro' is a product name, so it is
 * read straight off `PlanInfo.name` in both languages.
 */
export function planBlurb(t: Translate, plan: PlanInfo): string {
  return t(`plan:tier.${plan.key}.blurb`);
}

export function planFeatures(t: Translate, plan: PlanInfo): string[] {
  return plan.features.map((slug) => t(`plan:tier.${plan.key}.feature.${slug}`));
}

export function usePlanCopy() {
  const { t } = useTranslation(['plan', 'domain']);
  return {
    t,
    blurb: (plan: PlanInfo) => planBlurb(t, plan),
    features: (plan: PlanInfo) => planFeatures(t, plan),
  };
}
