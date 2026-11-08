import { CHARGES_TAXED_FROM, calculateDocument, chargeShares, linesWithCharges, taxedCharges } from '../lineCalc';
import { postDocument, type Posting } from '../ledger/postings';
import { gstr1Summary } from '../gstr1';
import { itcOfDocument } from '../itc';
import type { Address, BusinessDocument, Company, DocumentKind, DocumentLine, Party } from '../../types';
import { fromMajor, zero } from '../../lib/money';

/** RULES 1.10: from CHARGES_TAXED_FROM, charges are spread over the lines and taxed with them. */

const inr = (major: string) => fromMajor(major, 'INR');
const address = (stateCode: string): Address => ({ line1: '1 Main Road', city: 'City', state: '', stateCode, postalCode: '400001', country: 'IN' });
const COMPANY = {
  id: 'cmp',
  address: address('27'),
  taxRegistration: { regime: 'GST', identifier: '27AABCV1234F1ZO', identifierLabel: 'GSTIN', registered: true, placeOfSupplyStateCode: '27' },
} as Company;
const BUYER = { id: 'cus', companyId: 'cmp', kind: 'customer', name: 'Buyer', code: 'C1', currency: 'INR', taxId: '27AACFA9876P1ZH', billingAddress: address('27'), openingBalance: zero('INR'), paymentTermsDays: 30, status: 'active', createdAt: '' } as Party;

const AFTER = '2026-12-05';
const BEFORE = '2026-11-28';

const line = (over: Partial<DocumentLine> = {}): DocumentLine => ({
  id: over.id ?? 'ln',
  name: 'Sheet',
  hsnCode: '39211900',
  quantity: 1,
  unit: 'PCS',
  unitPrice: inr('1000'),
  discountMode: 'percent',
  discountValue: 0,
  taxCategoryId: `tax_${over.taxRate ?? 18}`,
  taxRate: 18,
  taxInclusive: false,
  ...over,
});

function doc(over: Partial<BusinessDocument> & { lines: DocumentLine[] }, kind: DocumentKind = 'invoice', registered = true): BusinessDocument {
  const date = over.date ?? AFTER;
  const charges = over.charges ?? inr('100');
  const totals = calculateDocument({
    lines: over.lines,
    currency: 'INR',
    baseCurrency: 'INR',
    exchangeRate: 1,
    documentDiscountMode: 'amount',
    documentDiscountValue: over.documentDiscountValue ?? 0,
    charges,
    applyRoundOff: false,
    taxCategories: [],
    taxContext: { regime: 'GST', registered, homeStateCode: '27', placeOfSupplyStateCode: '27' },
    date,
  });
  return {
    id: 'd1', companyId: 'cmp', branchId: 'brn', kind, number: 'INV-1', status: 'issued', partyId: 'cus', currency: 'INR', exchangeRate: 1,
    documentDiscountMode: 'amount', documentDiscountValue: 0, applyRoundOff: false, placeOfSupplyStateCode: '27', attachmentIds: [],
    createdBy: 'u', createdAt: '', updatedAt: '',
    ...over,
    date,
    charges,
    totals,
  };
}

const balanced = (ps: Posting[]) => ps.reduce((a, p) => a + p.debit - p.credit, 0);
const net = (ps: Posting[], account: string) => ps.filter((p) => p.account === account).reduce((a, p) => a + p.debit - p.credit, 0);

