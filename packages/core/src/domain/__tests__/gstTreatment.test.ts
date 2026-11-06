import { calculateDocument, calculateLine } from '../lineCalc';
import { expenseCost, expenseTaxComponents } from '../expenseTax';
import { buildTaxContext, homeStateCode } from '../taxEngine';
import { Branch, Company, DocumentLine, GstFlags, Party, TaxCategory } from '../../types';
import { fromMajor, zero } from '../../lib/money';

const categories: TaxCategory[] = [{ id: 'tax_18', companyId: 'c', name: 'GST 18%', rate: 18, type: 'GST', effectiveFrom: '2017-07-01' }];

const company = (over: Partial<NonNullable<Company['taxRegistration']>> = {}): Company => ({
  id: 'c',
  accountId: 'a',
  name: 'Acme',
  businessType: 'Trading',
  country: 'IN',
  baseCurrency: 'INR',
  address: { line1: '', city: 'Pune', state: 'Maharashtra', stateCode: '27', postalCode: '', country: 'IN' },
  taxRegistration: { regime: 'GST', identifierLabel: 'GSTIN', registered: true, placeOfSupplyStateCode: '27', ...over },
  fiscalYearStartMonth: 4,
  plan: 'pro',
  createdAt: '2026-01-01',
});
const party = (type: Party['gstRegistrationType'] = 'regular'): Party => ({ id: 'p', gstRegistrationType: type, billingAddress: { stateCode: '27' } }) as Party;

const line = (gst?: GstFlags, over: Partial<DocumentLine> = {}): DocumentLine => ({
  id: 'l1',
  name: 'Widget',
  quantity: 1,
  unit: 'PCS',
  unitPrice: fromMajor('1000', 'INR'),
  discountMode: 'percent',
  discountValue: 0,
  taxCategoryId: 'tax_18',
  taxRate: 18,
  taxInclusive: false,
  gst,
  ...over,
});

const ctx = (opts: { purchase?: boolean; reverseCharge?: boolean; c?: Company; p?: Party; pos?: string; branch?: Branch } = {}) =>
  buildTaxContext(opts.c ?? company(), { party: opts.p ?? party(), placeOfSupply: opts.pos ?? '27', date: '2026-06-01', purchase: !!opts.purchase, reverseCharge: opts.reverseCharge, branch: opts.branch });

const totals = (lines: DocumentLine[], taxContext = ctx()) =>
  calculateDocument({
    lines,
    currency: 'INR',
    baseCurrency: 'INR',
    exchangeRate: 1,
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero('INR'),
    applyRoundOff: false,
    taxCategories: categories,
    taxContext,
  });

describe('GST treatment of a line', () => {
  it('charges nothing on nil-rated, exempt and non-GST supplies', () => {
    for (const supplyType of ['nil', 'exempt', 'nonGst'] as const) {
      const t = totals([line({ supplyType })]);
      expect(t.totalTax.minor).toBe(0);
      expect(t.taxLines).toEqual([]);
      expect(t.grandTotal.minor).toBe(100000);
    }
  });

  it('keeps a reimbursement out of the taxable value and the discount, but in the total', () => {
    const t = calculateDocument({
      lines: [line(), line({ reimbursement: true }, { id: 'l2', unitPrice: fromMajor('500', 'INR') })],
      currency: 'INR',
      baseCurrency: 'INR',
      exchangeRate: 1,
      documentDiscountMode: 'percent',
      documentDiscountValue: 10,
      charges: zero('INR'),
      applyRoundOff: false,
      taxCategories: categories,
      taxContext: ctx(),
    });
    expect(t.subtotal.minor).toBe(100000);
    expect(t.taxableAmount.minor).toBe(100000);
    expect(t.totalTax.minor).toBe(18000);
    expect(t.reimbursements?.minor).toBe(50000);
    // 10% off (1000 + 180), then the 500 recovered at cost.
    expect(t.grandTotal.minor).toBe(118000 - 11800 + 50000);
  });

  it('adds cess as its own component, never split between centre and state', () => {
    const t = totals([line({ cessRate: 12 })]);
    const types = t.taxLines[0].components.map((c) => [c.type, c.amount.minor]);
    expect(types).toEqual([
      ['CGST', 9000],
      ['SGST', 9000],
      ['CESS', 12000],
    ]);
    expect(t.totalTax.minor).toBe(30000);
    expect(t.grandTotal.minor).toBe(130000);
  });

  it('strips cess and GST together from a tax-inclusive price', () => {
    const b = calculateLine(line({ cessRate: 12 }, { taxInclusive: true, unitPrice: fromMajor('1300', 'INR') }), 'INR', ctx());
    expect(b.taxable.minor).toBe(100000);
    expect(b.taxAmount.minor).toBe(30000);
  });

  it('takes no tax out of an inclusive price when none is charged', () => {
    const unregistered = company({ registered: false });
    const b = calculateLine(line(undefined, { taxInclusive: true }), 'INR', ctx({ c: unregistered }));
    expect(b.taxable.minor).toBe(100000);
    expect(b.taxAmount.minor).toBe(0);
  });
});

