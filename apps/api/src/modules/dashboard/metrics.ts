import { and, count, desc, eq, gte, inArray, lte, notInArray, sql, type SQL } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { bucketOf, voucherCashFlows, type Bucket, type CashFlow, type Period } from '@esmart/core/domain/dashboard';
import { profitSnapshot, type ProfitSnapshot } from '@esmart/core/domain/reports';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow } from '../../context';
import type { DbOrTx } from '../../lib/audit';
import { money } from '../../lib/wire';
import { effectiveStatusSql } from '../documents/lifecycle';
import { loadDocuments, loadExpenses, loadItems } from '../reports/data';
import { paymentAccountBalances } from '../settings/handlers';

/**
 * The dashboard's one metrics layer. Every hub takes its sales, collections, expenses, profit, cash
 * and trends from here, so the same figure reads the same on every tab, and profit is the profit
 * report's own (core `profitSnapshot` over the same documents). Amounts are base-currency paise.
 */

export type MetricsCtx = { db: DbOrTx; company: CompanyRow; user: AuthUser; now: Date };

const D = schema.documents;
const P = schema.payments;
const X = schema.expenses;
const V = schema.vouchers;

type BranchCol = typeof D.branchId | typeof P.branchId | typeof X.branchId | typeof V.branchId;
/** Rows in the hub's branches; none means every branch. */
export const inBranches = (col: BranchCol, branches: string[]): SQL | undefined => (branches.length ? inArray(col, branches) : undefined);
const within = (col: typeof D.date | typeof P.date | typeof X.date, p: Period) => and(gte(col, p.from), lte(col, p.to));

const docsInBase = sql<number>`coalesce(sum(round(${D.grandTotalMinor} * ${D.exchangeRate})), 0)::bigint`;
const paidInBase = sql<number>`coalesce(sum(round(${P.amountMinor} * ${P.exchangeRate})), 0)::bigint`;
const spentInBase = sql<number>`coalesce(sum(round(${X.amountMinor} * ${X.exchangeRate})), 0)::bigint`;

/** Invoices that count: issued, not drafts or cancelled. */
const liveInvoices = (c: MetricsCtx, branches: string[]) => and(eq(D.companyId, c.company.id), eq(D.kind, 'invoice'), notInArray(D.status, ['draft', 'cancelled']), inBranches(D.branchId, branches));

/** What was invoiced in the period (grand totals, as the sales summary has them) and how many invoices. */
export async function sales(c: MetricsCtx, branches: string[], p: Period): Promise<{ minor: number; count: number }> {
  const [r] = await c.db.select({ v: docsInBase, n: count() }).from(D).where(and(liveInvoices(c, branches), within(D.date, p)));
  return { minor: Number(r.v), count: Number(r.n) };
}

/** What customers paid in the period. */
export async function collected(c: MetricsCtx, branches: string[], p: Period): Promise<number> {
  const [r] = await c.db
    .select({ v: paidInBase })
    .from(P)
    .where(and(eq(P.companyId, c.company.id), eq(P.direction, 'received'), within(P.date, p), inBranches(P.branchId, branches)));
  return Number(r.v);
}

/** What was spent in the period, and in how many entries. */
export async function expenses(c: MetricsCtx, branches: string[], p: Period): Promise<{ minor: number; count: number }> {
  const [r] = await c.db.select({ v: spentInBase, n: count() }).from(X).where(and(eq(X.companyId, c.company.id), within(X.date, p), inBranches(X.branchId, branches)));
  return { minor: Number(r.v), count: Number(r.n) };
}

/** Bills received in the period (grand totals). */
export async function billed(c: MetricsCtx, branches: string[], p: Period): Promise<number> {
  const [r] = await c.db
    .select({ v: docsInBase })
    .from(D)
    .where(and(eq(D.companyId, c.company.id), eq(D.kind, 'purchaseBill'), notInArray(D.status, ['draft', 'cancelled']), within(D.date, p), inBranches(D.branchId, branches)));
  return Number(r.v);
}

/** Invoiced per bucket, in the buckets' order. */
export async function salesTrend(c: MetricsCtx, branches: string[], buckets: Bucket[]): Promise<number[]> {
  if (!buckets.length) return [];
  const rows = await c.db
    .select({ date: D.date, v: docsInBase })
    .from(D)
    .where(and(liveInvoices(c, branches), gte(D.date, buckets[0].from), lte(D.date, buckets[buckets.length - 1].to)))
    .groupBy(D.date);
  return perBucket(buckets, rows.map((r) => ({ date: String(r.date), minor: Number(r.v) })));
}

