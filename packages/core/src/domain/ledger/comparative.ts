import { addDaysISO } from '../../lib/date';
import type { Posting } from './postings';
import type { Book } from './accounts';
import { balanceSheet, profitAndLoss, type BalanceSheet, type ProfitAndLoss, type StatementLine, type Stock } from './reports';

/**
 * The P&L and the balance sheet side by side: month by month or quarter by quarter, or against the
 * period before or the same period last year. Each column is the same statement worked out on its
 * own, so a column always agrees with the single report for that period.
 */

export type Period = { from: string; to: string; label: string };
export type Breakdown = 'month' | 'quarter';
export type Comparison = 'previousPeriod' | 'previousYear';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
const lastOfMonth = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const firstOfNextMonth = (iso: string) => addDaysISO(lastOfMonth(iso), 1);
const shiftYears = (iso: string, years: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The range cut into calendar months or quarters of three months from its start; the ends are clipped to the range. */
export function splitPeriods(range: { from: string; to: string }, by: Breakdown): Period[] {
  const out: Period[] = [];
  let start = range.from;
  while (start <= range.to) {
    let end = lastOfMonth(start);
    // A quarter ends with the second month after the one it starts in.
    if (by === 'quarter') end = lastOfMonth(firstOfNextMonth(firstOfNextMonth(start)));
    if (end > range.to) end = range.to;
    out.push({ from: start, to: end, label: by === 'month' ? monthLabel(start) : `${monthLabel(start)} – ${monthLabel(end)}` });
    start = addDaysISO(end, 1);
  }
  return out;
}

/** The range to set beside this one: as long, just before it, or the same dates a year earlier. */
export function comparisonPeriod(range: { from: string; to: string }, compare: Comparison): Period {
  if (compare === 'previousYear') {
    const from = shiftYears(range.from, -1);
    const to = shiftYears(range.to, -1);
    return { from, to, label: `${from} – ${to}` };
  }
  const to = addDaysISO(range.from, -1);
  // Whole months step back by as many months (Jul–Sep against Apr–Jun); other ranges by as many days.
  if (range.from.endsWith('-01') && range.to === lastOfMonth(range.to)) {
    const months = (Number(range.to.slice(0, 4)) - Number(range.from.slice(0, 4))) * 12 + Number(range.to.slice(5, 7)) - Number(range.from.slice(5, 7)) + 1;
    const [y, m] = range.from.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1 - months, 1)).toISOString().slice(0, 10);
    return { from: start, to, label: `${start} – ${to}` };
  }
  const from = addDaysISO(to, -daysBetween(range.from, range.to));
  return { from, to, label: `${from} – ${to}` };
}

export type ColumnRow = { key: string; name: string; group: StatementLine['group']; values: number[] };

export type ProfitAndLossColumns = {
  periods: Period[];
  tradingIncome: ColumnRow[];
  tradingExpense: ColumnRow[];
  openingStock: number[];
  closingStock: number[];
  grossProfit: number[];
  indirectIncome: ColumnRow[];
  indirectExpense: ColumnRow[];
  netProfit: number[];
};

/** Lines of the same account from each column into one row; an account missing from a column is 0 there. */
function pivot(columns: StatementLine[][]): ColumnRow[] {
  const rows = new Map<string, ColumnRow>();
  columns.forEach((lines, i) => {
    for (const l of lines) {
      const row = rows.get(l.account.key) ?? { key: l.account.key, name: l.account.name, group: l.group, values: columns.map(() => 0) };
      row.values[i] += l.amount;
      rows.set(l.account.key, row);
    }
  });
  // Largest across the columns first, as each single report sorts.
  return [...rows.values()].sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0));
}

export function profitAndLossColumns(postings: Posting[], book: Book, periods: Period[], stock: Stock): ProfitAndLossColumns {
  const each: ProfitAndLoss[] = periods.map((p) => profitAndLoss(postings, book, p, stock));
  return {
    periods,
    tradingIncome: pivot(each.map((r) => r.trading.income)),
    tradingExpense: pivot(each.map((r) => r.trading.expense)),
    openingStock: each.map((r) => r.trading.openingStock),
    closingStock: each.map((r) => r.trading.closingStock),
    grossProfit: each.map((r) => r.grossProfit),
    indirectIncome: pivot(each.map((r) => r.indirect.income)),
    indirectExpense: pivot(each.map((r) => r.indirect.expense)),
    netProfit: each.map((r) => r.netProfit),
  };
}

export type BalanceSheetColumns = {
  dates: string[];
  assets: { heading: string; rows: ColumnRow[]; totals: number[] }[];
  liabilities: { heading: string; rows: ColumnRow[]; totals: number[] }[];
  currentProfit: number[];
  totalAssets: number[];
  totalLiabilities: number[];
};

/** The balance sheet on each date, headings and accounts lined up across the dates. */
export function balanceSheetColumns(postings: Posting[], book: Book, dates: string[], stock: Stock, fyStartMonth = 4): BalanceSheetColumns {
  const each: BalanceSheet[] = dates.map((d) => balanceSheet(postings, book, d, stock, fyStartMonth));
  const side = (pick: (b: BalanceSheet) => BalanceSheet['assets']) => {
    const headings = [...new Set(each.flatMap((b) => pick(b).map((s) => s.heading)))];
    return headings.map((heading) => {
      const columns = each.map((b) => pick(b).find((s) => s.heading === heading)?.lines ?? []);
      return { heading, rows: pivot(columns), totals: each.map((b) => pick(b).find((s) => s.heading === heading)?.total ?? 0) };
    });
  };
  return {
    dates,
    assets: side((b) => b.assets),
    liabilities: side((b) => b.liabilities),
    currentProfit: each.map((b) => b.currentProfit),
    totalAssets: each.map((b) => b.totalAssets),
    totalLiabilities: each.map((b) => b.totalLiabilities),
  };
}

/** The change from the comparison column to this one, and as a share of the comparison (null when that was 0). */
export function variance(current: number, previous: number): { amount: number; percent: number | null } {
  return { amount: current - previous, percent: previous ? Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10 : null };
}
