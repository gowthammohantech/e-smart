import { Item, LedgerGroup, StockMovement } from '../../types';
import { financialYearOf } from '../../lib/date';
import { stockValue } from '../stockLedger';
import { Account, Book, GROUPS, accountFor, isDebitNature } from './accounts';
import { OPENING_DATE, Posting } from './postings';

/** Day before an ISO date. */
const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * Stock in hand on `date`, at weighted-average cost: every tracked item's movements up to that day.
 * Stock counted when the books began counts from the start, whatever day it was counted.
 */
export function stockValueOn(items: Item[], movements: StockMovement[], date: string, baseCurrency: string): number {
  const upTo = movements.filter((m) => m.type === 'opening' || m.date <= date);
  return items.filter((i) => i.trackInventory).reduce((a, i) => a + stockValue(i, upTo, baseCurrency).minor, 0);
}

/** Stock counted when the books began (opening stock movements). */
export function openingStockValue(items: Item[], movements: StockMovement[], baseCurrency: string): number {
  return stockValueOn(items, movements.filter((m) => m.type === 'opening'), OPENING_DATE, baseCurrency);
}

export type Stock = { items: Item[]; movements: StockMovement[]; baseCurrency: string };

/** Net debit (debit positive) of each account over the postings given. */
function netByAccount(postings: Posting[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of postings) out.set(p.account, (out.get(p.account) ?? 0) + p.debit - p.credit);
  return out;
}

const isNominal = (group: LedgerGroup) => ['income', 'expense'].includes(GROUPS[group].nature);

export type TrialBalanceRow = {
  account: Account;
  /** Debit positive. */
  opening: number;
  debit: number;
  credit: number;
  closing: number;
};

/**
 * The trial balance for a period. Income and expense accounts start the financial year at zero;
 * what they made in earlier years sits in "Profit and loss of earlier years". Debits equal credits.
 */
export function trialBalance(postings: Posting[], book: Book, range: { from: string; to: string }, fyStartMonth = 4): { rows: TrialBalanceRow[]; totals: { debit: number; credit: number; openingDebit: number; openingCredit: number; closingDebit: number; closingCredit: number } } {
  const fyStart = financialYearOf(range.from, fyStartMonth).start;
  const before = netByAccount(postings.filter((p) => p.date < range.from));
  const earlier = netByAccount(postings.filter((p) => p.date < fyStart));
  const inside = postings.filter((p) => p.date >= range.from && p.date <= range.to);
  const keys = new Set([...before.keys(), ...inside.map((p) => p.account)]);
  const rows: TrialBalanceRow[] = [];
  let retained = 0;
  for (const key of keys) {
    const account = accountFor(key, book) ?? { key, name: key, group: 'currentAssets' as LedgerGroup, kind: 'system' as const };
    let opening = before.get(key) ?? 0;
    // Earlier years' income and expense close into retained earnings.
    if (isNominal(account.group)) {
      retained += earlier.get(key) ?? 0;
      opening -= earlier.get(key) ?? 0;
    }
    const own = inside.filter((p) => p.account === key);
    const debit = own.reduce((a, p) => a + p.debit, 0);
    const credit = own.reduce((a, p) => a + p.credit, 0);
    rows.push({ account, opening, debit, credit, closing: opening + debit - credit });
  }
  if (retained) {
    const key = 'sys:retainedEarnings';
    const row = rows.find((r) => r.account.key === key);
    if (row) {
      row.opening += retained;
      row.closing += retained;
    } else {
      rows.push({ account: accountFor(key, book)!, opening: retained, debit: 0, credit: 0, closing: retained });
    }
  }
  const live = rows.filter((r) => r.opening || r.debit || r.credit);
  live.sort((a, b) => groupOrder(a.account.group) - groupOrder(b.account.group) || a.account.name.localeCompare(b.account.name));
  const sum = (f: (r: TrialBalanceRow) => number) => live.reduce((a, r) => a + f(r), 0);
  return {
    rows: live,
    totals: {
      debit: sum((r) => r.debit),
      credit: sum((r) => r.credit),
      openingDebit: sum((r) => Math.max(r.opening, 0)),
      openingCredit: sum((r) => Math.max(-r.opening, 0)),
      closingDebit: sum((r) => Math.max(r.closing, 0)),
      closingCredit: sum((r) => Math.max(-r.closing, 0)),
    },
  };
}

const ORDER = Object.keys(GROUPS) as LedgerGroup[];
const groupOrder = (g: LedgerGroup) => ORDER.indexOf(g);

export type StatementLine = { group: LedgerGroup; account: Account; amount: number };

