import { monthEndBalances } from '../ledger/reports';
import type { Posting } from '../ledger/postings';

const p = (date: string, debit: number, credit = 0, account = 'pay:bank'): Posting => ({
  date,
  account,
  debit,
  credit,
  source: { type: 'payment', id: date, number: date },
});

describe('monthEndBalances', () => {
  const postings = [p('1900-01-01', 1000), p('2026-08-10', 500), p('2026-09-03', 0, 2000), p('2026-11-02', 300), p('2026-10-05', 99, 0, 'pay:cash')];

  it('gives the balance at each month end, opening included, and only for that account', () => {
    expect(monthEndBalances(postings, 'pay:bank', { from: '2026-08-01', to: '2026-11-05' })).toEqual([
      { month: '2026-08', balance: 1500 },
      { month: '2026-09', balance: -500 },
      { month: '2026-10', balance: -500 },
      { month: '2026-11', balance: -200 },
    ]);
  });

  it('keeps to the last months asked for, and leaves out entries after the period', () => {
    expect(monthEndBalances(postings, 'pay:bank', { from: '1900-01-01', to: '2026-10-31' }, 3)).toEqual([
      { month: '2026-08', balance: 1500 },
      { month: '2026-09', balance: -500 },
      { month: '2026-10', balance: -500 },
    ]);
  });

  it('crosses a year end', () => {
    expect(monthEndBalances([p('2026-12-15', 100)], 'pay:bank', { from: '2026-12-01', to: '2027-01-20' }).map((r) => r.month)).toEqual(['2026-12', '2027-01']);
  });
});
