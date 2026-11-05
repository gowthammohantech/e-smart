import { bucketsOf, cashMovement, cashSeries, changePct, deadStock, filingCalendar, gstr1DueDate, periodOf, previousPeriod, trendBuckets, voucherCashFlows } from '../dashboard';
import type { Item, StockMovement } from '../../types';

describe('periods', () => {
  it('names the period around today', () => {
    expect(periodOf('today', '2026-11-05')).toEqual({ from: '2026-11-05', to: '2026-11-05' });
    expect(periodOf('week', '2026-11-05')).toEqual({ from: '2026-11-02', to: '2026-11-08' }); // Thursday → Mon-Sun
    expect(periodOf('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodOf('quarter', '2026-11-05')).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(periodOf('year', '2026-11-05', 4)).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(periodOf('year', '2026-02-05', 4)).toEqual({ from: '2025-04-01', to: '2026-03-31' });
    expect(periodOf('custom', '2026-11-05', 4, { from: '2026-10-10', to: '2026-10-20' })).toEqual({ from: '2026-10-10', to: '2026-10-20' });
  });

  it('steps back by whole months, or else by days', () => {
    expect(previousPeriod({ from: '2026-10-01', to: '2026-10-31' })).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(previousPeriod({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousPeriod({ from: '2026-10-01', to: '2026-12-31' })).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(previousPeriod({ from: '2026-04-01', to: '2027-03-31' })).toEqual({ from: '2025-04-01', to: '2026-03-31' });
    expect(previousPeriod({ from: '2026-01-01', to: '2026-01-31' })).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(previousPeriod({ from: '2026-11-02', to: '2026-11-08' })).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(previousPeriod({ from: '2026-11-05', to: '2026-11-05' })).toEqual({ from: '2026-11-04', to: '2026-11-04' });
  });

  it('gives no change against nothing', () => {
    expect(changePct(150, 100)).toBe(50);
    expect(changePct(50, 100)).toBe(-50);
    expect(changePct(-50, -100)).toBe(50);
    expect(changePct(10, 0)).toBeNull();
  });

  it('buckets a period by day, week and month, clipped to it', () => {
    expect(bucketsOf({ from: '2026-11-01', to: '2026-11-03' }, 'day').map((b) => b.key)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    const weeks = bucketsOf({ from: '2026-11-01', to: '2026-11-30' }, 'week');
    expect(weeks[0]).toEqual({ key: '2026-10-26', from: '2026-11-01', to: '2026-11-01' });
    expect(weeks[weeks.length - 1]).toEqual({ key: '2026-11-30', from: '2026-11-30', to: '2026-11-30' });
    expect(bucketsOf({ from: '2026-10-15', to: '2026-12-10' }, 'month')).toEqual([
      { key: '2026-10', from: '2026-10-15', to: '2026-10-31' },
      { key: '2026-11', from: '2026-11-01', to: '2026-11-30' },
      { key: '2026-12', from: '2026-12-01', to: '2026-12-10' },
    ]);
  });

  it('draws a monthly trend over six months at least, and steps up a grain past too many bars', () => {
    expect(trendBuckets({ from: '2026-11-01', to: '2026-11-30' }).buckets.map((b) => b.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    expect(trendBuckets({ from: '2026-04-01', to: '2027-03-31' }).buckets).toHaveLength(12);
    const year = trendBuckets({ from: '2026-04-01', to: '2027-03-31' }, 'day');
    expect(year.grain).toBe('week');
    expect(trendBuckets({ from: '2026-11-01', to: '2026-11-30' }, 'day').buckets).toHaveLength(30);
  });
});

describe('filing calendar', () => {
  it('dates GSTR-1 and IFF', () => {
    expect(gstr1DueDate('102026', 'monthly')).toEqual({ due: '2026-11-11', iff: false });
    expect(gstr1DueDate('122026', 'monthly')).toEqual({ due: '2027-01-11', iff: false });
    expect(gstr1DueDate('102026', 'qrmp')).toEqual({ due: '2026-11-13', iff: true });
    expect(gstr1DueDate('122026', 'qrmp')).toEqual({ due: '2027-01-13', iff: false });
  });

  it('lists a monthly filer’s returns and TDS in date order', () => {
    const due = filingCalendar({ from: '2026-11-05', to: '2026-12-31', frequency: 'monthly', stateCode: '27', deductsTds: true });
    expect(due.map((d) => `${d.kind}:${d.period}:${d.due}`)).toEqual([
      'tds:2026-10:2026-11-07',
      'gstr1:102026:2026-11-11',
      'gstr3b:102026:2026-11-20',
      'tds:2026-11:2026-12-07',
      'gstr1:112026:2026-12-11',
      'gstr3b:112026:2026-12-20',
    ]);
  });

  it('gives a QRMP filer IFF and PMT-06 in a quarter’s first months, and the returns after it', () => {
    const due = filingCalendar({ from: '2026-11-01', to: '2027-01-31', frequency: 'qrmp', stateCode: '27', deductsTds: false });
    expect(due.map((d) => `${d.kind}:${d.period}:${d.due}:${d.optional}`)).toEqual([
      'iff:102026:2026-11-13:true',
      'pmt06:102026:2026-11-25:false',
      'iff:112026:2026-12-13:true',
      'pmt06:112026:2026-12-25:false',
      'gstr1:122026:2027-01-13:false',
      'gstr3b:122026:2027-01-22:false',
    ]);
  });
});

describe('dead stock', () => {
  const item = (id: string, track = true) => ({ id, name: id, trackInventory: track, reorderLevel: 0 }) as unknown as Item;
  const mv = (itemId: string, type: StockMovement['type'], quantity: number, date: string) => ({ id: `${itemId}${date}${type}`, itemId, type, quantity, date, branchId: 'b' }) as StockMovement;

  it('finds stock nothing has taken out of in the window', () => {
    const movements = [
      mv('old', 'purchaseReceipt', 10, '2026-01-10'),
      mv('old', 'salesIssue', 2, '2026-03-01'),
      mv('selling', 'purchaseReceipt', 10, '2026-01-10'),
      mv('selling', 'salesIssue', 1, '2026-10-20'),
      mv('fresh', 'purchaseReceipt', 10, '2026-10-30'),
      mv('gone', 'purchaseReceipt', 1, '2026-01-10'),
      mv('gone', 'salesIssue', 1, '2026-02-10'),
      mv('never', 'opening', 3, '2026-04-01'),
    ];
    const rows = deadStock([item('old'), item('selling'), item('fresh'), item('gone'), item('never'), item('untracked', false)], movements, '2026-11-05');
    expect(rows.map((r) => [r.item.id, r.onHand, r.lastOut])).toEqual([
      ['never', 3, undefined],
      ['old', 8, '2026-03-01'],
    ]);
  });
});

describe('cash movement', () => {
  it('splits a voucher’s cash by kind, and leaves own-account transfers out', () => {
    expect(voucherCashFlows({ date: '2026-11-01', kind: 'contra', lines: [{ account: 'pay:cash', debitMinor: 0, creditMinor: 500 }, { account: 'pay:bank', debitMinor: 500, creditMinor: 0 }] })).toEqual([]);
    expect(voucherCashFlows({ date: '2026-11-01', kind: 'tdsChallan', lines: [{ account: 'sys:tdsPayable:194C', debitMinor: 900, creditMinor: 0 }, { account: 'pay:bank', debitMinor: 0, creditMinor: 900 }] })).toEqual([{ date: '2026-11-01', category: 'tax', minor: -900 }]);
    expect(voucherCashFlows({ date: '2026-11-01', kind: 'journal', lines: [{ account: 'exp:charges', debitMinor: 50, creditMinor: 0 }, { account: 'pay:bank', debitMinor: 0, creditMinor: 50 }] })).toEqual([{ date: '2026-11-01', category: 'other', minor: -50 }]);
  });

  it('carries earlier flows into the opening and ties opening + net to closing', () => {
    const flows = [
      { date: '2026-10-20', category: 'receipts' as const, minor: 1000 },
      { date: '2026-11-02', category: 'receipts' as const, minor: 5000 },
      { date: '2026-11-03', category: 'payments' as const, minor: -2000 },
      { date: '2026-11-04', category: 'expenses' as const, minor: -300 },
      { date: '2026-12-01', category: 'receipts' as const, minor: 9999 },
    ];
    const m = cashMovement(10_000, flows, { from: '2026-11-01', to: '2026-11-30' });
    expect(m).toEqual({ opening: 11_000, inflow: 5000, outflow: 2300, net: 2700, closing: 13_700, byCategory: { receipts: 5000, payments: -2000, expenses: -300, tax: 0, other: 0 } });
    expect(cashSeries(bucketsOf({ from: '2026-11-01', to: '2026-11-30' }, 'month'), flows)).toEqual([{ key: '2026-11', inflow: 5000, outflow: 2300 }]);
  });
});
