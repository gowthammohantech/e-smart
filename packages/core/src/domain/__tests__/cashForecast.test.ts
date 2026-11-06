import { cashForecast } from '../cashForecast';
import { occurrencesBetween } from '../recurrence';

describe('cash-flow forecast', () => {
  const today = '2026-11-05';
  it('runs cash forward week by week, overdue money in the first week', () => {
    const f = cashForecast({
      today,
      weeks: 4,
      openingCash: 100_000,
      inflows: [
        { date: '2026-10-20', amount: 30_000, label: 'INV/1', kind: 'receivable' },
        { date: '2026-11-15', amount: 50_000, label: 'INV/2', kind: 'receivable' },
        { date: '2027-02-01', amount: 99_000, label: 'INV/far', kind: 'receivable' },
      ],
      outflows: [{ date: '2026-11-08', amount: 200_000, label: 'BILL/1', kind: 'payable' }],
    });
    expect(f.weeks.map((w) => [w.from, w.inflow, w.outflow, w.closing])).toEqual([
      ['2026-11-05', 30_000, 200_000, -70_000],
      ['2026-11-12', 50_000, 0, -20_000],
      ['2026-11-19', 0, 0, -20_000],
      ['2026-11-26', 0, 0, -20_000],
    ]);
    expect(f.weeks[0].flows[0]).toMatchObject({ label: 'INV/1', overdue: true });
    expect(f.lowest).toEqual({ amount: -70_000, weekIndex: 0 });
    expect(f.firstShortfall).toBe(0);
  });

  it('lists the dates a series falls on, to its end', () => {
    expect(occurrencesBetween('2026-01-31', 'monthly', '2026-11-30', '2027-02-28')).toEqual(['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
    expect(occurrencesBetween('2026-01-31', 'monthly', '2026-11-30', '2027-02-28', '2026-12-31')).toEqual(['2026-11-30', '2026-12-31']);
  });
});
