import { ExpenseCategory, Integration, TaxCategory, Unit } from '@/types';
import { GST_STATE_CODES } from '@/domain/stateCodes';

/** Every state and union territory that issues GSTINs, by name, for pickers. */
export const INDIAN_STATES: { code: string; name: string }[] = GST_STATE_CODES.filter((s) => s.code !== '97')
  .map(({ code, name }) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function stateName(code?: string): string {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? '—';
}

export const COUNTRIES: {
  code: string;
  name: string;
  currency: string;
  regime: 'GST' | 'VAT' | 'NONE';
  taxIdLabel: string;
  fiscalYearStartMonth: number;
}[] = [
  { code: 'IN', name: 'India', currency: 'INR', regime: 'GST', taxIdLabel: 'GSTIN', fiscalYearStartMonth: 4 },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', regime: 'VAT', taxIdLabel: 'TRN', fiscalYearStartMonth: 1 },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', regime: 'VAT', taxIdLabel: 'VAT No.', fiscalYearStartMonth: 4 },
  { code: 'SG', name: 'Singapore', currency: 'SGD', regime: 'GST', taxIdLabel: 'GST Reg. No.', fiscalYearStartMonth: 1 },
  { code: 'US', name: 'United States', currency: 'USD', regime: 'NONE', taxIdLabel: 'EIN', fiscalYearStartMonth: 1 },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', regime: 'VAT', taxIdLabel: 'VAT No.', fiscalYearStartMonth: 1 },
];

/**
 * Business-type slugs. `Company.businessType` stores the slug, not the label,
 * so a company keeps its type when the language changes. The words live in
 * `onboarding:businessType.*`.
 */
