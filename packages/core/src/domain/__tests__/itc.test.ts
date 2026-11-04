import { calculateDocument } from '../lineCalc';
import { itcOfDocument, splitTotal } from '../itc';
import { BusinessDocument, DocumentLine, GstFlags } from '../../types';
import { fromMajor, zero } from '../../lib/money';

const line = (id: string, gst?: GstFlags): DocumentLine => ({
  id,
  name: id,
  quantity: 1,
  unit: 'NOS',
  unitPrice: fromMajor('1000', 'INR'),
  discountMode: 'percent',
  discountValue: 0,
  taxCategoryId: 'tax_18',
  taxRate: 18,
  taxInclusive: false,
  gst,
});

function bill(lines: DocumentLine[], over: Partial<BusinessDocument> = {}, interState = false): BusinessDocument {
  const totals = calculateDocument({
    lines,
    currency: 'INR',
    baseCurrency: 'INR',
    exchangeRate: 1,
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero('INR'),
    applyRoundOff: false,
    taxCategories: [],
    taxContext: { regime: 'GST', registered: true, homeStateCode: '27', placeOfSupplyStateCode: interState ? '29' : '27', reverseCharge: over.reverseCharge },
  });
  return { id: 'b', kind: 'purchaseBill', currency: 'INR', exchangeRate: 1, lines, totals, ...over } as BusinessDocument;
}

describe('input tax credit', () => {
  it('sorts each line’s GST into eligible, capital goods, blocked and ineligible', () => {
    const itc = itcOfDocument(
      bill([line('a'), line('b', { capitalGoods: true }), line('c', { itcEligibility: 'blocked' }), line('d', { itcEligibility: 'ineligible' })]),
      'INR',
    );
    expect(itc.eligible).toEqual({ igst: 0, cgst: 9000, sgst: 9000, cess: 0 });
    expect(splitTotal(itc.capitalGoods)).toBe(18000);
    expect(splitTotal(itc.blocked)).toBe(18000);
    expect(splitTotal(itc.ineligible)).toBe(18000);
  });

  it('puts self-assessed reverse-charge tax in its own bucket, IGST when inter-state', () => {
    const itc = itcOfDocument(bill([line('a')], { reverseCharge: true }, true), 'INR');
    expect(itc.reverseCharge).toEqual({ igst: 18000, cgst: 0, sgst: 0, cess: 0 });
    expect(splitTotal(itc.eligible)).toBe(0);
  });

  it('keeps cess apart and counts a supplier credit note against the credit', () => {
    const itc = itcOfDocument(bill([line('a', { cessRate: 12 })], { kind: 'supplierCreditNote' }), 'INR');
    expect(itc.eligible).toEqual({ igst: 0, cgst: -9000, sgst: -9000, cess: -12000 });
  });
});
