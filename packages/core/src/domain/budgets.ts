import { daysBetween } from '../lib/date';
import { accountFor, GROUPS, type Book } from './ledger/accounts';
import type { Posting } from './ledger/postings';

/**
 * Budgets and how the books did against them (RULES 6.16). A budget plans each income and expense
 * account month by month over a financial year, for the whole business or for one branch or cost
 * centre. What happened is read from the postings, the same the profit and loss is worked out from.
 *
 * Amounts are base-currency paise, written the way the profit and loss shows them: income as what was
 * earned, expenses as what was spent, both positive.
 */

export type BudgetLine = { account: string; months: number[] };

export type Budget = {
  id: string;
  name: string;
  /** The first day of the financial year it plans. */
  yearFrom: string;
  branchId?: string;
  costCentreId?: string;
  lines: BudgetLine[];
};

export type VarianceRow = {
  account: string;
  nature: 'income' | 'expense';
  budget: number;
  actual: number;
  /** Actual less budget. */
  variance: number;
  /** Earned more, or spent less, than planned (or exactly as planned). */
  favourable: boolean;
  /** Each month of the range, budget and actual. */
  months: { month: string; budget: number; actual: number }[];
};

export type BudgetVariance = {
  from: string;
  to: string;
  rows: VarianceRow[];
  income: { budget: number; actual: number };
  expense: { budget: number; actual: number };
  /** Net profit: income less expenses. */
  profit: { budget: number; actual: number };
};

/** The first day of each month of a financial year starting `yearFrom`. */
export function budgetMonths(yearFrom: string): string[] {
  const [y, m] = yearFrom.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return d.toISOString().slice(0, 10);
  });
}

const monthEnd = (first: string) => {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
};

/** Splits an annual figure into twelve months that add up to it exactly. */
export function spreadEvenly(annual: number): number[] {
  const base = Math.floor(annual / 12);
  const rest = annual - base * 12;
  return Array.from({ length: 12 }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Whether an account takes a budget: an income or expense account. */
export function budgetable(key: string, book: Book): boolean {
  const a = accountFor(key, book);
  return !!a && ['income', 'expense'].includes(GROUPS[a.group].nature);
}

/**
 * The budget against the books over `range`: for each account planned, what was planned, what
 * happened, and the difference, month by month. A month the range covers only part of is planned in
 * proportion to its days covered, so a year to date reads fairly.
 */
export function budgetVariance(budget: Budget, postings: Posting[], book: Book, range: { from: string; to: string }): BudgetVariance {
  const all = budgetMonths(budget.yearFrom);
  const yearEnd = monthEnd(all[11]);
  const from = range.from > budget.yearFrom ? range.from : budget.yearFrom;
  const to = range.to < yearEnd ? range.to : yearEnd;
  const covered = all
    .map((m, i) => {
      const start = m > from ? m : from;
      const end = monthEnd(m) < to ? monthEnd(m) : to;
      const days = end >= start ? daysBetween(start, end) + 1 : 0;
      return { month: m, i, share: days / (daysBetween(m, monthEnd(m)) + 1) };
    })
    .filter((m) => m.share > 0);
  const inScope = (p: Posting) => (!budget.branchId || p.branchId === budget.branchId) && (!budget.costCentreId || p.costCentreId === budget.costCentreId);
  const byAccountMonth = new Map<string, number>();
  for (const p of postings) {
    if (p.date < from || p.date > to || !inScope(p)) continue;
    const k = `${p.account}|${p.date.slice(0, 7)}`;
    byAccountMonth.set(k, (byAccountMonth.get(k) ?? 0) + p.debit - p.credit);
  }
  const rows: VarianceRow[] = [];
  for (const line of budget.lines) {
    const a = accountFor(line.account, book);
    if (!a) continue;
    const nature = GROUPS[a.group].nature === 'income' ? 'income' : 'expense';
    // Income is a credit, so earned is credit less debit; spent is debit less credit.
    const sign = nature === 'income' ? -1 : 1;
    const ms = covered.map((m) => ({ month: m.month, budget: Math.round((line.months[m.i] ?? 0) * m.share), actual: sign * (byAccountMonth.get(`${line.account}|${m.month.slice(0, 7)}`) ?? 0) }));
    const budgetTotal = ms.reduce((s, m) => s + m.budget, 0);
    const actual = ms.reduce((s, m) => s + m.actual, 0);
    const variance = actual - budgetTotal;
    rows.push({ account: line.account, nature, budget: budgetTotal, actual, variance, favourable: nature === 'income' ? variance >= 0 : variance <= 0, months: ms });
  }
  const sum = (n: 'income' | 'expense', k: 'budget' | 'actual') => rows.filter((r) => r.nature === n).reduce((s, r) => s + r[k], 0);
  const income = { budget: sum('income', 'budget'), actual: sum('income', 'actual') };
  const expense = { budget: sum('expense', 'budget'), actual: sum('expense', 'actual') };
  return {
    from,
    to,
    rows,
    income,
    expense,
    profit: { budget: income.budget - expense.budget, actual: income.actual - expense.actual },
  };
}
