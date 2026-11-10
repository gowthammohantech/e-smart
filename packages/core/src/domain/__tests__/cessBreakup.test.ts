import { calculateDocument } from '../lineCalc';
import { cessBreakup } from '../cessBreakup';
import { DocumentLine, TaxCategory } from '../../types';
import { fromMajor, zero } from '../../lib/money';

const categories: TaxCategory[] = [
  { id: 'tax_28', companyId: 'c', name: 'GST 28%', rate: 28, type: 'GST', effectiveFrom: '2017-07-01' },
  { id: 'tax_18', companyId: 'c', name: 'GST 18%', rate: 18, type: 'GST', effectiveFrom: '2017-07-01' },
];
const intraState = { regime: 'GST' as const, homeStateCode: '27', placeOfSupplyStateCode: '27', registered: true };

function line(id: string, over: Partial<DocumentLine> = {}): DocumentLine {
  return {
    id,
    name: `Item ${id}`,
    quantity: 1,
    unit: 'PCS',
    unitPrice: fromMajor('100', 'INR'),
    discountMode: 'percent',
    discountValue: 0,
    taxCategoryId: 'tax_28',
    taxRate: 28,
    taxInclusive: false,
    gst: { cessRate: 12 },
    ...over,
  };
}

function totals(lines: DocumentLine[], ctx: Parameters<typeof calculateDocument>[0]['taxContext'] = intraState) {
  return calculateDocument({
    lines,
    currency: 'INR',
    baseCurrency: 'INR',
    exchangeRate: 1,
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero('INR'),
    applyRoundOff: false,
    taxCategories: categories,
    taxContext: ctx,
  });
}

const cessTotal = (t: ReturnType<typeof totals>) =>
  t.taxLines.flatMap((l) => l.components).filter((c) => c.type === 'CESS').reduce((s, c) => s + c.amount.minor, 0);

describe('item-wise cess', () => {
  it('gives each item its own cess, adding up to the document’s cess lines', () => {
    const lines = [
      line('a', { unitPrice: fromMajor('1000', 'INR') }),
      line('b', { unitPrice: fromMajor('500', 'INR'), quantity: 3 }),
      line('c', { taxCategoryId: 'tax_18', taxRate: 18, gst: { cessRate: 0 } }),
    ];
    const t = totals(lines);
    const rows = cessBreakup(lines, t, 'INR');
    expect(rows.map((r) => [r.lineId, r.taxable.minor, r.cessRate, r.cess.minor])).toEqual([
      ['a', 100000, 12, 12000],
      ['b', 150000, 12, 18000],
    ]);
    expect(rows.reduce((s, r) => s + r.cess.minor, 0)).toBe(cessTotal(t));
  });

  it('shares a rounded group cess so the paise still add up', () => {
    // 3 x ₹0.33 at 12% cess: the group's cess is rounded once, not per line.
    const lines = ['a', 'b', 'c'].map((id) => line(id, { unitPrice: fromMajor('0.33', 'INR') }));
    const t = totals(lines);
    const rows = cessBreakup(lines, t, 'INR');
    expect(rows).toHaveLength(3);
    expect(rows.reduce((s, r) => s + r.cess.minor, 0)).toBe(cessTotal(t));
  });

  it('takes the cess out of a tax-inclusive price before sharing it', () => {
    // ₹140 inclusive of 28% GST + 12% cess: taxable ₹100, cess ₹12.
    const lines = [line('a', { unitPrice: fromMajor('140', 'INR'), taxInclusive: true })];
    const rows = cessBreakup(lines, totals(lines), 'INR');
    expect(rows.map((r) => [r.taxable.minor, r.cess.minor])).toEqual([[10000, 1200]]);
  });

  it('keeps different cess rates and reverse charge apart', () => {
    const lines = [line('a'), line('b', { gst: { cessRate: 15 } }), line('c', { gst: { cessRate: 12, reverseCharge: true } })];
    const t = totals(lines);
    const rows = cessBreakup(lines, t, 'INR');
    expect(rows.map((r) => [r.lineId, r.cessRate, r.reverseCharge])).toEqual([
      ['a', 12, false],
      ['b', 15, false],
      ['c', 12, true],
    ]);
  });

  it('is empty when no GST is charged (unregistered, export under LUT, composition)', () => {
    const lines = [line('a')];
    expect(cessBreakup(lines, totals(lines, { ...intraState, registered: false }), 'INR')).toEqual([]);
    expect(cessBreakup(lines, totals(lines, { ...intraState, composition: true }), 'INR')).toEqual([]);
  });
});