export type ProfitAndLoss = {
  /** Trading account: sales and direct income against purchases, direct costs and the change in stock. */
  trading: { income: StatementLine[]; expense: StatementLine[]; openingStock: number; closingStock: number };
  grossProfit: number;
  indirect: { income: StatementLine[]; expense: StatementLine[] };
  netProfit: number;
};

/** Income and expense for a period, in the Tally layout. Income lines are positive, as are expenses. */
export function profitAndLoss(postings: Posting[], book: Book, range: { from: string; to: string }, stock: Stock): ProfitAndLoss {
  const net = netByAccount(postings.filter((p) => p.date >= range.from && p.date <= range.to));
  const lines: StatementLine[] = [];
  for (const [key, value] of net) {
    const account = accountFor(key, book);
    if (!account || !isNominal(account.group) || !value) continue;
    // Income is a credit balance; shown positive.
    lines.push({ group: account.group, account, amount: isDebitNature(account.group) ? value : -value });
  }
  const pick = (trading: boolean, nature: 'income' | 'expense') =>
    lines.filter((l) => !!GROUPS[l.group].trading === trading && GROUPS[l.group].nature === nature).sort((a, b) => b.amount - a.amount);
  const openingStock = stockValueOn(stock.items, stock.movements, dayBefore(range.from), stock.baseCurrency);
  const closingStock = stockValueOn(stock.items, stock.movements, range.to, stock.baseCurrency);
  const total = (ls: StatementLine[]) => ls.reduce((a, l) => a + l.amount, 0);
  const trading = { income: pick(true, 'income'), expense: pick(true, 'expense'), openingStock, closingStock };
  const grossProfit = total(trading.income) + closingStock - openingStock - total(trading.expense);
  const indirect = { income: pick(false, 'income'), expense: pick(false, 'expense') };
  return { trading, grossProfit, indirect, netProfit: grossProfit + total(indirect.income) - total(indirect.expense) };
}

export type BalanceSheetSide = { heading: NonNullable<(typeof GROUPS)[LedgerGroup]['parent']>; lines: StatementLine[]; total: number }[];

export type BalanceSheet = {
  asOf: string;
  liabilities: BalanceSheetSide;
  assets: BalanceSheetSide;
  /** This year's profit so far, shown under capital. */
  currentProfit: number;
  totalLiabilities: number;
  totalAssets: number;
};

/**
 * Assets against liabilities and capital on a date. Stock is its value that day, not what was
 * posted; earlier years' profit sits in reserves and this year's under capital, so the two sides
 * agree whenever the postings balance.
 */
export function balanceSheet(postings: Posting[], book: Book, asOf: string, stock: Stock, fyStartMonth = 4): BalanceSheet {
  const fyStart = financialYearOf(asOf, fyStartMonth).start;
  const upTo = postings.filter((p) => p.date <= asOf);
  const net = netByAccount(upTo);
  const thisYear = profitAndLoss(postings, book, { from: fyStart, to: asOf }, stock).netProfit;
  // Earlier years: what income and expense made before this year, with stock's change to the year's start.
  const earlierNominal = [...netByAccount(upTo.filter((p) => p.date < fyStart)).entries()].reduce((a, [key, v]) => {
    const acc = accountFor(key, book);
    return acc && isNominal(acc.group) ? a + v : a;
  }, 0);
  const openingStock = net.get('sys:openingStock') ?? 0;
  const stockAtYearStart = stockValueOn(stock.items, stock.movements, dayBefore(fyStart), stock.baseCurrency);
  // Debit-positive, so a profit is negative here.
  const earlierProfit = -earlierNominal + stockAtYearStart - openingStock;

  const sides = { liabilities: new Map<string, StatementLine[]>(), assets: new Map<string, StatementLine[]>() };
  const add = (side: 'liabilities' | 'assets', line: StatementLine) => {
    const heading = GROUPS[line.group].parent!;
    sides[side].set(heading, [...(sides[side].get(heading) ?? []), line]);
  };
  for (const [key, value] of net) {
    const account = accountFor(key, book);
    if (!account || isNominal(account.group) || key === 'sys:openingStock' || !value) continue;
    // A debtor in credit or a bank overdraft stays where its group is; its sign shows it.
    if (GROUPS[account.group].nature === 'asset') add('assets', { group: account.group, account, amount: value });
    else add('liabilities', { group: account.group, account, amount: -value });
  }
  const closingStock = stockValueOn(stock.items, stock.movements, asOf, stock.baseCurrency);
  if (closingStock) add('assets', { group: 'stockInHand', account: accountFor('sys:openingStock', book)!, amount: closingStock });
  if (earlierProfit) add('liabilities', { group: 'reserves', account: accountFor('sys:retainedEarnings', book)!, amount: earlierProfit });

  const toSide = (m: Map<string, StatementLine[]>): BalanceSheetSide =>
    [...m.entries()].map(([heading, lines]) => ({ heading: heading as BalanceSheetSide[number]['heading'], lines: lines.sort((a, b) => b.amount - a.amount), total: lines.reduce((a, l) => a + l.amount, 0) }));
  const liabilities = toSide(sides.liabilities);
  const assets = toSide(sides.assets);
  const totalOf = (side: BalanceSheetSide) => side.reduce((a, s) => a + s.total, 0);
  return { asOf, liabilities, assets, currentProfit: thisYear, totalLiabilities: totalOf(liabilities) + thisYear, totalAssets: totalOf(assets) };
}

