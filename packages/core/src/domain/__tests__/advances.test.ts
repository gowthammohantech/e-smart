import type { Payment } from '../../types';
import { summarizeAdvances } from '../reports';

const range = { from: '2026-04-01', to: '2027-03-31' };

function payment(over: Partial<Payment>): Payment {
  return {
    id: 'pay_1',
    companyId: 'cmp_1',
    branchId: 'brn_1',
    number: 'PAY-1',
    direction: 'received',
    partyId: 'pty_1',
    date: '2026-10-01',
    amount: { minor: 100000, currency: 'INR' },
    exchangeRate: 1,
    method: 'cash',
    accountId: 'acc_1',
    allocations: [],
    unallocated: { minor: 0, currency: 'INR' },
    createdBy: 'usr_1',
    createdAt: '2026-10-01T00:00:00Z',
    ...over,
  } as Payment;
}

describe('advances report', () => {
  it('lists only payments with money not yet adjusted, received and paid apart', () => {
    const summary = summarizeAdvances(
      [
        payment({ id: 'a', unallocated: { minor: 40000, currency: 'INR' } }),
        payment({ id: 'b' }),
        payment({ id: 'c', direction: 'paid', date: '2026-11-01', unallocated: { minor: 25000, currency: 'INR' } }),
      ],
      'INR',
      { range },
    );
    expect(summary.rows.map((r) => r.id)).toEqual(['c', 'a']);
    expect(summary.received.minor).toBe(40000);
    expect(summary.paid.minor).toBe(25000);
  });

  it('converts a foreign-currency advance to the base currency', () => {
    const summary = summarizeAdvances(
      [payment({ currency: 'USD', amount: { minor: 10000, currency: 'USD' }, exchangeRate: 83, unallocated: { minor: 10000, currency: 'USD' } })],
      'INR',
      { range },
    );
    expect(summary.received).toEqual({ minor: 830000, currency: 'INR' });
  });

  it('keeps to the date range and the chosen party', () => {
    const open = { unallocated: { minor: 100, currency: 'INR' } };
    const rows = summarizeAdvances(
      [payment({ id: 'old', date: '2026-01-10', ...open }), payment({ id: 'other', partyId: 'pty_2', ...open }), payment({ id: 'mine', ...open })],
      'INR',
      { range, partyId: 'pty_1' },
    ).rows;
    expect(rows.map((r) => r.id)).toEqual(['mine']);
  });
});