/** Spent per bucket, in the buckets' order. */
export async function expenseTrend(c: MetricsCtx, branches: string[], buckets: Bucket[]): Promise<number[]> {
  if (!buckets.length) return [];
  const rows = await c.db
    .select({ date: X.date, v: spentInBase })
    .from(X)
    .where(and(eq(X.companyId, c.company.id), inBranches(X.branchId, branches), gte(X.date, buckets[0].from), lte(X.date, buckets[buckets.length - 1].to)))
    .groupBy(X.date);
  return perBucket(buckets, rows.map((r) => ({ date: String(r.date), minor: Number(r.v) })));
}

function perBucket(buckets: Bucket[], rows: { date: string; minor: number }[]): number[] {
  const out = buckets.map(() => 0);
  for (const r of rows) {
    const b = bucketOf(buckets, r.date);
    if (b) out[buckets.indexOf(b)] += r.minor;
  }
  return out;
}

/* ------------------------------------------------------------------ profit */

/**
 * Profit as the profit report works it out, for any number of periods ending on or before `upTo`.
 * Loads what the report loads (the whole book up to `upTo`, so average cost has its history) once,
 * and gives each period the documents the report would have had for it.
 */
export async function profitLoader(c: MetricsCtx, branchId: string | undefined, upTo: string) {
  const all = { ...c, from: '1900-01-01', to: upTo };
  const [{ docs }, { expenses: spent }, items] = await Promise.all([
    loadDocuments(all, ['invoice', 'debitNote', 'salesReturn', 'creditNote', 'purchaseBill']),
    loadExpenses(all),
    loadItems(all),
  ]);
  const base = c.company.baseCurrency.trim();
  return (p: Period): ProfitSnapshot => {
    const asOf = (d: { date: string }) => d.date <= p.to;
    return profitSnapshot(docs.filter(asOf), spent.filter(asOf), items, base, { range: p, branchId: branchId ?? null, partyId: null, currency: null });
  };
}

export const profitWire = (s: ProfitSnapshot): Schema<'ProfitFigures'> => ({
  revenue: s.revenue,
  costOfGoods: s.costOfGoods,
  grossProfit: s.grossProfit,
  expenses: s.expenses,
  netProfit: s.netProfit,
  margin: Math.round(s.margin * 10) / 10,
});

/* ------------------------------------------------------------------ cash */

/** The company's cash and bank accounts and what each holds now (core `accountBalances`). */
export async function cashAccounts(c: MetricsCtx): Promise<{ opening: number; accounts: { id: string; name: string; type: string; balance: number }[] }> {
  const rows = await c.db.select().from(schema.paymentAccounts).where(eq(schema.paymentAccounts.companyId, c.company.id)).orderBy(schema.paymentAccounts.name);
  const balances = await paymentAccountBalances(c.db, c.company.id, rows);
  return {
    opening: rows.reduce((s, a) => s + Math.round(a.openingBalanceMinor * Number(a.openingRate)), 0),
    accounts: rows.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: balances[a.id] ?? 0 })),
  };
}

/**
 * Every movement of cash and bank up to `upTo`, by date and kind: what customers paid, what was paid
 * out, expenses, and vouchers that touch a payment account (core `voucherCashFlows` leaves out
 * transfers between the business's own accounts). Each row is rounded to base paise as the
 * balances are, so flows and balances agree.
 */
export async function cashFlows(c: MetricsCtx, branches: string[], upTo: string): Promise<CashFlow[]> {
  const [pays, spent, vouchers] = await Promise.all([
    c.db
      .select({ date: P.date, direction: P.direction, v: paidInBase })
      .from(P)
      .where(and(eq(P.companyId, c.company.id), lte(P.date, upTo), inBranches(P.branchId, branches)))
      .groupBy(P.date, P.direction),
    c.db
      .select({ date: X.date, v: spentInBase })
      .from(X)
      .where(and(eq(X.companyId, c.company.id), lte(X.date, upTo), inBranches(X.branchId, branches)))
      .groupBy(X.date),
    c.db
      .select({ date: V.date, kind: V.kind, lines: V.lines })
      .from(V)
      .where(and(eq(V.companyId, c.company.id), lte(V.date, upTo), inBranches(V.branchId, branches), sql`exists (select 1 from jsonb_array_elements(${V.lines}) l where l->>'account' like 'pay:%')`)),
  ]);
  const flows: CashFlow[] = [];
  for (const r of pays) flows.push({ date: String(r.date), category: r.direction === 'received' ? 'receipts' : 'payments', minor: (r.direction === 'received' ? 1 : -1) * Number(r.v) });
  for (const r of spent) flows.push({ date: String(r.date), category: 'expenses', minor: -Number(r.v) });
  for (const v of vouchers) {
    const lines = (v.lines as { account: string; debitMinor?: number; creditMinor?: number }[]).map((l) => ({ account: l.account, debitMinor: Number(l.debitMinor ?? 0), creditMinor: Number(l.creditMinor ?? 0) }));
    flows.push(...voucherCashFlows({ date: String(v.date), kind: v.kind, lines }));
  }
  return flows;
}

