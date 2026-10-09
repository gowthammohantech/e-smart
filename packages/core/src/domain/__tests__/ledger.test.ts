import { allocateAdvances, availableAdvance, buildOutstanding, bucketFor, checkCreditLimit, outstandingOf, summarizeAging } from '../receivables';
import { ledgerFor, signedQuantity, stockOnHand, stockShortfalls } from '../stockLedger';
import { resolveRate, settlementGainLoss } from '../fx';
import { BusinessDocument, DocumentLine, ExchangeRate, Item, Payment, StockMovement } from '../../types';
import { fromMajor, zero } from '../../lib/money';
import { addDaysISO, today } from '../../lib/date';

function invoice(over: Partial<BusinessDocument> = {}): BusinessDocument {
  const total = over.totals?.grandTotal ?? fromMajor('1000', 'INR');
  return {
    id: 'inv1',
    companyId: 'c',
    branchId: 'b',
    kind: 'invoice',
    number: 'INV/0001',
    status: 'issued',
    partyId: 'p1',
    date: addDaysISO(today(), -40),
    dueDate: addDaysISO(today(), -10),
    currency: 'INR',
    exchangeRate: 1,
    lines: [],
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero('INR'),
    applyRoundOff: false,
    attachmentIds: [],
    createdBy: 'u',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
    totals: {
      subtotal: total,
      lineDiscount: zero('INR'),
      documentDiscount: zero('INR'),
      taxableAmount: total,
      taxLines: [],
      totalTax: zero('INR'),
      charges: zero('INR'),
      roundOff: zero('INR'),
      grandTotal: total,
      grandTotalBase: total,
      ...over.totals,
    },
  };
}