describe('charges taxed with the lines (RULES 1.10)', () => {
  it('starts on 1 December 2026', () => {
    expect(CHARGES_TAXED_FROM).toBe('2026-12-01');
  });

  it('taxes the charges at the rate of a single line', () => {
    const d = doc({ lines: [line()] });
    expect(d.totals.taxableAmount.minor).toBe(110000);
    expect(d.totals.totalTax.minor).toBe(19800);
    expect(d.totals.charges.minor).toBe(0);
    expect(d.totals.chargesTaxed?.minor).toBe(10000);
    expect(d.totals.grandTotal.minor).toBe(129800);
  });

  it('spreads the charges over 5% and 18% lines by taxable value, to the paisa', () => {
    const d = doc({ lines: [line({ id: 'a', taxRate: 5, unitPrice: inr('3000') }), line({ id: 'b', taxRate: 18, unitPrice: inr('1000') })], charges: inr('100.01') });
    expect(chargeShares(d)).toEqual([7501, 2500]);
    const five = d.totals.taxLines.find((t) => t.rate === 5)!;
    const eighteen = d.totals.taxLines.find((t) => t.rate === 18)!;
    expect(five.taxableAmount.minor).toBe(300000 + 7501);
    expect(eighteen.taxableAmount.minor).toBe(100000 + 2500);
    expect(five.totalTax.minor).toBe(15375);
    expect(eighteen.totalTax.minor).toBe(18450);
    expect(taxedCharges(d).minor).toBe(10001);
  });

  it('leaves a nil-rated line its share untaxed', () => {
    const d = doc({ lines: [line({ id: 'a' }), line({ id: 'b', taxRate: 0, gst: { supplyType: 'nil' } })] });
    expect(chargeShares(d)).toEqual([5000, 5000]);
    expect(d.totals.taxableAmount.minor).toBe(210000);
    // Only the taxable line's half is taxed.
    expect(d.totals.totalTax.minor).toBe(18900);
  });

  it('leaves a document dated before the cut-over exactly as it was', () => {
    const d = doc({ lines: [line()], date: BEFORE });
    expect(chargeShares(d)).toBeNull();
    expect(d.totals.taxableAmount.minor).toBe(100000);
    expect(d.totals.totalTax.minor).toBe(18000);
    expect(d.totals.charges.minor).toBe(10000);
    expect(d.totals.chargesTaxed).toBeUndefined();
    expect(d.totals.grandTotal.minor).toBe(128000);
    expect(linesWithCharges(d)).toBe(d.lines);
  });

  it('keeps the charges after tax when there is nothing to spread them over', () => {
    const d = doc({ lines: [line({ gst: { reimbursement: true } })] });
    expect(chargeShares(d)).toBeNull();
    expect(d.totals.charges.minor).toBe(10000);
  });

  it('keeps the document discount on the goods and their tax', () => {
    const d = doc({ lines: [line()], documentDiscountValue: 0 });
    const withDiscount = calculateDocument({
      lines: d.lines, currency: 'INR', baseCurrency: 'INR', exchangeRate: 1, documentDiscountMode: 'percent', documentDiscountValue: 10,
      charges: inr('100'), applyRoundOff: false, taxCategories: [], taxContext: { regime: 'GST', registered: true, homeStateCode: '27', placeOfSupplyStateCode: '27' }, date: AFTER,
    });
    // 10% of 1,180 (goods with tax), not of 1,298.
    expect(withDiscount.documentDiscount.minor).toBe(11800);
  });

  it('charges no tax on them for an unregistered seller', () => {
    const d = doc({ lines: [line()] }, 'invoice', false);
    expect(d.totals.totalTax.minor).toBe(0);
    expect(d.totals.taxableAmount.minor).toBe(110000);
  });

  it('posts a sale that balances, with the charges still in Charges recovered', () => {
    const d = doc({ lines: [line({ id: 'a', taxRate: 5, unitPrice: inr('3000') }), line({ id: 'b' })] });
    const ps = postDocument(d, 'INR');
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'sys:sales')).toBe(-400000);
    expect(net(ps, 'sys:chargesRecovered')).toBe(-10000);
    expect(net(ps, 'party:cus')).toBe(d.totals.grandTotal.minor);
  });

  it('posts a bill that balances: freight inward, and credit on the charges in the line bucket', () => {
    const d = doc({ lines: [line()] }, 'purchaseBill');
    const ps = postDocument(d, 'INR');
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'sys:freightInward')).toBe(10000);
    expect(net(ps, 'sys:purchases')).toBe(100000);
    const itc = itcOfDocument(d, 'INR');
    expect(itc.eligible.cgst + itc.eligible.sgst).toBe(19800);
  });

  it('puts a capital line share into the asset cost', () => {
    const d = doc({ lines: [line({ gst: { capitalGoods: true } })] }, 'purchaseBill');
    const ps = postDocument(d, 'INR');
    expect(balanced(ps)).toBe(0);
    expect(net(ps, 'sys:fixedAssets')).toBe(110000);
    expect(net(ps, 'sys:freightInward')).toBe(0);
  });

  it('reports the charges in GSTR-1 rate-wise and in the HSN summary', () => {
    const d = doc({ lines: [line({ id: 'a', taxRate: 5, unitPrice: inr('3000'), hsnCode: '1001' }), line({ id: 'b', hsnCode: '3921' })] });
    const s = gstr1Summary({ company: COMPANY, documents: [d], parties: [BUYER], items: [], baseCurrency: 'INR', period: { from: '2026-12-01', to: '2026-12-31' } });
    const rows = s.b2b.filter((r) => r.documentId === 'd1');
    expect(rows.find((r) => r.rate === 5)!.taxableValue.minor).toBe(307500);
    expect(rows.find((r) => r.rate === 18)!.taxableValue.minor).toBe(102500);
    expect(s.hsn.find((h) => h.hsnCode === '1001')!.taxableValue.minor).toBe(307500);
    expect(s.hsn.find((h) => h.hsnCode === '3921')!.taxableValue.minor).toBe(102500);
  });
});