describe('reverse charge', () => {
  it('shows the tax a reverse-charge line carries, but leaves it out of the total', () => {
    const t = totals([line({ reverseCharge: true })], ctx({ purchase: true }));
    expect(t.totalTax.minor).toBe(0);
    expect(t.reverseChargeTax?.minor).toBe(18000);
    expect(t.taxLines[0].reverseCharge).toBe(true);
    expect(t.grandTotal.minor).toBe(100000);
  });

  it('puts a whole document under reverse charge', () => {
    const t = totals([line(), line(undefined, { id: 'l2' })], ctx({ purchase: true, reverseCharge: true }));
    expect(t.reverseChargeTax?.minor).toBe(36000);
    expect(t.grandTotal.minor).toBe(200000);
  });

  it('keeps forward-charge and reverse-charge tax in separate rows', () => {
    const t = totals([line(), line({ reverseCharge: true }, { id: 'l2' })], ctx({ purchase: true }));
    expect(t.taxLines.map((l) => !!l.reverseCharge)).toEqual([false, true]);
    expect(t.totalTax.minor).toBe(18000);
    expect(t.reverseChargeTax?.minor).toBe(18000);
    expect(t.grandTotal.minor).toBe(218000);
  });

  it('self-assesses IGST on an imported service, though an import bill carries no GST', () => {
    const foreign = { id: 'p', gstRegistrationType: 'overseas', billingAddress: { stateCode: '96' } } as Party;
    const c = ctx({ purchase: true, p: foreign, pos: '96' });
    expect(totals([line()], c).totalTax.minor).toBe(0);
    const t = totals([line({ reverseCharge: true })], c);
    expect(t.taxLines[0].components.map((x) => x.type)).toEqual(['IGST']);
    expect(t.reverseChargeTax?.minor).toBe(18000);
  });

  it('never strips reverse-charge tax out of an inclusive price', () => {
    const b = calculateLine(line({ reverseCharge: true }, { taxInclusive: true }), 'INR', ctx({ purchase: true }));
    expect(b.taxable.minor).toBe(100000);
    expect(b.total.minor).toBe(100000);
  });
});

describe('composition dealer', () => {
  it('charges no GST on its sales (a bill of supply)', () => {
    const c = company({ compositionScheme: true });
    expect(totals([line()], ctx({ c })).totalTax.minor).toBe(0);
  });

  it('still pays GST on what it buys, and reverse charge on notified services', () => {
    const c = company({ compositionScheme: true });
    expect(totals([line()], ctx({ c, purchase: true })).totalTax.minor).toBe(18000);
    expect(totals([line({ reverseCharge: true })], ctx({ c, purchase: true })).reverseChargeTax?.minor).toBe(18000);
  });
});

describe('a branch with its own GSTIN', () => {
  const karnataka = { id: 'b', gstin: '29ABCDE1234F1Z5' } as Branch;

  it('supplies from its own state', () => {
    expect(homeStateCode(company(), karnataka)).toBe('29');
    expect(homeStateCode(company(), { id: 'b' } as Branch)).toBe('27');
  });

  it('charges IGST to a buyer in the company’s head-office state', () => {
    const t = totals([line()], ctx({ branch: karnataka, pos: '27' }));
    expect(t.taxLines[0].components.map((c) => c.type)).toEqual(['IGST']);
  });

  it('charges CGST and SGST within the branch’s state', () => {
    const t = totals([line()], ctx({ branch: karnataka, pos: '29' }));
    expect(t.taxLines[0].components.map((c) => c.type)).toEqual(['CGST', 'SGST']);
  });
});

describe('expense GST', () => {
  const inr = (major: string) => fromMajor(major, 'INR');

  it('costs the business what it paid less the credit it can claim', () => {
    expect(expenseCost({ amount: inr('1180'), taxAmount: inr('180') }).minor).toBe(100000);
    expect(expenseCost({ amount: inr('1180'), taxAmount: inr('180'), itcEligibility: 'blocked' }).minor).toBe(118000);
  });

  it('adds reverse-charge tax it paid the government, unless it can claim it back', () => {
    expect(expenseCost({ amount: inr('1000'), taxAmount: inr('180'), reverseCharge: true }).minor).toBe(100000);
    expect(expenseCost({ amount: inr('1000'), taxAmount: inr('180'), reverseCharge: true, itcEligibility: 'ineligible' }).minor).toBe(118000);
  });

  it('splits into CGST and SGST within the state, IGST from a supplier in another', () => {
    const c = company();
    expect(expenseTaxComponents({ taxAmount: inr('180.01') }, 18, c).map((x) => [x.type, x.amount.minor])).toEqual([
      ['CGST', 9001],
      ['SGST', 9000],
    ]);
    expect(expenseTaxComponents({ taxAmount: inr('180'), supplierGstin: '29ABCDE1234F1Z5' }, 18, c).map((x) => x.type)).toEqual(['IGST']);
    expect(expenseTaxComponents({ taxAmount: inr('180'), placeOfSupplyStateCode: '29' }, 18, c).map((x) => x.type)).toEqual(['IGST']);
  });
});