function payment(documentId: string, amount: string, over: Partial<Payment> = {}): Payment {
  return {
    id: `pay-${documentId}-${amount}`,
    companyId: 'c',
    branchId: 'b',
    number: 'PAY/0001',
    direction: 'received',
    partyId: 'p1',
    date: today(),
    amount: fromMajor(amount, 'INR'),
    currency: 'INR',
    exchangeRate: 1,
    method: 'upi',
    accountId: 'acc',
    allocations: [{ documentId, documentNumber: 'INV/0001', amount: fromMajor(amount, 'INR') }],
    unallocated: zero('INR'),
    attachmentIds: [],
    createdBy: 'u',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('receivables (FRD 18)', () => {
  it('computes outstanding as total less allocated payments', () => {
    const inv = invoice();
    expect(outstandingOf(inv, []).minor).toBe(100000);
    expect(outstandingOf(inv, [payment('inv1', '250')]).minor).toBe(75000);
    expect(outstandingOf(inv, [payment('inv1', '250'), payment('inv1', '750')]).minor).toBe(0);
  });

  it('never reports a negative outstanding on an overpayment', () => {
    expect(outstandingOf(invoice(), [payment('inv1', '1500')]).minor).toBe(0);
  });

  it('ignores drafts and cancelled documents', () => {
    const rows = buildOutstanding([invoice({ id: 'd1', status: 'draft' }), invoice({ id: 'c1', status: 'cancelled' })], []);
    expect(rows).toHaveLength(0);
  });

  it('drops fully settled documents from the outstanding list', () => {
    const rows = buildOutstanding([invoice()], [payment('inv1', '1000')]);
    expect(rows).toHaveLength(0);
  });

  it('places documents in the right aging bucket', () => {
    expect(bucketFor(-5)).toBe('current');
    expect(bucketFor(0)).toBe('current');
    expect(bucketFor(1)).toBe('d1_30');
    expect(bucketFor(30)).toBe('d1_30');
    expect(bucketFor(31)).toBe('d31_60');
    expect(bucketFor(95)).toBe('d90plus');
  });

  it('summarises aging with overdue and due-soon splits', () => {
    const overdue = invoice({ id: 'a', dueDate: addDaysISO(today(), -20) });
    const dueSoon = invoice({ id: 'b', dueDate: addDaysISO(today(), 3) });
    const later = invoice({ id: 'c', dueDate: addDaysISO(today(), 60) });
    const summary = summarizeAging(buildOutstanding([overdue, dueSoon, later], []), 'INR');

    expect(summary.total.minor).toBe(300000);
    expect(summary.overdue.minor).toBe(100000);
    expect(summary.dueSoon.minor).toBe(100000);
    expect(summary.buckets.find((b) => b.key === 'd1_30')?.count).toBe(1);
  });

  it('converts foreign-currency outstanding into the base currency', () => {
    const fx = invoice({ id: 'fx', currency: 'AED', exchangeRate: 23.85, totals: { grandTotal: fromMajor('1000', 'AED') } as never });
    const summary = summarizeAging(buildOutstanding([fx], []), 'INR');
    expect(summary.total.currency).toBe('INR');
    expect(summary.total.minor).toBe(Math.round(100000 * 23.85));
  });
});

describe('stock ledger (FRD 13)', () => {
  const base = {
    id: 'm',
    companyId: 'c',
    branchId: 'b1',
    itemId: 'i1',
    unitCost: fromMajor('100', 'INR'),
    date: '2026-01-01',
    createdBy: 'u',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const movements: StockMovement[] = [
    { ...base, id: 'm1', type: 'opening', quantity: 100 },
    { ...base, id: 'm2', type: 'purchaseReceipt', quantity: 50, date: '2026-01-05' },
    { ...base, id: 'm3', type: 'salesIssue', quantity: 30, date: '2026-01-10' },
    { ...base, id: 'm4', type: 'salesReturn', quantity: 5, date: '2026-01-12' },
    { ...base, id: 'm5', type: 'purchaseReturn', quantity: 10, date: '2026-01-15' },
    { ...base, id: 'm6', type: 'adjustment', quantity: -3, date: '2026-01-20' },
    { ...base, id: 'm7', type: 'transferOut', quantity: 20, date: '2026-01-25' },
    { ...base, id: 'm8', type: 'transferIn', quantity: 20, branchId: 'b2', date: '2026-01-25' },
  ];

  it('applies the correct sign per movement type', () => {
    expect(signedQuantity(movements[0])).toBe(100);
    expect(signedQuantity(movements[2])).toBe(-30);
    expect(signedQuantity(movements[3])).toBe(5);
    expect(signedQuantity(movements[4])).toBe(-10);
    expect(signedQuantity(movements[5])).toBe(-3);
  });

  it('derives current stock from the movement list', () => {
    // 100 + 50 - 30 + 5 - 10 - 3 - 20 + 20 = 112 across all branches
    expect(stockOnHand('i1', movements)).toBe(112);
  });

  it('scopes stock to a branch', () => {
    expect(stockOnHand('i1', movements, 'b1')).toBe(92);
    expect(stockOnHand('i1', movements, 'b2')).toBe(20);
  });

  it('keeps a transfer neutral overall', () => {
    const transfers = movements.filter((m) => m.type.startsWith('transfer'));
    expect(transfers.reduce((a, m) => a + signedQuantity(m), 0)).toBe(0);
  });

  it('builds a running balance in date order', () => {
    const rows = ledgerFor('i1', movements, 'b1');
    expect(rows[0].balance).toBe(100);
    expect(rows[1].balance).toBe(150);
    expect(rows[2].balance).toBe(120);
    expect(rows[rows.length - 1].balance).toBe(92);
  });

  describe('shortfalls before finalising', () => {
    const rod = { id: 'i1', name: 'Rod', unit: 'PCS', type: 'goods', trackInventory: true } as Item;
    const fitting = { id: 'i2', name: 'Fitting', unit: 'NOS', type: 'service', trackInventory: false } as Item;
    const ln = (itemId: string | undefined, quantity: number) => ({ itemId, quantity }) as DocumentLine;
    const check = (kind: BusinessDocument['kind'], lines: DocumentLine[], over: { allowNegativeStock?: boolean; sourceDocumentId?: string } = {}) =>
      stockShortfalls({ doc: { kind, branchId: 'b1', lines, sourceDocumentId: over.sourceDocumentId }, items: [rod, fitting], movements, allowNegativeStock: over.allowNegativeStock });

    it('flags a sale above what the branch holds, adding up lines for the same item', () => {
      expect(check('invoice', [ln('i1', 50)])).toEqual([]);
      expect(check('invoice', [ln('i1', 50), ln('i1', 50), ln('i2', 500), ln(undefined, 9)])).toEqual([
        { itemId: 'i1', name: 'Rod', unit: 'PCS', onHand: 92, needed: 100 },
      ]);
      expect(check('purchaseReturn', [ln('i1', 93)])).toHaveLength(1);
    });

    it('lets it through when stock comes in, is allowed negative, or already left with the source', () => {
      expect(check('purchaseBill', [ln('i1', 500)])).toEqual([]);
      expect(check('invoice', [ln('i1', 500)], { allowNegativeStock: true })).toEqual([]);
      const delivered = [...movements, { ...base, id: 'm9', type: 'salesIssue' as const, quantity: 500, referenceId: 'dn1' }];
      expect(stockShortfalls({ doc: { kind: 'invoice', branchId: 'b1', lines: [ln('i1', 500)], sourceDocumentId: 'dn1' }, items: [rod], movements: delivered })).toEqual([]);
    });
  });
});

describe('foreign exchange (FRD 6)', () => {
  const rates: ExchangeRate[] = [
    { id: 'r1', companyId: 'c', from: 'AED', to: 'INR', rate: 22.0, effectiveFrom: '2026-01-01', source: 'manual' },
    { id: 'r2', companyId: 'c', from: 'AED', to: 'INR', rate: 23.85, effectiveFrom: '2026-06-01', source: 'provider' },
  ];

  it('picks the most recent rate on or before the document date', () => {
    expect(resolveRate(rates, 'AED', 'INR', '2026-03-01')).toBe(22.0);
    expect(resolveRate(rates, 'AED', 'INR', '2026-09-01')).toBe(23.85);
  });

  it('falls back to 1 when no rate applies yet', () => {
    expect(resolveRate(rates, 'AED', 'INR', '2025-01-01')).toBe(1);
    expect(resolveRate(rates, 'INR', 'INR', '2026-09-01')).toBe(1);
  });

  it('inverts a rate when only the opposite pair exists', () => {
    expect(resolveRate(rates, 'INR', 'AED', '2026-09-01')).toBeCloseTo(1 / 23.85, 6);
  });

  it('recognises a gain when settlement beats the document rate', () => {
    const gain = settlementGainLoss(fromMajor('1000', 'AED'), 22.0, 23.85, 'INR');
    expect(gain.minor).toBe(Math.round(100000 * 23.85) - Math.round(100000 * 22.0));
    expect(gain.minor).toBeGreaterThan(0);
  });

  it('recognises a loss when settlement is below the document rate', () => {
    expect(settlementGainLoss(fromMajor('1000', 'AED'), 23.85, 22.0, 'INR').minor).toBeLessThan(0);
  });
});

describe('advance adjustment', () => {
  const advance = (amount: string, date = addDaysISO(today(), -60)): Payment =>
    payment('none', amount, {
      id: `adv-${amount}`,
      date,
      allocations: [],
      unallocated: fromMajor(amount, 'INR'),
    });

  it('applies an advance to the oldest open invoice first', () => {
    const older = invoice({ id: 'a', number: 'INV/1', date: addDaysISO(today(), -50) });
    const newer = invoice({ id: 'b', number: 'INV/2', date: addDaysISO(today(), -5) });
    const [changed] = allocateAdvances([newer, older], [advance('1200')]);
    expect(changed.allocations.map((a) => [a.documentId, a.amount.minor])).toEqual([
      ['a', 100000],
      ['b', 20000],
    ]);
    expect(changed.unallocated.minor).toBe(0);
  });

  it('keeps what the invoices cannot absorb as an advance', () => {
    const [changed] = allocateAdvances([invoice()], [advance('1500')]);
    expect(changed.allocations[0].amount.minor).toBe(100000);
    expect(changed.unallocated.minor).toBe(50000);
  });

  it('respects allocations already made by other payments', () => {
    const partly = payment('inv1', '400');
    const [changed] = allocateAdvances([invoice()], [partly, advance('1000')]);
    expect(changed.allocations[0].amount.minor).toBe(60000);
    expect(changed.unallocated.minor).toBe(40000);
  });

  it('changes nothing when there is no advance or nothing open', () => {
    expect(allocateAdvances([invoice()], [payment('inv1', '100')])).toEqual([]);
    expect(allocateAdvances([], [advance('100')])).toEqual([]);
  });

  it('sums the advance a party holds', () => {
    expect(availableAdvance([advance('100'), advance('250'), payment('inv1', '50')], 'INR').minor).toBe(35000);
  });
});

describe('credit limit', () => {
  const base = { partyId: 'p1', payments: [] as Payment[], rateToBase: (c: string) => (c === 'USD' ? 80 : 1) };

  it('adds the new invoice to what the party already owes', () => {
    const r = checkCreditLimit({
      ...base,
      limit: fromMajor('1500', 'INR'),
      documents: [invoice()],
      newTotal: fromMajor('600', 'INR'),
    });
    expect(r.exposure.minor).toBe(160000);
    expect(r.exceeds).toBe(true);
  });

  it('counts only what is still outstanding, and only this party', () => {
    const r = checkCreditLimit({
      ...base,
      limit: fromMajor('1500', 'INR'),
      documents: [invoice(), invoice({ id: 'inv2', partyId: 'p2' })],
      payments: [payment('inv1', '400')],
      newTotal: fromMajor('600', 'INR'),
    });
    expect(r.exposure.minor).toBe(120000);
    expect(r.exceeds).toBe(false);
  });

  it('does not count the draft being finalised twice', () => {
    const r = checkCreditLimit({
      ...base,
      limit: fromMajor('1000', 'INR'),
      documents: [invoice()],
      newTotal: fromMajor('1000', 'INR'),
      excludeDocumentId: 'inv1',
    });
    expect(r.exceeds).toBe(false);
  });

  it('converts a foreign-currency invoice into the limit currency', () => {
    const r = checkCreditLimit({
      ...base,
      limit: fromMajor('1000', 'INR'),
      documents: [],
      newTotal: fromMajor('20', 'USD'),
    });
    expect(r.exposure.minor).toBe(160000);
    expect(r.exceeds).toBe(true);
  });
});
