import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Address, NumberingSeries, PlanTier } from '@esmart/core/types';
import { today } from '@esmart/core/lib/date';
import { DEFAULT_DIAL_CODE } from '@esmart/core/lib/phone';

export type OnboardingDraft = {
  name: string;
  legalName: string;
  businessType: string;
  plan: PlanTier;
  logoUri?: string;
  address: Address;
  email: string;
  /** The country code, kept apart so it can become a picker. */
  phoneDialCode: string;
  /** The number without the code, digits only. */
  phone: string;
  country: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  taxRegistered: boolean;
  taxIdentifier: string;
  /** The GSTIN the business details were last filled from, so going back to Tax doesn't fill them over again. */
  prefilledFromGstin: string;
  compositionScheme: boolean;
  invoicePrefix: string;
  invoiceNextNumber: string;
  includeFiscalYear: boolean;
  branches: {
    name: string;
    code: string;
    city: string;
    line1?: string;
    stateCode?: string;
    postalCode?: string;
    gstin?: string;
  }[];
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
  // A slug from BUSINESS_TYPES; labels live in `onboarding:businessType.*`.
  businessType: 'retail',
  // Sign-up is free only for now; the paid plans can't be bought yet.
  plan: 'free',
  address: emptyAddress,
  email: '',
  phoneDialCode: DEFAULT_DIAL_CODE,
  phone: '',
  country: 'IN',
  baseCurrency: 'INR',
  fiscalYearStartMonth: 4,
  taxRegistered: true,
  taxIdentifier: '',
  prefilledFromGstin: '',
  compositionScheme: false,
  invoicePrefix: 'INV',
  invoiceNextNumber: '1',
  includeFiscalYear: true,
  branches: [],
};

/**
 * The draft persists on the device (localStorage on the web), so a refresh or
 * a relaunch halfway through setup keeps what was typed. `done` and sign-out
 * call `reset`, which clears it.
 */
export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      draft: initial,
      set: (patch) => set({ draft: { ...get().draft, ...patch } }),
      setAddress: (patch) => set({ draft: { ...get().draft, address: { ...get().draft.address, ...patch } } }),
      reset: () => set({ draft: { ...initial } }),
    }),
    {
      name: 'ebs.onboarding.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ draft: s.draft }),
      // Fields added since a draft was saved fall back to their defaults.
      merge: (persisted, current) => {
        const saved = (persisted as { draft?: Partial<OnboardingDraft> } | undefined)?.draft;
        return saved
          ? { ...current, draft: { ...initial, ...saved, address: { ...emptyAddress, ...saved.address } } }
          : current;
      },
    },
  ),
);

/** Step order: Tax comes first so a GSTIN can fill in the business details after it. Names live in `onboarding:step.*`. */
export const ONBOARDING_STEPS = ['tax', 'business', 'country', 'numbering', 'branches'] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

/**
 * The steps every plan walks. Country is skipped: the app sells in India
 * only for now, so its defaults (India, INR, April year) stand, and the
 * year can be changed in Settings. Branches are skipped: every business
 * starts on Free, which has one location (the head office), so branches are
 * added from Settings once it is upgraded.
 */
export function onboardingSteps(plan: PlanTier): OnboardingStepKey[] {
  void plan;
  return ONBOARDING_STEPS.filter((s) => s !== 'country' && s !== 'branches');
}

export function stepIndex(key: OnboardingStepKey, plan: PlanTier = 'pro'): number {
  return onboardingSteps(plan).indexOf(key);
}

/** Where "Continue" goes from a step, given the plan chosen on the first one. */
export function nextStepRoute(key: OnboardingStepKey, plan: PlanTier) {
  const steps = onboardingSteps(plan);
  const next = steps[steps.indexOf(key) + 1];
  return (next ? `/(onboarding)/${next}` : '/(onboarding)/done') as `/(onboarding)/${OnboardingStepKey | 'done'}`;
}

/**
 * The numbering choices of onboarding applied to the series made at setup: the invoice series
 * takes the prefix and start number, and every series takes the format (financial year on or
 * off), keeping its own prefix. Returns only the series that change.
 */
export function onboardingSeries(series: NumberingSeries[], draft: Pick<OnboardingDraft, 'invoicePrefix' | 'invoiceNextNumber' | 'includeFiscalYear'>): NumberingSeries[] {
  return series.flatMap((s) => {
    if (s.kind === 'invoice') return [{ ...s, prefix: draft.invoicePrefix || 'INV', nextNumber: Number(draft.invoiceNextNumber) || 1, includeFiscalYear: draft.includeFiscalYear }];
    return s.includeFiscalYear === draft.includeFiscalYear ? [] : [{ ...s, includeFiscalYear: draft.includeFiscalYear }];
  });
}

export { today };
