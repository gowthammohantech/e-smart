import { create } from 'zustand';
import { Address, PlanTier } from '@/types';
import { moduleSetFor } from '@/domain/plan';
import { today } from '@/lib/date';

export type OnboardingDraft = {
  name: string;
  legalName: string;
  businessType: string;
  plan: PlanTier;
  logoUri?: string;
  address: Address;
  email: string;
  phone: string;
  country: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  taxRegistered: boolean;
  taxIdentifier: string;
  compositionScheme: boolean;
  invoicePrefix: string;
  invoiceNextNumber: string;
  includeFiscalYear: boolean;
  branches: { name: string; code: string; city: string }[];
};

const emptyAddress: Address = {
  line1: '',
  city: '',
  state: '',
  stateCode: '',
  postalCode: '',
  country: 'IN',
};

type OnboardingState = {
  draft: OnboardingDraft;
  set: (patch: Partial<OnboardingDraft>) => void;
  setAddress: (patch: Partial<Address>) => void;
  reset: () => void;
};

const initial: OnboardingDraft = {
  name: '',
  legalName: '',
  businessType: 'Retail shop',
  plan: 'basic',
  address: emptyAddress,
  email: '',
  phone: '',
  country: 'IN',
  baseCurrency: 'INR',
  fiscalYearStartMonth: 4,
  taxRegistered: true,
  taxIdentifier: '',
  compositionScheme: false,
  invoicePrefix: 'INV',
  invoiceNextNumber: '1',
  includeFiscalYear: true,
  branches: [],
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  draft: initial,
  set: (patch) => set({ draft: { ...get().draft, ...patch } }),
  setAddress: (patch) => set({ draft: { ...get().draft, address: { ...get().draft.address, ...patch } } }),
  reset: () => set({ draft: { ...initial } }),
}));

export const ONBOARDING_STEPS = [
  { key: 'business', label: 'Business' },
  { key: 'country', label: 'Country' },
  { key: 'tax', label: 'Tax' },
  { key: 'numbering', label: 'Numbering' },
  { key: 'branches', label: 'Branches' },
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]['key'];

/**
 * A sales-only plan sells in India and has one location, so it skips the
 * country and branch steps: the defaults (India, INR, head office) stand.
 */
export function onboardingSteps(plan: PlanTier) {
  return moduleSetFor(plan) === 'full'
    ? ONBOARDING_STEPS
    : ONBOARDING_STEPS.filter((s) => s.key !== 'country' && s.key !== 'branches');
}

export function stepIndex(key: OnboardingStepKey, plan: PlanTier = 'pro'): number {
  return onboardingSteps(plan).findIndex((s) => s.key === key);
}

/** Where "Continue" goes from a step, given the plan chosen on the first one. */
export function nextStepRoute(key: OnboardingStepKey, plan: PlanTier) {
  const steps = onboardingSteps(plan);
  const next = steps[steps.findIndex((s) => s.key === key) + 1];
  return (next ? `/(onboarding)/${next.key}` : '/(onboarding)/done') as `/(onboarding)/${OnboardingStepKey | 'done'}`;
}

export { today };
