import { and, asc, count, desc, eq, getTableColumns, gt, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { addDaysISO, businessDate, financialYearOf } from '@esmart/core/lib/date';
import { cashMovement, cashSeries, deadStock, filingCalendar, type Period } from '@esmart/core/domain/dashboard';
import { balanceSheet, trialBalance } from '@esmart/core/domain/ledger/reports';
import { hasModule } from '@esmart/core/domain/plan';
import { summarizeStock, summarizeTax } from '@esmart/core/domain/reports';
import { isLowStock } from '@esmart/core/domain/stockLedger';
import { tdsPayableSummary } from '@esmart/core/domain/tdsReports';
import { schema } from '@esmart/db';
import { defineHandlers, type AuthUser, type CompanyRow, type ResponseBody } from '../../context';
import { compact, money } from '../../lib/wire';
import { loadBook } from '../books/book';
import { stockOnHand } from '../catalog/stock';
import { companyCore } from '../documents/engine';
import { summariesToWire, type SummaryRow } from '../documents/wire';
import { companyGstins } from '../gst/portal';
import { reconciliation } from '../gst/gstr2b';
import { coreMovements, toCoreItem } from '../inventory/ledger';
import { aging, buildReport } from '../reports/handlers';
import { loadDocuments, loadExpenses, loadItems, type Scope } from '../reports/data';
import type { ReportKey } from '../reports/table';
import * as metrics from './metrics';
import { branchScope, hubScope, periodOf, type HubScope } from './period';

export { periodOf };

/** Six months ending with `today`'s, oldest first, as `yyyy-mm` (the `getDashboard` trend). */
function lastSixMonths(today: string): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const total = y * 12 + (m - 1) - (5 - i);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  });
}

type HomeHub = ResponseBody<'getHomeHub'>;
type AccountsHub = ResponseBody<'getAccountsHub'>;
type ComplianceHub = ResponseBody<'getComplianceHub'>;

/** The company's role for the user, where it differs from their own. */
const roleIn = (user: AuthUser, company: CompanyRow) => user.companyRoles?.[company.id] ?? user.role;

/** Tracked, active items with a reorder level that are at or under it. */
async function lowStock(ctx: { db: metrics.MetricsCtx['db']; company: CompanyRow }, branchId?: string): Promise<number> {
  const I = schema.items;
  const items = await ctx.db.select().from(I).where(and(eq(I.companyId, ctx.company.id), eq(I.trackInventory, true), eq(I.status, 'active'), gt(I.reorderLevel, '0')));
  const onHand = await stockOnHand(ctx.db, ctx.company.id, items.map((i) => i.id), branchId);
  return items.filter((i) => isLowStock(toCoreItem(i), onHand.get(i.id) ?? 0)).length;
}

/** The trend's buckets as MonthValue rows. */
const series = (s: HubScope, values: number[], base: string) => s.buckets.map((b, i) => ({ key: b.key, value: money(values[i] ?? 0, base) }));

/** `fn` over the previous period, when the hub is comparing. */
const ifPrevious = <T>(s: HubScope, fn: (p: Period) => Promise<T>): Promise<T | undefined> => (s.previous ? fn(s.previous) : Promise.resolve(undefined));

/**
 * Dashboard hubs. Every figure comes from the dashboard's metrics layer, which reads the same code
 * as the report or screen it summarises: sales, collections and expenses from the documents,
 * payments and expenses tables as the summaries add them up, profit from core `profitSnapshot`
 * (the profit report), receivables and payables from the ledger's aging, balances from core
 * `accountBalances`, low stock from core `isLowStock`. Figures for a module outside the plan are
 * left out. Each hub covers the period its query names (this month by default, in India time) and
 * the branch asked for, which must be one the user works in.
 */
