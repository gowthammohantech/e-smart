import { profitSnapshot, summarizeTax } from '../reports';
import { consolidateB2cs, type Gstr1Row } from '../gstr1';
import { BusinessDocument, DocumentKind, Expense, Item } from '../../types';
import { fromMajor, money, zero } from '../../lib/money';

const range = { from: '2026-10-01', to: '2026-10-31' };

/** A document with one 18% intra-state slab on `taxable`, and one line of `qty` of item `i1`. */
function doc(id: string, kind: DocumentKind, taxable: string, over: Partial<BusinessDocument> = {}): BusinessDocument {
  const base = fromMajor(taxable, 'INR');
  const half = money(Math.round(base.minor * 0.09), 'INR');
  return {
    id,
    companyId: 'c',
    branchId: 'b',
    kind,
    number: id,
    status: kind === 'salesReturn' || kind === 'purchaseReturn' ? 'processed' : 'issued',
    partyId: 'p1',
    date: '2026-10-10',
    currency: 'INR',
    exchangeRate: 1,
    lines: [{ id: `${id}-l`, itemId: 'i1', name: 'Widget', quantity: 1, unit: 'NOS', unitPrice: base, discountMode: 'amount', discountValue: 0, taxCategoryId: 't18', taxRate: 18, taxInclusive: false }],
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero('INR'),
    applyRoundOff: false,
    attachmentIds: [],
    createdBy: 'u',
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    totals: {
      subtotal: base,
      lineDiscount: zero('INR'),
      documentDiscount: zero('INR'),
      taxableAmount: base,
      taxLines: [
        {
          categoryId: 't18',
          categoryName: 'GST 18%',
          rate: 18,
          taxableAmount: base,
          components: [
            { type: 'CGST', label: 'CGST 9%', rate: 9, amount: half },
            { type: 'SGST', label: 'SGST 9%', rate: 9, amount: half },
          ],
          totalTax: money(half.minor * 2, 'INR'),
        },
      ],
      totalTax: money(half.minor * 2, 'INR'),
      charges: zero('INR'),
      roundOff: zero('INR'),
      grandTotal: money(base.minor + half.minor * 2, 'INR'),
      grandTotalBase: money(base.minor + half.minor * 2, 'INR'),
    },
    ...over,
  };
}

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  companyId: 'c',
  branchId: 'b',
  number: 'EXP/1',
  categoryId: 'cat',
  date: '2026-10-12',
  amount: fromMajor('1180', 'INR'),
  currency: 'INR',
  exchangeRate: 1,
  taxAmount: fromMajor('180', 'INR'),
  taxInclusive: false,
  accountId: 'cash',
  method: 'cash',
  billable: false,
  recurrence: 'none',
  attachmentIds: [],
  createdBy: 'u',
  createdAt: '2026-10-12T00:00:00.000Z',
  ...over,
});

describe('tax summary', () => {
  it('nets credit notes out of output tax, as GSTR-1 does', () => {
    const t = summarizeTax([doc('inv', 'invoice', '1000'), doc('cn', 'creditNote', '200')], 'INR', { range });
    expect(t.outwardTotal.minor).toBe(14400); // 18% of 800
  });

  it('counts purchase returns against input tax, and claimable tax on expenses', () => {
    const t = summarizeTax(
      [doc('bill', 'purchaseBill', '1000'), doc('pr', 'purchaseReturn', '100'), doc('inv', 'invoice', '2000')],
      'INR',
      { range },
      [expense(), expense({ id: 'e2', itcEligibility: 'blocked' })],
    );
    expect(t.inwardTotal.minor).toBe(16200 + 18000);
    expect(t.inward.find((r) => r.rate === 18)?.taxable.minor).toBe(90000 + 100000);
    expect(t.netPayable.minor).toBe(36000 - 34200);
  });
});

describe('profit snapshot', () => {
  const items: Item[] = [{ id: 'i1', purchasePrice: zero('INR') } as Item];

  it('costs goods sold at what the bills paid, and takes returns off revenue and cost', () => {
    const p = profitSnapshot(
      [
        doc('bill', 'purchaseBill', '600', { lines: [{ ...doc('x', 'invoice', '600').lines[0], quantity: 2, unitPrice: fromMajor('300', 'INR') }] }),
        doc('inv', 'invoice', '1000'),
        doc('ret', 'salesReturn', '200', { lines: [{ ...doc('x', 'invoice', '200').lines[0], quantity: 0.5 }] }),
      ],
      [],
      items,
      'INR',
      { range },
    );
    expect(p.revenue.minor).toBe(80000);
    // One unit sold at ₹300 a unit, half a unit back.
    expect(p.costOfGoods.minor).toBe(15000);
    expect(p.grossProfit.minor).toBe(65000);
  });
});

describe('B2CS consolidation', () => {
  const row = (over: Partial<Gstr1Row>): Gstr1Row =>
    ({
      documentId: 'd',
      kind: 'invoice',
      table: 'b2cs',
      partyName: 'Walk-in',
      number: 'INV/1',
      date: '2026-10-10',
      placeOfSupply: '33',
      placeOfSupplyName: 'Tamil Nadu',
      rate: 18,
      taxableValue: fromMajor('100', 'INR'),
      cgst: fromMajor('9', 'INR'),
      sgst: fromMajor('9', 'INR'),
      igst: zero('INR'),
      cess: zero('INR'),
      invoiceValue: fromMajor('118', 'INR'),
      ...over,
    }) as Gstr1Row;

  it('adds up one line per place of supply and rate, net of credit notes', () => {
    const lines = consolidateB2cs(
      [
        row({ documentId: 'a' }),
        row({ documentId: 'b' }),
        row({ documentId: 'c', kind: 'creditNote', noteType: 'C', taxableValue: fromMajor('50', 'INR'), cgst: fromMajor('4.5', 'INR'), sgst: fromMajor('4.5', 'INR') }),
        row({ documentId: 'd', rate: 5 }),
        row({ documentId: 'e', placeOfSupply: '29', placeOfSupplyName: 'Karnataka', igst: fromMajor('18', 'INR'), cgst: zero('INR'), sgst: zero('INR') }),
      ],
      '33',
      'INR',
    );
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ placeOfSupply: '33', rate: 18, supplyType: 'INTRA' });
    expect(lines[0].taxableValue.minor).toBe(15000);
    expect(lines[0].cgst.minor).toBe(1350);
    expect(lines[2]).toMatchObject({ placeOfSupply: '29', supplyType: 'INTER' });
  });
});
