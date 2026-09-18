import { create } from 'zustand';
import { Address, TurnoverSlab } from '@/types';
import { today } from '@/lib/date';

export type OnboardingDraft = {
  name: string;
  legalName: string;
  businessType: string;
  logoUri?: string;
  address: Address;
  email: string;
  phone: string;
  fiscalYearStartMonth: number;
  taxRegistered: boolean;
  taxIdentifier: string;
  compositionScheme: boolean;
  turnoverSlab: TurnoverSlab;
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
  country: 'India',
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
  fiscalYearStartMonth: 4,
  taxRegistered: true,
  taxIdentifier: '',
  compositionScheme: false,
  turnoverSlab: 'under5cr',
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
  { key: 'tax', label: 'GST' },
  { key: 'numbering', label: 'Numbering' },
] as const;

export function stepIndex(key: string): number {
  return ONBOARDING_STEPS.findIndex((s) => s.key === key);
}

export { today };