export const dashboardHandlers = defineHandlers({
  async getHomeHub(ctx) {
    const plan = ctx.company.plan;
    const base = ctx.company.baseCurrency.trim();
    const s = hubScope(ctx);
    const { today, period, branchId, branches } = s;
    const D = schema.documents;
    const P = schema.payments;
    const X = schema.expenses;
    const mine = and(eq(D.companyId, ctx.company.id), metrics.inBranches(D.branchId, branches));
    const invoices = and(mine, eq(D.kind, 'invoice'));
    const withExpenses = hasModule(plan, 'expenses');
    const lastBucket = s.buckets[s.buckets.length - 1]?.to ?? period.to;

    const [sales, prevSales, collected, prevCollected, spent, prevSpent, trend, flows, status, movement, cash, kinds, [anyPayment], [anyExpense], recent, receivables, payables] = await Promise.all([
      metrics.sales(ctx, branches, period),
      ifPrevious(s, (p) => metrics.sales(ctx, branches, p)),
      metrics.collected(ctx, branches, period),
      ifPrevious(s, (p) => metrics.collected(ctx, branches, p)),
      withExpenses ? metrics.expenses(ctx, branches, period) : undefined,
      withExpenses ? ifPrevious(s, (p) => metrics.expenses(ctx, branches, p)) : undefined,
      metrics.salesTrend(ctx, branches, s.buckets),
      metrics.cashFlows(ctx, branches, lastBucket),
      metrics.invoiceStatus(ctx, branches, period, today),
      metrics.moneyMovement(ctx, branches, period),
      metrics.cashAccounts(ctx),
      ctx.db
        .select({ kind: D.kind, status: D.status, n: count() })
        .from(D)
        .where(and(mine, or(eq(D.kind, 'invoice'), and(eq(D.kind, 'quote'), eq(D.status, 'sent')))))
        .groupBy(D.kind, D.status),
      ctx.db.select({ n: count() }).from(P).where(and(eq(P.companyId, ctx.company.id), metrics.inBranches(P.branchId, branches))).limit(1),
      ctx.db.select({ n: count() }).from(X).where(and(eq(X.companyId, ctx.company.id), metrics.inBranches(X.branchId, branches))).limit(1),
      ctx.db
        .select({ ...getTableColumns(D), partyName: schema.parties.name })
        .from(D)
        .innerJoin(schema.parties, eq(schema.parties.id, D.partyId))
        .where(and(invoices, ne(D.status, 'cancelled')))
        .orderBy(desc(D.date), desc(D.createdAt), desc(D.id))
        .limit(5) as Promise<SummaryRow[]>,
      aging(ctx, 'receivables', { asOf: today, branchId }),
      hasModule(plan, 'payables') ? aging(ctx, 'payables', { asOf: today, branchId }) : null,
    ]);

    // Profit is the profit report's, which the plan opens with expenses.
    const profitOf = withExpenses ? await metrics.profitLoader(ctx, branchId, period.to) : null;
    const profit = profitOf?.(period);
    const prevProfit = profitOf && s.previous ? profitOf(s.previous) : undefined;

    let lowStockCount: number | undefined;
    let inventory: HomeHub['inventory'] | undefined;
    if (hasModule(plan, 'inventory')) {
      lowStockCount = await lowStock(ctx, branchId);
      const [items, movements] = await Promise.all([loadItems(ctx), coreMovements(ctx.db, ctx.company.id, { branchIds: branches, to: today })]);
      const stock = summarizeStock(items, movements, base, branchId ?? null, ctx.company.stockCosting as 'average' | 'fifo');
      const dead = deadStock(items.filter((i) => i.status !== 'inactive'), movements, today, 90, branchId);
      const valueOf = new Map(stock.rows.map((r) => [r.item.id, r.value.minor]));
      inventory = {
        value: stock.totalValue,
        tracked: stock.trackedCount,
        low: stock.lowCount,
        out: stock.outCount,
        dead: dead.length,
        deadValue: money(dead.reduce((a, r) => a + (valueOf.get(r.item.id) ?? 0), 0), base),
      };
    }

    const invoicesInAnyStatus = kinds.filter((k) => k.kind === 'invoice').reduce((a, k) => a + Number(k.n), 0);
    const open = receivables.documents ?? [];
    const late = open.filter((d) => (d.daysOverdue ?? 0) > 0);
    const zero = money(0, base);
    return compact({
      period: s.wire,
      salesThisMonth: money(sales.minor, base),
      invoicesThisMonth: sales.count,
      collectedThisMonth: money(collected, base),
      expensesThisMonth: spent ? money(spent.minor, base) : undefined,
      expenseEntriesThisMonth: spent?.count,
      profit: profit?.netProfit,
      previous:
        prevSales && prevCollected !== undefined
          ? compact({ sales: money(prevSales.minor, base), invoices: prevSales.count, collected: money(prevCollected, base), expenses: prevSpent ? money(prevSpent.minor, base) : undefined, profit: prevProfit?.netProfit })
          : undefined,
      salesTrend: series(s, trend, base),
      cashFlow: cashSeries(s.buckets, flows).map((r) => ({ key: r.key, inflow: money(r.inflow, base), outflow: money(r.outflow, base) })),
      invoiceStatus: status,
      cash: {
        total: money(cash.accounts.reduce((a, r) => a + r.balance, 0), base),
        accounts: cash.accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: money(a.balance, base) })),
      },
      inventory,
      moneyMovement: movement,
      receivable: {
        total: receivables.total ?? zero,
        overdue: receivables.overdue ?? zero,
        dueSoon: receivables.dueSoon ?? zero,
        overdueCount: late.length,
        buckets: (receivables.buckets ?? []).map((b) => ({ key: b.key!, amount: b.amount ?? zero, count: b.count ?? 0 })),
      },
      overdueInvoices: late.slice(0, 4).map((d) => ({ document: d.document!, daysOverdue: d.daysOverdue! })),
      payable: payables ? { total: payables.total ?? zero, overdue: payables.overdue ?? zero, count: (payables.documents ?? []).length } : undefined,
      lowStockCount,
      draftInvoices: Number(kinds.find((k) => k.kind === 'invoice' && k.status === 'draft')?.n ?? 0),
      openQuotes: Number(kinds.find((k) => k.kind === 'quote')?.n ?? 0),
      recentInvoices: await summariesToWire(ctx.db, recent, ctx.now),
      firstRun: invoicesInAnyStatus === 0 && Number(anyPayment.n) === 0 && Number(anyExpense.n) === 0,
    });
  },

  async getPurchasesHub(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const s = hubScope(ctx);
    const { today, period, branchId, branches } = s;
    const D = schema.documents;
    const P = schema.payments;
    const X = schema.expenses;
    const C = schema.expenseCategories;
    const mine = and(eq(D.companyId, ctx.company.id), metrics.inBranches(D.branchId, branches));
    const ownExpenses = and(eq(X.companyId, ctx.company.id), metrics.inBranches(X.branchId, branches));
    const inPeriod = and(ownExpenses, gte(X.date, period.from), lte(X.date, period.to));
    const spentInBase = sql<number>`coalesce(sum(round(${X.amountMinor} * ${X.exchangeRate})), 0)::bigint`;
    const taxInBase = sql<number>`coalesce(sum(round(${X.taxAmountMinor} * ${X.exchangeRate})), 0)::bigint`;
    const withExpenses = hasModule(ctx.company.plan, 'expenses');

    const [billedNow, billedBefore, kinds, [payments], recent, payables, expenseFigures] = await Promise.all([
      metrics.billed(ctx, branches, period),
      ifPrevious(s, (p) => metrics.billed(ctx, branches, p)),
      ctx.db
        .select({ kind: D.kind, n: count() })
        .from(D)
        .where(and(mine, inArray(D.kind, ['purchaseBill', 'purchaseOrder', 'goodsReceipt', 'purchaseReturn', 'supplierCreditNote', 'supplierDebitNote'])))
        .groupBy(D.kind),
      ctx.db.select({ n: count() }).from(P).where(and(eq(P.companyId, ctx.company.id), eq(P.direction, 'paid'), metrics.inBranches(P.branchId, branches))),
      ctx.db
        .select({ ...getTableColumns(D), partyName: schema.parties.name })
        .from(D)
        .innerJoin(schema.parties, eq(schema.parties.id, D.partyId))
        .where(and(mine, eq(D.kind, 'purchaseBill'), ne(D.status, 'cancelled')))
        .orderBy(desc(D.date), desc(D.createdAt), desc(D.id))
        .limit(6) as Promise<SummaryRow[]>,
      aging(ctx, 'payables', { asOf: today, branchId }),
      withExpenses
        ? Promise.all([
            metrics.expenses(ctx, branches, period),
            ifPrevious(s, (p) => metrics.expenses(ctx, branches, p)),
            ctx.db.select({ n: count() }).from(X).where(ownExpenses),
            ctx.db
              .select({ categoryId: X.categoryId, name: C.name, v: spentInBase })
              .from(X)
              .innerJoin(C, eq(C.id, X.categoryId))
              .where(inPeriod)
              .groupBy(X.categoryId, C.name)
              .orderBy(desc(spentInBase)),
            ctx.db
              .select({
                tax: taxInBase,
                itc: sql<number>`coalesce(sum(case when ${X.itcEligibility} = 'eligible' then round(${X.taxAmountMinor} * ${X.exchangeRate}) else 0 end), 0)::bigint`,
                billable: sql<number>`coalesce(sum(case when ${X.billable} then round(${X.amountMinor} * ${X.exchangeRate}) else 0 end), 0)::bigint`,
              })
              .from(X)
              .where(inPeriod),
            metrics.expenseTrend(ctx, branches, s.buckets),
            ctx.db
              .select({ partyId: X.supplierId, name: schema.parties.name, v: spentInBase })
              .from(X)
              .innerJoin(schema.parties, eq(schema.parties.id, X.supplierId))
              .where(and(inPeriod, isNotNull(X.supplierId)))
              .groupBy(X.supplierId, schema.parties.name)
              .orderBy(desc(spentInBase))
              .limit(5),
            ctx.db
              .select({ id: X.id, nextDate: X.nextRecurrenceDate, minor: sql<number>`round(${X.amountMinor} * ${X.exchangeRate})::bigint`, category: C.name, notes: X.notes, recurrence: X.recurrence })
              .from(X)
              .innerJoin(C, eq(C.id, X.categoryId))
              .where(and(ownExpenses, ne(X.recurrence, 'none'), gte(X.nextRecurrenceDate, today), lte(X.nextRecurrenceDate, addDaysISO(today, 30))))
              .orderBy(asc(X.nextRecurrenceDate))
              .limit(5),
          ])
        : null,
    ]);
    const open = payables.documents ?? [];
    const late = open.filter((d) => (d.daysOverdue ?? 0) > 0);
    let expenseBlock: Partial<ResponseBody<'getPurchasesHub'>> = {};
    let spentBefore: { minor: number } | undefined;
    if (expenseFigures) {
      const [spent, before, [expCount], byCategory, [split], trend, suppliers, upcoming] = expenseFigures;
      spentBefore = before;
      expenseBlock = {
        expensesThisMonth: money(spent.minor, base),
        expenses: Number(expCount.n),
        expensesByCategory: byCategory.map((c) => ({ categoryId: c.categoryId, name: c.name, total: money(Number(c.v), base) })),
        expenseInsights: {
          count: spent.count,
          tax: money(Number(split.tax), base),
          itcEligibleTax: money(Number(split.itc), base),
          billable: money(Number(split.billable), base),
          trend: series(s, trend, base),
          topSuppliers: suppliers.map((r) => ({ partyId: r.partyId!, name: r.name, total: money(Number(r.v), base) })),
          upcomingRecurring: upcoming.map((r) =>
            compact({ id: r.id, nextDate: String(r.nextDate), amount: money(Number(r.minor), base), category: r.category, description: r.notes ?? undefined, recurrence: r.recurrence as 'weekly' | 'monthly' | 'quarterly' | 'yearly' }),
          ),
        },
      };
    }
    return compact({
      period: s.wire,
      billedThisMonth: money(billedNow, base),
      previous: billedBefore !== undefined ? compact({ billed: money(billedBefore, base), expenses: spentBefore ? money(spentBefore.minor, base) : undefined }) : undefined,
      payable: { amount: payables.total ?? money(0, base), count: open.length },
      // In base currency, as the buckets are: everything not yet due is the current bucket.
      overdue: { amount: money((payables.total?.minor ?? 0) - (payables.buckets?.find((b) => b.key === 'current')?.amount?.minor ?? 0), base), count: late.length },
      counts: Object.fromEntries(kinds.map((k) => [k.kind, Number(k.n)])),
      paymentsMade: Number(payments.n),
      recentBills: await summariesToWire(ctx.db, recent, ctx.now),
      ...expenseBlock,
    });
  },

  async getSalesHub(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const s = hubScope(ctx);
    const { today, period, branchId, branches } = s;
    const D = schema.documents;
    const P = schema.payments;
    const mine = and(eq(D.companyId, ctx.company.id), metrics.inBranches(D.branchId, branches));
    const billed = and(mine, eq(D.kind, 'invoice'), notInArray(D.status, ['draft', 'cancelled']));
    const inBase = sql<number>`coalesce(sum(round(${D.grandTotalMinor} * ${D.exchangeRate})), 0)::bigint`;

    const [invoiced, invoicedBefore, collected, collectedBefore, trend, kinds, [payments], [einvoices], top, recent, receivables] = await Promise.all([
      metrics.sales(ctx, branches, period),
      ifPrevious(s, (p) => metrics.sales(ctx, branches, p)),
      metrics.collected(ctx, branches, period),
      ifPrevious(s, (p) => metrics.collected(ctx, branches, p)),
      metrics.salesTrend(ctx, branches, s.buckets),
      ctx.db.select({ kind: D.kind, n: count() }).from(D).where(and(mine, inArray(D.kind, ['invoice', 'quote', 'salesOrder', 'delivery', 'salesReturn', 'creditNote', 'debitNote']))).groupBy(D.kind),
      ctx.db.select({ n: count() }).from(P).where(and(eq(P.companyId, ctx.company.id), eq(P.direction, 'received'), metrics.inBranches(P.branchId, branches))),
      ctx.db.select({ n: count() }).from(schema.eInvoices).innerJoin(D, eq(D.id, schema.eInvoices.documentId)).where(and(mine, eq(schema.eInvoices.status, 'generated'))),
      ctx.db
        .select({ partyId: D.partyId, name: schema.parties.name, v: inBase })
        .from(D)
        .innerJoin(schema.parties, eq(schema.parties.id, D.partyId))
        .where(and(billed, gte(D.date, period.from), lte(D.date, period.to)))
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
    return compact({
      period: s.wire,
      invoicedThisMonth: money(invoiced.minor, base),
      invoicesThisMonth: invoiced.count,
      collectedThisMonth: money(collected, base),
      previous: invoicedBefore && collectedBefore !== undefined ? { invoiced: money(invoicedBefore.minor, base), invoices: invoicedBefore.count, collected: money(collectedBefore, base) } : undefined,
      salesTrend: series(s, trend, base),
      outstanding: { amount: receivables.total ?? money(0, base), count: open.length },
      // In base currency, as the buckets are: everything not yet due is the current bucket.
      overdue: { amount: money((receivables.total?.minor ?? 0) - (receivables.buckets?.find((b) => b.key === 'current')?.amount?.minor ?? 0), base), count: late.length },
      counts: Object.fromEntries(kinds.map((k) => [k.kind, Number(k.n)])),
      paymentsReceived: Number(payments.n),
      eInvoicesGenerated: Number(einvoices.n),
      topCustomers: top.map((r) => ({ partyId: r.partyId, name: r.name, total: money(Number(r.v), base) })),
      recentInvoices: await summariesToWire(ctx.db, recent, ctx.now),
    });
  },

  async getAccountsHub(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const s = hubScope(ctx);
    const { period, branchId, branches } = s;
    const m = (minor: number) => money(minor, base);
    const fy = ctx.company.fiscalYearStartMonth;
    const books = ctx.user.branchIds.length === 0;
    const lastBucket = s.buckets[s.buckets.length - 1]?.to ?? period.to;
    const inPeriod: Scope = { db: ctx.db, company: ctx.company, user: ctx.user, now: ctx.now, from: period.from, to: period.to };

    const [profitOf, flows, cash, { docs }, { expenses }] = await Promise.all([
      metrics.profitLoader(ctx, branchId, lastBucket > period.to ? lastBucket : period.to),
      metrics.cashFlows(ctx, branches, period.to),
      metrics.cashAccounts(ctx),
      loadDocuments(inPeriod, ['invoice', 'debitNote', 'salesReturn', 'creditNote', 'purchaseBill', 'supplierDebitNote', 'purchaseReturn', 'supplierCreditNote']),
      loadExpenses(inPeriod),
    ]);
    const tax = summarizeTax(docs, base, { range: period, branchId: branchId ?? null, partyId: null, currency: null }, expenses, companyCore(ctx.company));
    const moved = cashMovement(cash.opening, flows, period);
    // Opening and closing are the company's accounts', which a branch's own flows can't reach.
    const whole = branches.length === 0;

    let sheet: AccountsHub['balanceSheet'] | undefined;
    let movement: AccountsHub['accountMovement'] | undefined;
    if (books) {
      const { postings, book, stock } = await loadBook(inPeriod);
      const bs = balanceSheet(postings, book, period.to, stock, fy);
      const side = (rows: typeof bs.assets) => rows.map((r) => ({ heading: r.heading, total: m(r.total) }));
      sheet = { asOf: bs.asOf, assets: side(bs.assets), liabilities: side(bs.liabilities), totalAssets: m(bs.totalAssets), totalLiabilities: m(bs.totalLiabilities), currentProfit: m(bs.currentProfit) };
      movement = trialBalance(postings, book, period, fy)
        .rows.filter((r) => r.debit + r.credit > 0)
        .sort((a, b) => b.debit + b.credit - (a.debit + a.credit))
        .slice(0, 8)
        .map((r) => ({ account: r.account.key, name: r.account.name, group: r.account.group, opening: m(r.opening), debit: m(r.debit), credit: m(r.credit), closing: m(r.closing) }));
    }

    return compact({
      period: s.wire,
      profit: metrics.profitWire(profitOf(period)),
      previousProfit: s.previous ? metrics.profitWire(profitOf(s.previous)) : undefined,
      profitTrend: s.buckets.map((b) => ({ key: b.key, value: profitOf(b).netProfit })),
      cash: compact({
        opening: whole ? m(moved.opening) : undefined,
        inflow: m(moved.inflow),
        outflow: m(moved.outflow),
        net: m(moved.net),
        closing: whole ? m(moved.closing) : undefined,
        receipts: m(moved.byCategory.receipts),
        payments: m(moved.byCategory.payments),
        expenses: m(moved.byCategory.expenses),
        tax: m(moved.byCategory.tax),
        other: m(moved.byCategory.other),
      }),
      tax: { output: tax.outwardTotal, input: tax.inwardTotal, netPayable: tax.netPayable },
      books,
      balanceSheet: sheet,
      accountMovement: movement,
    });
  },

  async getComplianceHub(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const today = businessDate(ctx.now);
    branchScope(ctx.user, ctx.query.branchId);
    const plan = ctx.company.plan;
    const books = ctx.user.branchIds.length === 0;
    const R = schema.gstReturns;

    // The registrations this branch files for: its own GSTIN, else the company's; every one without a branch.
    let gstins = await companyGstins(ctx.db, ctx.company);
    if (ctx.query.branchId) {
      const [b] = await ctx.db.select({ gstin: schema.branches.gstin }).from(schema.branches).where(and(eq(schema.branches.companyId, ctx.company.id), eq(schema.branches.id, ctx.query.branchId)));
      const own = b?.gstin && b.gstin.length === 15 ? b.gstin : ctx.company.taxIdentifier;
      gstins = gstins.filter((g) => g === own);
    }

    // TDS from the books: what each month deducted still owes, which only a user who sees every branch can read.
    const withTds = books && !!ctx.company.tan && hasModule(plan, 'payables');
    const tdsRows = withTds
      ? tdsPayableSummary(
          (await loadBook({ db: ctx.db, company: ctx.company, user: ctx.user, now: ctx.now, from: '1900-01-01', to: today })).postings,
          { from: financialYearOf(addDaysISO(today, -45), ctx.company.fiscalYearStartMonth).start, to: today },
          today,
        )
      : [];

    const window = { from: addDaysISO(today, -45), to: addDaysISO(today, 60) };
    const calendar: Schema<'FilingDue'>[] = [];
    const due = gstins.flatMap((gstin) =>
      filingCalendar({ ...window, frequency: ctx.company.returnFrequency, stateCode: gstin.slice(0, 2), deductsTds: false }).map((f) => ({ ...f, gstin })),
    );
    const recorded = gstins.length
      ? await ctx.db
          .select({ gstin: R.gstin, returnType: R.returnType, period: R.period, status: R.status })
          .from(R)
          .where(and(eq(R.companyId, ctx.company.id), inArray(R.gstin, gstins), inArray(R.period, [...new Set(due.map((d) => d.period))])))
      : [];
    const filed = new Set(recorded.filter((r) => r.status === 'filed').map((r) => `${r.gstin}|${r.returnType}|${r.period}`));
    for (const d of due) {
      const type = d.kind === 'iff' ? 'gstr1' : d.kind;
      const done = filed.has(`${d.gstin}|${type}|${d.period}`);
      calendar.push({ ...d, status: done ? 'filed' : d.due < today ? 'overdue' : 'pending' });
    }
    if (withTds) {
      for (const f of filingCalendar({ ...window, frequency: 'monthly', stateCode: '', deductsTds: true }).filter((x) => x.kind === 'tds')) {
        const rows = tdsRows.filter((r) => r.month === f.period);
        // A month nothing was deducted in has nothing to deposit.
        if (!rows.some((r) => r.deductedMinor > 0)) continue;
        const owing = rows.some((r) => r.balanceMinor > 0);
        calendar.push({ ...f, status: !owing ? 'filed' : f.due < today ? 'overdue' : 'pending' });
      }
    }
    calendar.sort((a, b) => a.due.localeCompare(b.due) || a.kind.localeCompare(b.kind) || (a.gstin ?? '').localeCompare(b.gstin ?? ''));

    // The last three months' GSTR-2B, newest fetched first; last month's when none is.
    let itc: ComplianceHub['itc'] | undefined;
    if (gstins.length && hasModule(plan, 'purchases') && ['owner', 'admin', 'accountant'].includes(roleIn(ctx.user, ctx.company))) {
      const gstin = gstins[0];
      const periods = [1, 2, 3].map((k) => {
        const [y, mo] = today.split('-').map(Number);
        const t = y * 12 + (mo - 1) - k;
        return `${String((t % 12) + 1).padStart(2, '0')}${Math.floor(t / 12)}`;
      });
      const P2 = schema.gstr2bPeriods;
      const fetched = await ctx.db.select({ period: P2.period }).from(P2).where(and(eq(P2.companyId, ctx.company.id), eq(P2.gstin, gstin), inArray(P2.period, periods)));
      const period = periods.find((p) => fetched.some((f) => f.period === p)) ?? periods[0];
      const r = await reconciliation(ctx.db, ctx.company, gstin, period);
      const sm = r.summary!;
      itc = r.fetched
        ? {
            gstin,
            period,
            fetched: true,
            lines: sm.lines ?? 0,
            matched: (sm.matched ?? 0) + (sm.matchedWithinTolerance ?? 0) + (sm.manuallyLinked ?? 0) + (sm.claimed ?? 0),
            mismatched: (sm.partial ?? 0) + (sm.probable ?? 0),
            missingInBooks: sm.missingInBooks ?? 0,
            missingIn2b: (r.missingIn2b ?? []).length,
            missingIn2bTax: money((r.missingIn2b ?? []).reduce((a, b) => a + (b.tax?.minor ?? 0), 0), base),
            claimableTax: sm.claimableTax ?? money(0, base),
          }
        : { gstin, period, fetched: false };
    }

    const owing = tdsRows.filter((r) => r.balanceMinor > 0);
    return compact({
      calendar,
      itc,
      tdsDue: withTds
        ? {
            total: money(owing.reduce((a, r) => a + r.balanceMinor, 0), base),
            overdue: money(owing.filter((r) => r.overdue).reduce((a, r) => a + r.balanceMinor, 0), base),
            rows: owing.map((r) => ({ section: r.section, month: r.month, balance: money(r.balanceMinor, base), dueDate: r.dueDate, overdue: r.overdue })),
          }
        : undefined,
    });
  },

  async getDashboard(ctx) {
    const plan = ctx.company.plan;
    const base = ctx.company.baseCurrency.trim();
    const s = hubScope({ ...ctx, query: { range: ctx.query.range, branchId: ctx.query.branchId } });
    const { today, period, branchId, branches } = s;
    const scope = (from: string, to: string): Scope => ({ db: ctx.db, company: ctx.company, user: ctx.user, now: ctx.now, from, to });
    const total = async (key: ReportKey) => ((await buildReport(scope(period.from, period.to), key, { branchId })) as { total: Schema<'Money'> }).total;

    const months = lastSixMonths(today);
    const trend = (await buildReport(scope(`${months[0]}-01`, periodOf('month', today, 4).to), 'sales-summary', { branchId })) as Schema<'TransactionSummary'>;
    const byMonth = new Map((trend.byMonth ?? []).map((v) => [v.key, v.value]));

    const receivables = await aging(ctx, 'receivables', { asOf: today, branchId });
    const current = receivables.buckets?.find((b) => b.key === 'current')?.amount?.minor ?? 0;
    const cash = await metrics.cashAccounts(ctx);

    const D = schema.documents;
    const inBranches = metrics.inBranches(D.branchId, branches);
    const lowStockCount = hasModule(plan, 'inventory') ? await lowStock(ctx, branchId) : undefined;

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
      .where(and(eq(W.companyId, ctx.company.id), eq(W.status, 'active'), gt(W.validUpto, ctx.now), lte(W.validUpto, soon), branches.length ? inArray(W.branchId, branches) : undefined));

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
        cash.accounts.reduce((a, r) => a + r.balance, 0),
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
