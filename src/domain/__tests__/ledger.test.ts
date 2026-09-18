import { buildOutstanding, bucketFor, outstandingOf, summarizeAging } from '@/domain/receivables';
import { BusinessDocument, Payment } from '@/types';
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
    partyId: 'p1',
    date: today(),
    amount: fromMajor(amount, 'INR'),
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
});
