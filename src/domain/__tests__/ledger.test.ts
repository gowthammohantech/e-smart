import { buildOutstanding, bucketFor, outstandingOf, summarizeAging } from '@/domain/receivables';
import { ledgerFor, signedQuantity, stockOnHand } from '@/domain/stockLedger';
import { resolveRate, settlementGainLoss } from '@/domain/fx';
import { BusinessDocument, ExchangeRate, Payment, StockMovement } from '@/types';
import { fromMajor, zero } from '@/lib/money';
import { addDaysISO, today } from '@/lib/date';

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