export const BUSINESS_TYPES = [
  'retail',
  'wholesale',
  'services',
  'freelancer',
  'distributor',
  'manufacturer',
  'restaurant',
  'other',
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

/**
 * Before the slugs, the English label was persisted directly. This maps the
 * eight that shipped, so an existing company keeps its selection.
 */
export const LEGACY_BUSINESS_TYPE_LABELS: Record<string, BusinessType> = {
  'Retail shop': 'retail',
  'Wholesale / Trading': 'wholesale',
  Services: 'services',
  'Freelancer / Professional': 'freelancer',
  Distributor: 'distributor',
  Manufacturer: 'manufacturer',
  'Restaurant / Café': 'restaurant',
  Other: 'other',
};

export const UNITS: Unit[] = [
  { id: 'unit_pcs', code: 'PCS', name: 'Pieces', decimals: 0 },
  { id: 'unit_box', code: 'BOX', name: 'Box', decimals: 0 },
  { id: 'unit_kg', code: 'KG', name: 'Kilogram', decimals: 3 },
  { id: 'unit_ltr', code: 'LTR', name: 'Litre', decimals: 2 },
  { id: 'unit_mtr', code: 'MTR', name: 'Metre', decimals: 2 },
  { id: 'unit_hr', code: 'HR', name: 'Hour', decimals: 2 },
  { id: 'unit_day', code: 'DAY', name: 'Day', decimals: 1 },
  { id: 'unit_set', code: 'SET', name: 'Set', decimals: 0 },
  { id: 'unit_nos', code: 'NOS', name: 'Numbers', decimals: 0 },
];

/** Units a service can be billed in — counts and time, never weight or volume. */
export const SERVICE_UNIT_CODES = ['NOS', 'HR', 'DAY'];

export function unitsFor(type: 'goods' | 'service'): Unit[] {
  return type === 'service' ? UNITS.filter((u) => SERVICE_UNIT_CODES.includes(u.code)) : UNITS;
}

/** Decimal places a quantity in this unit may carry (NOS/PCS are whole numbers). */
export function unitDecimals(code: string): number {
  return UNITS.find((u) => u.code === code)?.decimals ?? 2;
}

export function gstCategories(companyId: string): TaxCategory[] {
  const base = [
    { id: 'tax_0', name: 'GST 0% (Exempt)', rate: 0 },
    { id: 'tax_5', name: 'GST 5%', rate: 5 },
    { id: 'tax_12', name: 'GST 12%', rate: 12 },
    { id: 'tax_18', name: 'GST 18%', rate: 18 },
    { id: 'tax_28', name: 'GST 28%', rate: 28 },
  ];
  return base.map((b) => ({
    id: b.id,
    companyId,
    name: b.name,
    rate: b.rate,
    type: 'GST' as const,
    effectiveFrom: '2017-07-01',
    description: b.rate === 0 ? 'Exempt / nil-rated supplies' : `Standard ${b.rate}% slab`,
  }));
}

export function expenseCategories(companyId: string): ExpenseCategory[] {
  return [
    { id: 'exp_rent', companyId, name: 'Rent', icon: 'home-city-outline', color: '#4DA3FF' },
    { id: 'exp_salary', companyId, name: 'Salaries & wages', icon: 'account-group-outline', color: '#34C88A' },
    { id: 'exp_transport', companyId, name: 'Transport & freight', icon: 'truck-outline', color: '#F0B429' },
    { id: 'exp_utilities', companyId, name: 'Utilities', icon: 'flash-outline', color: '#FF6B6B' },
    { id: 'exp_marketing', companyId, name: 'Marketing', icon: 'bullhorn-outline', color: '#C77DFF' },
    { id: 'exp_office', companyId, name: 'Office supplies', icon: 'paperclip', color: '#8E98AC' },
    { id: 'exp_travel', companyId, name: 'Travel', icon: 'airplane', color: '#00C2C7' },
    { id: 'exp_professional', companyId, name: 'Professional fees', icon: 'briefcase-outline', color: '#FF9F45' },
    { id: 'exp_repairs', companyId, name: 'Repairs & maintenance', icon: 'wrench-outline', color: '#7AA2F7' },
    { id: 'exp_bank', companyId, name: 'Bank charges', icon: 'bank-outline', color: '#B5BFD0' },
  ];
}

export const INTEGRATIONS: Integration[] = [
  { id: 'int_razorpay', name: 'Razorpay', description: 'Collect invoice payments online.', icon: 'credit-card-outline', category: 'payments', connected: true },
  { id: 'int_upi', name: 'UPI / QR', description: 'Show a UPI QR code on every invoice.', icon: 'qrcode', category: 'payments', connected: true },
  { id: 'int_einvoice', name: 'GST e-Invoice (IRP)', description: 'Generate IRN and signed QR for B2B invoices.', icon: 'shield-check-outline', category: 'compliance', connected: true, configRoute: '/(app)/settings/e-invoicing' },
  { id: 'int_eway', name: 'E-way bill', description: 'Generate e-way bills for goods movement.', icon: 'truck-fast-outline', category: 'compliance', connected: true, configRoute: '/(app)/settings/e-invoicing' },
  { id: 'int_whatsapp', name: 'WhatsApp Business', description: 'Send invoices and reminders on WhatsApp.', icon: 'whatsapp', category: 'messaging', connected: true },
  { id: 'int_sms', name: 'SMS gateway', description: 'Payment reminders over SMS.', icon: 'message-text-outline', category: 'messaging', connected: false },
  { id: 'int_tally', name: 'Tally export', description: 'Export vouchers into Tally.', icon: 'file-export-outline', category: 'accounting', connected: false },
  { id: 'int_drive', name: 'Google Drive backup', description: 'Nightly backup of documents.', icon: 'cloud-upload-outline', category: 'storage', connected: false },
];

/** Payment method codes. The words live in `domain:paymentMethod.*`. */
export const PAYMENT_METHODS = ['cash', 'bank', 'upi', 'card', 'cheque', 'wallet', 'other'] as const;

export const PAYMENT_METHOD_ICONS: Record<string, string> = {
  cash: 'cash',
  bank: 'bank-outline',
  upi: 'cellphone-nfc',
  card: 'credit-card-outline',
  cheque: 'checkbook',
  wallet: 'wallet-outline',
  other: 'dots-horizontal',
};
