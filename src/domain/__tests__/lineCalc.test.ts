import { calculateDocument, calculateLine } from '@/domain/lineCalc';
import { splitTax } from '@/domain/taxEngine';
import { DocumentLine, TaxCategory } from '@/types';
import { fromMajor, zero } from '@/lib/money';
import { uid } from '@/lib/id';

const categories: TaxCategory[] = [
  { id: 'tax_18', companyId: 'c', name: 'GST 18%', rate: 18, type: 'GST', effectiveFrom: '2017-07-01' },
  { id: 'tax_5', companyId: 'c', name: 'GST 5%', rate: 5, type: 'GST', effectiveFrom: '2017-07-01' },
];

const intraState = { regime: 'GST' as const, homeStateCode: '27', placeOfSupplyStateCode: '27', registered: true };
const interState = { regime: 'GST' as const, homeStateCode: '27', placeOfSupplyStateCode: '29', registered: true };

function line(over: Partial<DocumentLine> = {}): DocumentLine {
  return {
    id: uid('ln'),
    name: 'Widget',
    quantity: 10,
    unit: 'PCS',
    unitPrice: fromMajor('100', 'INR'),
    discountMode: 'percent',
    discountValue: 0,
    taxCategoryId: 'tax_18',
    taxRate: 18,
    taxInclusive: false,
    ...over,
  };
}

function doc(lines: DocumentLine[], over: Partial<Parameters<typeof calculateDocument>[0]> = {}) {
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
    taxContext: intraState,
    ...over,
  });
}

describe('line calculation (FRD 10 order)', () => {
  it('applies quantity, then discount, then tax', () => {
    const b = calculateLine(line({ discountValue: 10 }), 'INR', intraState);
    expect(b.gross.minor).toBe(100000); // 10 x 100.00
    expect(b.discount.minor).toBe(10000); // 10%
    expect(b.taxable.minor).toBe(90000); // 900.00
    expect(b.taxAmount.minor).toBe(16200); // 18% of 900.00
    expect(b.total.minor).toBe(106200);
  });

  it('strips tax back out of an inclusive price', () => {
    const b = calculateLine(line({ quantity: 1, unitPrice: fromMajor('118', 'INR'), taxInclusive: true }), 'INR', intraState);
    expect(b.taxable.minor).toBe(10000);
    expect(b.taxAmount.minor).toBe(1800);
    expect(b.total.minor).toBe(11800);
  });

  it('charges no tax when the business is not registered', () => {
    const b = calculateLine(line(), 'INR', { ...intraState, registered: false });
    expect(b.taxAmount.minor).toBe(0);
    expect(b.total.minor).toBe(100000);
  });

  it('caps an amount discount at the line value', () => {
    const b = calculateLine(line({ discountMode: 'amount', discountValue: 99999 }), 'INR', intraState);
    expect(b.discount.minor).toBe(b.gross.minor);
    expect(b.taxable.minor).toBe(0);
  });
});

describe('tax split', () => {
  it('splits evenly into CGST and SGST within the home state', () => {
    const parts = splitTax(fromMajor('1000', 'INR'), 18, intraState);
    expect(parts.map((p) => p.type)).toEqual(['CGST', 'SGST']);
    expect(parts.map((p) => p.amount.minor)).toEqual([9000, 9000]);
    expect(parts.every((p) => p.rate === 9)).toBe(true);
  });

  it('uses a single IGST line across states', () => {
    const parts = splitTax(fromMajor('1000', 'INR'), 18, interState);
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('IGST');
    expect(parts[0].amount.minor).toBe(18000);
  });

  it('splits an odd amount without losing a paisa', () => {
    const parts = splitTax(fromMajor('55.55', 'INR'), 18, intraState);
    const total = parts.reduce((a, p) => a + p.amount.minor, 0);
    expect(total).toBe(1000); // 9.999 -> 10.00, split 5.00 / 5.00
    expect(parts[0].amount.minor + parts[1].amount.minor).toBe(total);
  });
});

describe('document totals', () => {
  it('groups tax by slab and totals correctly', () => {
    const totals = doc([line(), line({ taxCategoryId: 'tax_5', taxRate: 5, quantity: 4, unitPrice: fromMajor('50', 'INR') })]);
    expect(totals.subtotal.minor).toBe(120000); // 1000.00 + 200.00
    expect(totals.taxableAmount.minor).toBe(120000);
    expect(totals.taxLines).toHaveLength(2);
    expect(totals.taxLines[0].rate).toBe(5);
    expect(totals.taxLines[1].rate).toBe(18);
    expect(totals.totalTax.minor).toBe(18000 + 1000);
    expect(totals.grandTotal.minor).toBe(120000 + 19000);
  });

  it('applies the document discount after tax, per the FRD order', () => {
    const totals = doc([line()], { documentDiscountValue: 10 });
    // 1000.00 + 180.00 tax = 1180.00, less 10% = 1062.00
    expect(totals.documentDiscount.minor).toBe(11800);
    expect(totals.grandTotal.minor).toBe(106200);
  });

  it('adds charges and rounds the total to the rupee', () => {
    const totals = doc([line({ quantity: 1, unitPrice: fromMajor('99.99', 'INR') })], {
      charges: fromMajor('50', 'INR'),
      applyRoundOff: true,
    });
    // 99.99 + 18.00 tax + 50.00 = 167.99 -> 168.00
    expect(totals.charges.minor).toBe(5000);
    expect(totals.roundOff.minor).toBe(1);
    expect(totals.grandTotal.minor % 100).toBe(0);
  });

  it('converts the grand total into the base currency at the stored rate', () => {
    const totals = doc([line()], { currency: 'AED', baseCurrency: 'INR', exchangeRate: 23.85 });
    expect(totals.grandTotal.currency).toBe('AED');
    expect(totals.grandTotalBase.currency).toBe('INR');
    expect(totals.grandTotalBase.minor).toBe(Math.round(totals.grandTotal.minor * 23.85));
  });

  it('produces an empty but valid result for a document with no lines', () => {
    const totals = doc([]);
    expect(totals.grandTotal.minor).toBe(0);
    expect(totals.taxLines).toHaveLength(0);
  });
});
