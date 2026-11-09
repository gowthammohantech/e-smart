/** Documents in the shapes they take, shared by the renderer tests. */
import i18n from '@esmart/i18n';
import type { BusinessDocument, Company, DocumentLine, EwayBill, Party, Branch } from '../../../types';
import { calculateDocument } from '../../../domain/lineCalc';
import { money } from '../../../lib/money';
import { buildDocumentHtml } from '../../documentHtml';

export const line = (over: Partial<DocumentLine> = {}): DocumentLine => ({
  id: 'l1',
  name: 'Milk',
  quantity: 1,
  unit: 'LTR',
  unitPrice: money(100_000, 'INR'),
  discountMode: 'amount',
  discountValue: 0,
  taxCategoryId: 'gst0',
  taxRate: 0,
  taxInclusive: false,
  hsnCode: '04011000',
  ...over,
});

export const LINES: DocumentLine[] = [
  line(),
  line({ id: 'l2', name: 'Curd', unit: 'KGS', unitPrice: money(50_000, 'INR'), taxCategoryId: 'gst18', taxRate: 18, hsnCode: '04039010', discountMode: 'percent', discountValue: 10 }),
  line({ id: 'l3', name: 'Butter', unit: 'KGS', unitPrice: money(60_000, 'INR'), taxCategoryId: 'gst12', taxRate: 12, hsnCode: '04051000', quantity: 2.5 }),
];

export function doc(over: Partial<BusinessDocument> = {}, interState = false): BusinessDocument {
  const base = {
    id: 'inv',
    companyId: 'c',
    branchId: 'b',
    kind: 'invoice',
    number: 'SI/2026-27/0035',
    status: 'issued',
    partyId: 'p',
    date: '2026-11-05',
    dueDate: '2026-12-05',
    currency: 'INR',
    exchangeRate: 1,
    lines: LINES,
    documentDiscountMode: 'amount',
    documentDiscountValue: 0,
    charges: money(0, 'INR'),
    applyRoundOff: true,
    placeOfSupplyStateCode: '33',
    reference: 'PO-778',
    notes: 'Sales to B2C customer',
    terms: 'Payment within 30 days.',
    attachmentIds: [],
    ...over,
  } as BusinessDocument;
  base.totals = calculateDocument({
    lines: base.lines,
    currency: base.currency,
    baseCurrency: 'INR',
    exchangeRate: base.exchangeRate,
    documentDiscountMode: base.documentDiscountMode,
    documentDiscountValue: base.documentDiscountValue,
    charges: base.charges,
    applyRoundOff: base.applyRoundOff,
    taxCategories: [
      { id: 'gst0', name: 'GST 0%', rate: 0 } as never,
      { id: 'gst12', name: 'GST 12%', rate: 12 } as never,
      { id: 'gst18', name: 'GST 18%', rate: 18 } as never,
    ],
    taxContext: { regime: 'GST', registered: true, homeStateCode: '33', placeOfSupplyStateCode: interState ? '29' : '33', reverseCharge: base.reverseCharge },
    tcsRate: base.tcs?.rate,
    date: base.date,
  });
  return base;
}

export const company = (over: Partial<Company> = {}) =>
  ({
    id: 'c',
    name: 'Shakthi Finance & Trading',
    baseCurrency: 'INR',
    phone: '8925622257',
    email: 'accounts@shakthi.example',
    address: { line1: '4/166 Pappankadu', line2: 'Arakkulam Paruvai Post', city: 'Tiruchendur', postalCode: '641662', state: 'Tamil Nadu', country: 'IN' },
    taxRegistration: { regime: 'GST', identifier: '33NDTPS4034R1ZD', identifierLabel: 'GSTIN' },
    bankDetails: { bankName: 'ICICI', accountName: 'Shakthi Finance', accountNumber: '987765678765', ifsc: 'ICIC0000976', branch: 'Thirupur', upiId: 'shakthi@okicici' },
    logoUri: 'https://example.com/logo.png',
    signatureUri: 'data:image/png;base64,AAAA',
    tan: 'CHES12345A',
    ...over,
  }) as unknown as Company;

export const party = {
  id: 'p',
  name: 'M/s. B2C Customer',
  billingAddress: { line1: '46A', city: 'Chennai', postalCode: '600066', state: 'Tamil Nadu', country: 'IN' },
  shippingAddress: { line1: '12 Port Road', city: 'Tuticorin', postalCode: '628001', state: 'Tamil Nadu', country: 'IN' },
  taxId: '33AAACB1234C1Z5',
  phone: '9000000000',
  email: 'buyer@example.com',
  customFields: { cf1: 'Gold' },
} as unknown as Party;