export type LedgerStatement = { opening: number; rows: (Posting & { balance: number })[]; closing: number };

/** One account's postings in a period, with its running balance (debit positive). */
export function ledgerStatement(postings: Posting[], account: string, range: { from: string; to: string }): LedgerStatement {
  const mine = postings.filter((p) => p.account === account);
  const opening = mine.filter((p) => p.date < range.from).reduce((a, p) => a + p.debit - p.credit, 0);
  let balance = opening;
  const rows = mine
    .filter((p) => p.date >= range.from && p.date <= range.to)
    .map((p) => {
      balance += p.debit - p.credit;
      return { ...p, balance };
    });
  return { opening, rows, closing: balance };
}

export type BalancePoint = { month: string; balance: number };

/**
 * An account's balance at the end of each month of a period (debit positive), for its trend.
 * A month still running ends at `range.to`. At most the last `months` months are given.
 */
export function monthEndBalances(postings: Posting[], account: string, range: { from: string; to: string }, months = 12): BalancePoint[] {
  const mine = postings.filter((p) => p.account === account && p.date <= range.to).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const end = range.to.slice(0, 7);
  let [y, m] = end.split('-').map(Number);
  const keys: string[] = [];
  for (let i = 0; i < months; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (`${key}-31` < range.from) break;
    keys.unshift(key);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  let balance = 0;
  let i = 0;
  return keys.map((month) => {
    while (i < mine.length && mine[i].date.slice(0, 7) <= month) {
      balance += mine[i].debit - mine[i].credit;
      i++;
    }
    return { month, balance };
  });
}

export type DayBookEntry = { source: Posting['source']; date: string; postings: Posting[] };

/** Every voucher in a period, each with its debits and credits. */
export function dayBook(postings: Posting[], range: { from: string; to: string }): DayBookEntry[] {
  const out = new Map<string, DayBookEntry>();
  for (const p of postings) {
    if (p.date < range.from || p.date > range.to) continue;
    const key = `${p.source.type}:${p.source.id}`;
    const e = out.get(key) ?? { source: p.source, date: p.date, postings: [] };
    e.postings.push(p);
    out.set(key, e);
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || a.source.number.localeCompare(b.source.number));
}

export type CostCentreRow = { costCentreId?: string; income: number; expense: number; profit: number; lines: StatementLine[] };

/**
 * Income and expense by cost centre for a period; what carries no centre is its own row. Stock is
 * not split by centre, so the rows add up to the P&L before the change in stock.
 */
export function costCentreProfit(postings: Posting[], book: Book, range: { from: string; to: string }): CostCentreRow[] {
  const byCentre = new Map<string, Posting[]>();
  for (const p of postings) {
    if (p.date < range.from || p.date > range.to) continue;
    const k = p.costCentreId ?? '';
    byCentre.set(k, [...(byCentre.get(k) ?? []), p]);
  }
  const rows: CostCentreRow[] = [];
  for (const [k, ps] of byCentre) {
    const lines: StatementLine[] = [];
    for (const [key, value] of netByAccount(ps)) {
      const account = accountFor(key, book);
      if (!account || !isNominal(account.group) || !value) continue;
      lines.push({ group: account.group, account, amount: isDebitNature(account.group) ? value : -value });
    }
    if (!lines.length) continue;
    const sum = (nature: 'income' | 'expense') => lines.filter((l) => GROUPS[l.group].nature === nature).reduce((a, l) => a + l.amount, 0);
    const income = sum('income');
    const expense = sum('expense');
    rows.push({ costCentreId: k || undefined, income, expense, profit: income - expense, lines: lines.sort((a, b) => b.amount - a.amount) });
  }
  // Tagged centres first, by profit; the untagged rest last.
  return rows.sort((a, b) => (a.costCentreId ? 0 : 1) - (b.costCentreId ? 0 : 1) || b.profit - a.profit);
}
