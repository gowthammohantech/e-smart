import type { BusinessDocument, DocumentLine } from '../../types';
import { calculateDocument } from '../lineCalc';
import { money } from '../../lib/money';
import { hsnSummary, lineTaxes } from '../hsnSummary';

const line = (id: string, over: Partial<DocumentLine>): DocumentLine => ({
  id,
  name: id,
  quantity: 1,
  unit: 'NOS',
  unitPrice: money(100_000, 'INR'),
  discountMode: 'amount',
  discountValue: 0,
  taxCategoryId: 'gst0',
  taxRate: 0,
  taxInclusive: false,
  ...over,
});

const CATEGORIES = [0, 5, 12, 18].map((rate) => ({ id: `gst${rate}`, name: `GST ${rate}%`, rate }) as never);

function doc(lines: DocumentLine[], { interState = false, charges = 0, date = '2026-11-05' } = {}): BusinessDocument {
  const d = { kind: 'invoice', currency: 'INR', exchangeRate: 1, date, lines, charges: money(charges, 'INR'), documentDiscountMode: 'amount', documentDiscountValue: 0, applyRoundOff: false } as unknown as BusinessDocument;
  d.totals = calculateDocument({
    lines,
    currency: 'INR',
    baseCurrency: 'INR',
    exchangeRate: 1,
    documentDiscountMode: 'amount',
    documentDiscountValue: 0,
    charges: d.charges,
    applyRoundOff: false,
    taxCategories: CATEGORIES,
    taxContext: { regime: 'GST', registered: true, homeStateCode: '33', placeOfSupplyStateCode: interState ? '29' : '33' },
    date,
  });
  return d;
}

describe('HSN summary on the printed invoice', () => {
  it('matches the reference format: milk and butter at nil, curd at 18% split 9 + 9', () => {
    const s = hsnSummary(
      doc([
        line('Milk', { hsnCode: '90173022', unitPrice: money(100_000, 'INR') }),
        line('Curd', { hsnCode: '90173022', unitPrice: money(50_000, 'INR'), taxCategoryId: 'gst18', taxRate: 18 }),
        line('Butter', { hsnCode: '90173022', unitPrice: money(60_000, 'INR') }),
      ]),
    );
    expect(s.rows.map((r) => [r.hsnCode, r.rate, r.taxable.minor, r.cgst.minor, r.sgst.minor, r.totalTax.minor])).toEqual([
      ['90173022', 0, 160_000, 0, 0, 0],
      ['90173022', 18, 50_000, 4_500, 4_500, 9_000],
    ]);
    expect(s.total.taxable.minor).toBe(210_000);
    expect(s.total.totalTax.minor).toBe(9_000);
    expect(s.interState).toBe(false);
  });

  it('puts an inter-state supply in IGST', () => {
    const s = hsnSummary(doc([line('a', { hsnCode: '1001', taxCategoryId: 'gst12', taxRate: 12 })], { interState: true }));
    expect(s.rows[0].igst.minor).toBe(12_000);
    expect(s.rows[0].cgst.minor).toBe(0);
    expect(s.interState).toBe(true);
  });

  it('adds up to the tax on the invoice when a slab is split over codes', () => {
    const d = doc([
      line('a', { hsnCode: '1111', unitPrice: money(3_333, 'INR'), taxCategoryId: 'gst18', taxRate: 18 }),
      line('b', { hsnCode: '2222', unitPrice: money(3_333, 'INR'), taxCategoryId: 'gst18', taxRate: 18 }),
      line('c', { hsnCode: '3333', unitPrice: money(3_334, 'INR'), taxCategoryId: 'gst18', taxRate: 18 }),
      line('d', { hsnCode: '1111', unitPrice: money(1_999, 'INR'), taxCategoryId: 'gst5', taxRate: 5, quantity: 3 }),
    ]);
    const s = hsnSummary(d);
    expect(s.total.totalTax.minor).toBe(d.totals.totalTax.minor);
    expect(s.total.taxable.minor).toBe(d.totals.taxableAmount.minor);
    s.rows.forEach((r) => expect(r.cgst.minor).toBe(r.sgst.minor));
  });

  it('leaves out reimbursements and takes in charges taxed with the lines', () => {
    const d = doc(
      [
        line('a', { hsnCode: '1111', taxCategoryId: 'gst18', taxRate: 18 }),
        line('courier', { gst: { reimbursement: true } } as never),
      ],
      { charges: 10_000, date: '2026-12-10' },
    );
    const s = hsnSummary(d);
    expect(s.rows).toHaveLength(1);
    expect(s.total.taxable.minor).toBe(d.totals.taxableAmount.minor);
    expect(s.total.totalTax.minor).toBe(d.totals.totalTax.minor);
  });

  it('prints a line with no HSN under an empty code, after the coded ones', () => {
    const s = hsnSummary(doc([line('a', {}), line('b', { hsnCode: '0401' })]));
    expect(s.rows.map((r) => r.hsnCode)).toEqual(['0401', '']);
  });
});

describe("each line's share of the tax", () => {
  it('adds up to the tax on the invoice, line by line', () => {
    const d = doc([
      line('a', { unitPrice: money(3_333, 'INR'), taxCategoryId: 'gst18', taxRate: 18 }),
      line('b', { unitPrice: money(3_333, 'INR'), taxCategoryId: 'gst18', taxRate: 18 }),
      line('c', { unitPrice: money(3_334, 'INR'), taxCategoryId: 'gst18', taxRate: 18, discountMode: 'percent', discountValue: 10 }),
    ]);
    const lines = lineTaxes(d);
    expect(lines.map((l) => l.lineId)).toEqual(['a', 'b', 'c']);
    expect(lines.reduce((a, l) => a + l.tax.minor, 0)).toBe(d.totals.totalTax.minor);
    expect(lines[2].discount.minor).toBe(333);
    expect(lines[2].taxable.minor).toBe(3_001);
  });
});