export const branch = { id: 'b', companyId: 'c', name: 'Head office', code: 'HO', address: { line1: '1 Main Bazaar', city: 'Thoothukudi', postalCode: '628002', state: 'Tamil Nadu', country: 'IN' }, gstin: '33NDTPS4034R2ZC', isPrimary: true } as Branch;

export const ewayBill = { ewayBillNumber: '381000123456', validUpto: '2026-11-07T23:59:59+05:30', transportMode: 'road', vehicleNumber: 'TN69AB1234', transporterName: 'Fast Movers' } as unknown as EwayBill;

export const einvoiced = {
  compliance: { eInvoiceStatus: 'generated', irn: 'a'.repeat(64), ackNo: '112410000000001', ackDate: '2026-11-05 10:00:00', signedQrPayload: 'eyJhbGciOiJSUzI1NiJ9.eyJkYXRhIjoiMSJ9.c2ln' },
} as Partial<BusinessDocument>;

export const customFields = [
  { id: 'cf1', entity: 'party', label: 'Tier', kind: 'text', showOnPdf: true },
  { id: 'cf2', entity: 'document', label: 'Lorry receipt', kind: 'text', showOnPdf: true },
] as never;

type Case = [string, Parameters<typeof buildDocumentHtml>[0]];
const en = i18n.getFixedT('en', null);
const ta = i18n.getFixedT('ta', null);
const base = { company: company(), party, t: en, language: 'en' as const };

export const CASES: Case[] = [
  ['bare invoice', { document: doc(), t: en, language: 'en' }],
  ['full invoice', { ...base, document: doc({ customFields: { cf2: 'LR-55' } } as never), branch, customFields }],
  ['e-invoice with e-way bill', { ...base, document: doc(einvoiced), ewayBill }],
  ['cancelled IRN', { ...base, document: doc({ compliance: { ...einvoiced.compliance, eInvoiceStatus: 'cancelled', irnCancelReasonCode: '2', irnCancelledAt: '2026-11-06T10:00:00Z' } } as never) }],
  ['inter-state', { ...base, document: doc({ placeOfSupplyStateCode: '29' }, true) }],
  ['TCS and reverse charge and document discount', { ...base, document: doc({ tcs: { section: '206C(1H)', rate: 0.1 }, documentDiscountValue: 50, charges: money(2500, 'INR') }) }],
  ['reimbursement line', { ...base, document: doc({ lines: [...LINES, line({ id: 'l4', name: 'Courier at cost', description: 'Paid on your behalf', taxRate: 0, hsnCode: undefined, gst: { reimbursement: true } } as never)] }) }],
  ['reverse charge', { ...base, document: doc({ reverseCharge: true }) }],
  ['charges taxed with the lines (from 1 Dec)', { ...base, document: doc({ date: '2026-12-10', charges: money(10_000, 'INR') }) }],
  ['nil and exempt lines', { ...base, document: doc({ lines: [line({ gst: { supplyType: 'exempt' } } as never), line({ id: 'l2', gst: { supplyType: 'nil' } } as never)] }) }],
  ['draft', { ...base, document: doc({ status: 'draft', number: 'INVOICE-DRAFT' }) }],
  ['composition dealer', { ...base, company: company({ taxRegistration: { regime: 'GST', identifier: '33NDTPS4034R1ZD', compositionScheme: true } } as never), document: doc() }],
  ['proforma', { ...base, document: doc({ kind: 'proforma', validUntil: '2026-11-30' }) }],
  ['credit note against an invoice', { ...base, document: doc({ kind: 'creditNote', noteReason: 'deficiency' }), source: { number: 'SI/2026-27/0030', date: '2026-10-01' } }],
  ['purchase bill (no bank block)', { ...base, document: doc({ kind: 'purchaseBill', supplierDocNumber: 'SUP-9' }) }],
  ['foreign currency', { ...base, document: doc({ currency: 'USD', exchangeRate: 83.25 }) }],
  ['template: compact, no columns, footer, no logo', { ...base, document: doc(), template: { accentColor: '#0B6E4F', showDiscountColumn: false, showTaxColumn: false, showHsn: false, showLogo: false, compact: true, footerText: 'Thank you' } }],
  ['tamil', { ...base, t: ta, language: 'ta', document: doc(einvoiced), ewayBill }],
];
