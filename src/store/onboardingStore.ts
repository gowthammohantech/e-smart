import { create } from 'zustand';
import { Address } from '@/types';
import { today } from '@/lib/date';

export type OnboardingDraft = {
  name: string;
  legalName: string;
  businessType: string;
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

export function stepIndex(key: string): number {
  return ONBOARDING_STEPS.findIndex((s) => s.key === key);
}

export { today };
