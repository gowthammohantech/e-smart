import { Integration, TaxCategory, Unit } from '@/types';
import { GST_STATE_CODES, stateNameOf } from '@/domain/gst/stateCodes';

/** The full allotted list now lives with the GST engine that validates against it. */
export const INDIAN_STATES = GST_STATE_CODES;

export const stateName = stateNameOf;

export const BUSINESS_TYPES = [
  'Retail shop',
  'Wholesale / Trading',
  'Services',
  'Freelancer / Professional',
  'Distributor',
  'Manufacturer',
  'Restaurant / Café',
  'Other',
];

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

export const INTEGRATIONS: Integration[] = [
  { id: 'int_einvoice', name: 'GST e-Invoice (IRP)', description: 'Register invoices and receive an IRN with a signed QR.', icon: 'shield-check-outline', category: 'compliance', connected: true },
  { id: 'int_eway', name: 'E-way bill (NIC)', description: 'Generate and track e-way bills for goods in transit.', icon: 'truck-fast-outline', category: 'compliance', connected: true },
  { id: 'int_gstr', name: 'GSTR-1 filing', description: 'Push the outward-supplies return to the GST portal.', icon: 'file-send-outline', category: 'compliance', connected: false },
  { id: 'int_razorpay', name: 'Razorpay', description: 'Collect invoice payments online.', icon: 'credit-card-outline', category: 'payments', connected: true },
  { id: 'int_upi', name: 'UPI / QR', description: 'Show a UPI QR code on every invoice.', icon: 'qrcode', category: 'payments', connected: true },
  { id: 'int_whatsapp', name: 'WhatsApp Business', description: 'Send invoices and reminders on WhatsApp.', icon: 'whatsapp', category: 'messaging', connected: true },
  { id: 'int_tally', name: 'Tally export', description: 'Export vouchers into Tally.', icon: 'file-export-outline', category: 'accounting', connected: false },
];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank transfer',
  upi: 'UPI',
  card: 'Card',
  cheque: 'Cheque',
  wallet: 'Wallet',
  other: 'Other',
};

export const PAYMENT_METHOD_ICONS: Record<string, string> = {
  cash: 'cash',
  bank: 'bank-outline',
  upi: 'cellphone-nfc',
  card: 'credit-card-outline',
  cheque: 'checkbook',
  wallet: 'wallet-outline',
  other: 'dots-horizontal',
};
