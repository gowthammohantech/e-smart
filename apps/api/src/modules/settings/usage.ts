import { and, count, eq, notInArray, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { money } from '../../lib/wire';
import { paymentAccountBalances } from './accounts';

/**
 * Settings: getCompanyUsage. The counts the settings screens once took from
 * every record on the device: backup and plan usage, whether anything is
 * posted, what each branch, tax category, expense category and payment
 * account is used by. Company-wide, like the settings themselves.
 */
export const usageHandlers = defineHandlers({
  async getCompanyUsage(ctx) {
    const companyId = ctx.company.id;
    const base = ctx.company.baseCurrency.trim();
    const D = schema.documents;
    const L = schema.documentLines;
    const X = schema.expenses;
    const PAY = schema.payments;
    const A = schema.paymentAccounts;
    const tally = (table: typeof schema.parties | typeof schema.items | typeof schema.stockMovements) => ctx.db.select({ n: count() }).from(table).where(eq(table.companyId, companyId));

    const [[parties], [customers], [items], [movements], byBranch, [posted], [invoices], [payments], byCategory, itemTaxes, docTaxes, accounts, paidThrough, spentFrom] = await Promise.all([
      tally(schema.parties),
      ctx.db.select({ n: count() }).from(schema.parties).where(and(eq(schema.parties.companyId, companyId), eq(schema.parties.kind, 'customer'))),
      tally(schema.items),
      tally(schema.stockMovements),
      ctx.db.select({ branchId: D.branchId, n: count() }).from(D).where(eq(D.companyId, companyId)).groupBy(D.branchId),
      ctx.db.select({ n: count() }).from(D).where(and(eq(D.companyId, companyId), notInArray(D.status, ['draft', 'requested']))),
      ctx.db.select({ n: count() }).from(D).where(and(eq(D.companyId, companyId), eq(D.kind, 'invoice'))),
      ctx.db.select({ n: count() }).from(PAY).where(eq(PAY.companyId, companyId)),
      ctx.db
        .select({ categoryId: X.categoryId, n: count(), total: sql<string>`coalesce(sum(round(${X.amountMinor} * ${X.exchangeRate})), 0)` })
        .from(X)
        .where(eq(X.companyId, companyId))
        .groupBy(X.categoryId),
      ctx.db.select({ id: schema.items.taxCategoryId, n: count() }).from(schema.items).where(eq(schema.items.companyId, companyId)).groupBy(schema.items.taxCategoryId),
      ctx.db
        .select({ id: L.taxCategoryId, n: sql<number>`count(distinct ${L.documentId})` })
        .from(L)
        .innerJoin(D, eq(D.id, L.documentId))
        .where(eq(D.companyId, companyId))
        .groupBy(L.taxCategoryId),
      ctx.db.select().from(A).where(eq(A.companyId, companyId)),
      ctx.db.selectDistinct({ id: PAY.accountId }).from(PAY).where(eq(PAY.companyId, companyId)),
      ctx.db.selectDistinct({ id: X.accountId }).from(X).where(eq(X.companyId, companyId)),
    ]);

    const balances = await paymentAccountBalances(ctx.db, companyId, accounts);
    const used = new Set([...paidThrough, ...spentFrom].map((r) => r.id));
    const taxUse: Record<string, number> = {};
    for (const r of [...itemTaxes, ...docTaxes]) if (r.id) taxUse[r.id] = (taxUse[r.id] ?? 0) + Number(r.n);

    return {
      counts: {
        parties: Number(parties.n),
        customers: Number(customers.n),
        items: Number(items.n),
        documents: byBranch.reduce((s, r) => s + Number(r.n), 0),
        invoices: Number(invoices.n),
        payments: Number(payments.n),
        expenses: byCategory.reduce((s, r) => s + Number(r.n), 0),
        stockMovements: Number(movements.n),
      },
      postedDocuments: Number(posted.n),
      documentsByBranch: Object.fromEntries(byBranch.map((r) => [r.branchId, Number(r.n)])),
      taxCategoryUse: taxUse,
      expenseCategories: Object.fromEntries(byCategory.map((r) => [r.categoryId, { count: Number(r.n), total: money(Number(r.total), base) }])),
      paymentAccounts: Object.fromEntries(accounts.map((a) => [a.id, { balance: money(balances[a.id] ?? 0, base), inUse: used.has(a.id) }])),
    };
  },
});