/* ------------------------------------------------------------------ invoices */

/** The period's invoices by the status they're in on `asOf` (overdue worked out, as the lists do). */
export async function invoiceStatus(c: MetricsCtx, branches: string[], p: Period, asOf: string): Promise<Schema<'StatusCount'>[]> {
  const base = c.company.baseCurrency.trim();
  const status = effectiveStatusSql(asOf);
  const rows = await c.db
    .select({ status: sql<Schema<'DocStatus'>>`${status}`, n: sql<number>`count(*)::int`, v: docsInBase })
    .from(D)
    .where(and(liveInvoices(c, branches), within(D.date, p)))
    .groupBy(sql`1`);
  // Paid first, overdue last, as the bar reads left to right; anything else after.
  const ORDER = ['paid', 'partiallyPaid', 'issued', 'overdue'];
  const rank = (s: string) => (ORDER.includes(s) ? ORDER.indexOf(s) : ORDER.length);
  return rows
    .map((r) => ({ status: r.status, count: Number(r.n), total: money(Number(r.v), base) }))
    .sort((a, b) => rank(a.status) - rank(b.status) || a.status.localeCompare(b.status));
}

/* ------------------------------------------------------------------ money movement */

/** The period's latest receipts, payments and expenses, newest first. */
export async function moneyMovement(c: MetricsCtx, branches: string[], p: Period, limit = 10): Promise<Schema<'MoneyMovement'>[]> {
  const base = c.company.baseCurrency.trim();
  const A = schema.paymentAccounts;
  const [pays, spent] = await Promise.all([
    c.db
      .select({ id: P.id, direction: P.direction, date: P.date, v: sql<number>`round(${P.amountMinor} * ${P.exchangeRate})::bigint`, party: schema.parties.name, account: A.name, createdAt: P.createdAt })
      .from(P)
      .leftJoin(schema.parties, eq(schema.parties.id, P.partyId))
      .leftJoin(A, eq(A.id, P.accountId))
      .where(and(eq(P.companyId, c.company.id), within(P.date, p), inBranches(P.branchId, branches)))
      .orderBy(desc(P.date), desc(P.createdAt))
      .limit(limit),
    c.db
      .select({ id: X.id, date: X.date, v: sql<number>`round(${X.amountMinor} * ${X.exchangeRate})::bigint`, category: schema.expenseCategories.name, account: A.name, createdAt: X.createdAt })
      .from(X)
      .leftJoin(schema.expenseCategories, eq(schema.expenseCategories.id, X.categoryId))
      .leftJoin(A, eq(A.id, X.accountId))
      .where(and(eq(X.companyId, c.company.id), within(X.date, p), inBranches(X.branchId, branches)))
      .orderBy(desc(X.date), desc(X.createdAt))
      .limit(limit),
  ]);
  const rows = [
    ...pays.map((r) => ({ id: r.id, kind: r.direction as 'received' | 'paid', date: String(r.date), amount: money(Number(r.v), base), label: r.party ?? '', accountName: r.account ?? undefined, at: r.createdAt })),
    ...spent.map((r) => ({ id: r.id, kind: 'expense' as const, date: String(r.date), amount: money(Number(r.v), base), label: r.category ?? '', accountName: r.account ?? undefined, at: r.createdAt })),
  ];
  return rows
    .sort((a, b) => b.date.localeCompare(a.date) || b.at.getTime() - a.at.getTime())
    .slice(0, limit)
    .map(({ at: _at, accountName, ...r }) => ({ ...r, ...(accountName ? { accountName } : {}) }));
}
