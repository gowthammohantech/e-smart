import { canCancel, canCancelDocument } from '../documentStates';

describe('cancelling', () => {
  it('follows the transitions the server checks', () => {
    expect(canCancel('quote', 'draft')).toBe(true);
    expect(canCancel('quote', 'sent')).toBe(false);
    expect(canCancel('delivery', 'delivered')).toBe(false);
    expect(canCancel('salesOrder', 'confirmed')).toBe(true);
    expect(canCancel('salesOrder', 'fulfilled')).toBe(false);
    expect(canCancel('salesReturn', 'approved')).toBe(true);
    expect(canCancel('salesReturn', 'processed')).toBe(false);
    expect(canCancel('invoice', 'issued')).toBe(true);
    expect(canCancel('invoice', 'overdue')).toBe(true);
    expect(canCancel('invoice', 'partiallyPaid')).toBe(false);
    expect(canCancel('invoice', 'paid')).toBe(false);
    expect(canCancel('invoice', 'cancelled')).toBe(false);
  });

  it('refuses anything money has been paid against, even an overdue invoice', () => {
    const asOf = '2026-11-10';
    expect(canCancelDocument({ kind: 'invoice', status: 'issued' }, { paidMinor: 0 }, asOf)).toBe(true);
    expect(canCancelDocument({ kind: 'invoice', status: 'overdue', dueDate: '2026-10-01' }, { paidMinor: 100 }, asOf)).toBe(false);
    expect(canCancelDocument({ kind: 'invoice', status: 'paid' }, { paidMinor: 1000 }, asOf)).toBe(false);
  });

  it('looks past a bill’s own TDS, which no money settled', () => {
    const asOf = '2026-11-10';
    expect(canCancelDocument({ kind: 'purchaseBill', status: 'partiallyPaid' }, { paidMinor: 200, ownTdsMinor: 200 }, asOf)).toBe(true);
    expect(canCancelDocument({ kind: 'purchaseBill', status: 'partiallyPaid', dueDate: '2026-10-01' }, { paidMinor: 200, ownTdsMinor: 200 }, asOf)).toBe(true);
    expect(canCancelDocument({ kind: 'purchaseBill', status: 'partiallyPaid' }, { paidMinor: 500, ownTdsMinor: 200 }, asOf)).toBe(false);
  });
});
