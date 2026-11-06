import { addDaysISO } from '../lib/date';

/**
 * Where cash is heading, week by week: today's cash and bank, plus what customers owe by its due date,
 * less what is owed to suppliers by its due date, plus the copies of recurring invoices and the
 * recurring expenses that fall in the weeks ahead. What is overdue counts in the first week, marked,
 * since it could arrive (or be asked for) any day. Amounts are base-currency minor units.
 */

export type ForecastFlow = {
  date: string;
  amount: number;
  label: string;
  kind: 'receivable' | 'payable' | 'recurringInvoice' | 'recurringExpense';
  /** Due before today. */
  overdue?: boolean;
  ref?: string;
};

export type ForecastWeek = {
  from: string;
  to: string;
  opening: number;
  inflow: number;
  outflow: number;
  closing: number;
  flows: ForecastFlow[];
};

export type CashForecast = {
  today: string;
  openingCash: number;
  weeks: ForecastWeek[];
  /** The lowest closing balance, and the week it falls in. */
  lowest: { amount: number; weekIndex: number };
  /** The first week that closes below zero, if one does. */
  firstShortfall: number | null;
};

export function cashForecast(input: { today: string; weeks: number; openingCash: number; inflows: ForecastFlow[]; outflows: ForecastFlow[] }): CashForecast {
  const { today, openingCash } = input;
  const weeks: ForecastWeek[] = [];
  let balance = openingCash;
  const horizonEnd = addDaysISO(today, input.weeks * 7 - 1);
  const flows = [...input.inflows, ...input.outflows]
    .filter((f) => f.amount > 0 && f.date <= horizonEnd)
    .map((f) => ({ ...f, overdue: f.date < today }));
  for (let w = 0; w < input.weeks; w++) {
    const from = addDaysISO(today, w * 7);
    const to = addDaysISO(from, 6);
    // Overdue items have no date of their own ahead, so they sit in the first week.
    const here = flows.filter((f) => (w === 0 ? f.date <= to : f.date >= from && f.date <= to));
    const inflow = here.filter((f) => f.kind === 'receivable' || f.kind === 'recurringInvoice').reduce((a, f) => a + f.amount, 0);
    const outflow = here.filter((f) => f.kind === 'payable' || f.kind === 'recurringExpense').reduce((a, f) => a + f.amount, 0);
    const opening = balance;
    balance = opening + inflow - outflow;
    weeks.push({ from, to, opening, inflow, outflow, closing: balance, flows: here.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount) });
  }
  const lowestIndex = weeks.reduce((min, wk, i) => (wk.closing < weeks[min].closing ? i : min), 0);
  const shortfall = weeks.findIndex((wk) => wk.closing < 0);
  return { today, openingCash, weeks, lowest: { amount: weeks[lowestIndex]?.closing ?? openingCash, weekIndex: lowestIndex }, firstShortfall: shortfall < 0 ? null : shortfall };
}
