import { and, count, desc, eq, getTableColumns, gt, gte, inArray, isNull, lte, ne, notInArray, or, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { hasModule } from '@esmart/core/domain/plan';
import { isLowStock } from '@esmart/core/domain/stockLedger';
import { addDaysISO, financialYearOf } from '@esmart/core/lib/date';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { compact, money } from '../../lib/wire';
import { stockOnHand } from '../catalog/stock';
import { summariesToWire, type SummaryRow } from '../documents/wire';
import { toCoreItem } from '../inventory/ledger';
import { aging, buildReport } from '../reports/handlers';
import type { Scope } from '../reports/data';
import type { ReportKey } from '../reports/table';
import { paymentAccountBalances } from '../settings/handlers';

type Range = 'today' | 'week' | 'month' | 'quarter' | 'year';

/** The last day of `yyyy-mm`. */
const monthEnd = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;

/**
 * The period `range` names around `today`: the day, the week from Monday,
 * the calendar month or quarter, or the company's financial year.
 */
export function periodOf(range: Range, today: string, fiscalYearStartMonth: number): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  switch (range) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
      const from = addDaysISO(today, -dow);
      return { from, to: addDaysISO(from, 6) };
    }
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: monthEnd(y, m) };
    case 'quarter': {
      const q0 = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${y}-${String(q0).padStart(2, '0')}-01`, to: monthEnd(y, q0 + 2) };
    }
    case 'year': {
      const fy = financialYearOf(today, fiscalYearStartMonth);
      return { from: fy.start, to: fy.end };
    }
  }
}

/** The six months ending with `today`'s, oldest first, as `yyyy-mm`. */
function lastSixMonths(today: string): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const total = y * 12 + (m - 1) - (5 - i);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  });
}

/**
 * Dashboard: getDashboard. Every figure comes from the same code as the
 * report or screen it summarises: sales, purchases and expenses from core
 * reports (via the reports module), receivables and payables from the
 * ledger's aging, balances from core `accountBalances`, low stock from core
 * `isLowStock`. Figures for a module outside the plan are left out.
 */
export const dashboardHandlers = defineHandlers({
  async getSalesHub(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const today = ctx.now.toISOString().slice(0, 10);
    const month = periodOf('month', today, ctx.company.fiscalYearStartMonth);
    const branchId = ctx.query.branchId;
    const branchScope = branchId ? [branchId] : ctx.user.branchIds;
    const D = schema.documents;
    const P = schema.payments;
    const inBranches = (col: typeof D.branchId | typeof P.branchId) => (branchScope.length ? inArray(col, branchScope) : undefined);
    const mine = and(eq(D.companyId, ctx.company.id), inBranches(D.branchId));
    const billed = and(mine, eq(D.kind, 'invoice'), notInArray(D.status, ['draft', 'cancelled']));
    const inBase = sql<number>`coalesce(sum(round(${D.grandTotalMinor} * ${D.exchangeRate})), 0)::bigint`;

    const [[invoiced], [collected], kinds, [payments], [einvoices], top, recent, receivables] = await Promise.all([
      ctx.db.select({ v: inBase }).from(D).where(and(billed, gte(D.date, month.from), lte(D.date, month.to))),
      ctx.db
        .select({ v: sql<number>`coalesce(sum(round(${P.amountMinor} * ${P.exchangeRate})), 0)::bigint` })
        .from(P)
        .where(and(eq(P.companyId, ctx.company.id), eq(P.direction, 'received'), gte(P.date, month.from), lte(P.date, month.to), inBranches(P.branchId))),
      ctx.db.select({ kind: D.kind, n: count() }).from(D).where(and(mine, inArray(D.kind, ['invoice', 'quote', 'salesOrder', 'delivery', 'salesReturn', 'creditNote', 'debitNote']))).groupBy(D.kind),
      ctx.db.select({ n: count() }).from(P).where(and(eq(P.companyId, ctx.company.id), eq(P.direction, 'received'), inBranches(P.branchId))),
      ctx.db.select({ n: count() }).from(schema.eInvoices).innerJoin(D, eq(D.id, schema.eInvoices.documentId)).where(and(mine, eq(schema.eInvoices.status, 'generated'))),
      ctx.db
        .select({ partyId: D.partyId, name: schema.parties.name, v: inBase })
        .from(D)
        .innerJoin(schema.parties, eq(schema.parties.id, D.partyId))
        .where(billed)
        .groupBy(D.partyId, schema.parties.name)
        .orderBy(desc(inBase))
        .limit(5),
      ctx.db
        .select({ ...getTableColumns(D), partyName: schema.parties.name })
        .from(D)
        .innerJoin(schema.parties, eq(schema.parties.id, D.partyId))
        .where(and(mine, eq(D.kind, 'invoice'), ne(D.status, 'cancelled')))
        .orderBy(desc(D.date), desc(D.createdAt), desc(D.id))
        .limit(6) as Promise<SummaryRow[]>,
      aging(ctx, 'receivables', { asOf: today, branchId }),
    ]);
    const open = receivables.documents ?? [];
    const late = open.filter((d) => (d.daysOverdue ?? 0) > 0);
    return {
      invoicedThisMonth: money(Number(invoiced.v), base),
      collectedThisMonth: money(Number(collected.v), base),
      outstanding: { amount: receivables.total ?? money(0, base), count: open.length },
      // In base currency, as the buckets are: everything not yet due is the current bucket.
      overdue: { amount: money((receivables.total?.minor ?? 0) - (receivables.buckets?.find((b) => b.key === 'current')?.amount?.minor ?? 0), base), count: late.length },
      counts: Object.fromEntries(kinds.map((k) => [k.kind, Number(k.n)])),
      paymentsReceived: Number(payments.n),
      eInvoicesGenerated: Number(einvoices.n),
      topCustomers: top.map((r) => ({ partyId: r.partyId, name: r.name, total: money(Number(r.v), base) })),
      recentInvoices: await summariesToWire(ctx.db, recent, ctx.now),
    };
  },

  async getDashboard(ctx) {
    const plan = ctx.company.plan;
    const base = ctx.company.baseCurrency.trim();
    const today = ctx.now.toISOString().slice(0, 10);
    const branchId = ctx.query.branchId;
    const period = periodOf(ctx.query.range ?? 'month', today, ctx.company.fiscalYearStartMonth);
    const scope = (from: string, to: string): Scope => ({ db: ctx.db, company: ctx.company, user: ctx.user, now: ctx.now, from, to });
    const total = async (key: ReportKey) => ((await buildReport(scope(period.from, period.to), key, { branchId })) as { total: Schema<'Money'> }).total;

    const months = lastSixMonths(today);
    const [ty, tm] = today.split('-').map(Number);
    const trend = (await buildReport(scope(`${months[0]}-01`, monthEnd(ty, tm)), 'sales-summary', { branchId })) as Schema<'TransactionSummary'>;
    const byMonth = new Map((trend.byMonth ?? []).map((v) => [v.key, v.value]));

    const receivables = await aging(ctx, 'receivables', { asOf: today, branchId });
    const current = receivables.buckets?.find((b) => b.key === 'current')?.amount?.minor ?? 0;

    const accounts = await ctx.db.select().from(schema.paymentAccounts).where(eq(schema.paymentAccounts.companyId, ctx.company.id));
    const balances = await paymentAccountBalances(ctx.db, ctx.company.id, accounts);

    const D = schema.documents;
    const branchScope = branchId ? [branchId] : ctx.user.branchIds;
    const inBranches = branchScope.length ? inArray(D.branchId, branchScope) : undefined;

    let lowStockCount: number | undefined;
    if (hasModule(plan, 'inventory')) {
      const I = schema.items;
      const items = await ctx.db.select().from(I).where(and(eq(I.companyId, ctx.company.id), eq(I.trackInventory, true), eq(I.status, 'active'), gt(I.reorderLevel, '0')));
      const onHand = await stockOnHand(ctx.db, ctx.company.id, items.map((i) => i.id), branchId);
      lowStockCount = items.filter((i) => isLowStock(toCoreItem(i), onHand.get(i.id) ?? 0)).length;
    }

    // Invoices still waiting on (or refused) an IRN, plus live e-way bills that run out within a day.
    const E = schema.eInvoices;
    const [{ n: awaitingIrn }] = await ctx.db
      .select({ n: count() })
      .from(E)
      .innerJoin(D, eq(D.id, E.documentId))
      .where(and(eq(E.companyId, ctx.company.id), inArray(E.status, ['pending', 'failed']), notInArray(D.status, ['draft', 'cancelled']), inBranches));
    const W = schema.ewayBills;
    const soon = new Date(ctx.now.getTime() + 24 * 3600 * 1000);
    const [{ n: expiring }] = await ctx.db
      .select({ n: count() })
      .from(W)
      .where(and(eq(W.companyId, ctx.company.id), eq(W.status, 'active'), gt(W.validUpto, ctx.now), lte(W.validUpto, soon), branchScope.length ? inArray(W.branchId, branchScope) : undefined));

    const recent = (await ctx.db
      .select({ ...getTableColumns(D), partyName: schema.parties.name })
      .from(D)
      .innerJoin(schema.parties, eq(schema.parties.id, D.partyId))
      .where(and(eq(D.companyId, ctx.company.id), eq(D.kind, 'invoice'), ne(D.status, 'cancelled'), inBranches))
      .orderBy(desc(D.date), desc(D.createdAt), desc(D.id))
      .limit(5)) as SummaryRow[];

    const N = schema.notifications;
    const [{ n: unread }] = await ctx.db
      .select({ n: count() })
      .from(N)
      .where(and(eq(N.companyId, ctx.company.id), or(isNull(N.userId), eq(N.userId, ctx.user.id)), isNull(N.clearedAt), isNull(N.readAt)));

    const dashboard: Schema<'Dashboard'> = {
      sales: await total('sales-summary'),
      purchases: hasModule(plan, 'purchases') ? await total('purchase-summary') : undefined,
      expenses: hasModule(plan, 'expenses') ? await total('expense-summary') : undefined,
      receivable: receivables.total,
      overdueReceivable: money((receivables.total?.minor ?? 0) - current, base),
      payable: hasModule(plan, 'payables') ? (await aging(ctx, 'payables', { asOf: today, branchId })).total : undefined,
      cashBalance: money(
        Object.values(balances).reduce((s, v) => s + v, 0),
        base,
      ),
      salesTrend: months.map((key) => ({ key, value: byMonth.get(key) ?? money(0, base) })),
      lowStockCount,
      pendingCompliance: Number(awaitingIrn) + Number(expiring),
      recentDocuments: await summariesToWire(ctx.db, recent, ctx.now),
      unreadNotifications: Number(unread),
    };
    return compact(dashboard);
  },
});

