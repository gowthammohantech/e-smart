import { notify, noteMoney } from '../../lib/notify';
import { CASH_PAYMENT_LIMIT } from '../payments/engine';
import { assertNotReconciled } from '../banking/engine';
import { addDaysISO, businessDate as businessDateOf } from '@esmart/core/lib/date';
import { and, eq, exists, gte, ilike, inArray, isNull, lte, ne, notExists, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { vehicleIssues } from '../settings/vehicles';
import { buysFrom, sellsTo } from '@esmart/core/domain/partyKinds';
import type { Schema } from '@esmart/api-contract';
import { accountFitsMethod } from '@esmart/core/domain/paymentAccounts';
import { FULL_PLAN, hasModule } from '@esmart/core/domain/plan';
import { money } from '@esmart/core/lib/money';
import { schema } from '@esmart/db';
import { defineHandlers, type Ctx } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, notFound, planUpgradeRequired, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { track } from '../../analytics/track';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { categoryOn } from '../../lib/taxRates';
import { assignNumber } from '../../lib/numbering';
import { rateToBase } from '../documents/engine';
import { assertPeriodOpen, assertPeriodOpenNow } from '../documents/lifecycle';
import { assertAccountCovers, assertExpenseWithinLimit, expenseTax, linkExpenseAttachments, nextRecurrence } from './engine';
import { expensesToWire, type ExpenseRow } from './wire';
import { costCentreIssues } from '../books/costCentres';

export { materializeRecurringExpenses } from './engine';

const E = schema.expenses;
type AnyCtx = Pick<Ctx<'getExpense'>, 'company' | 'user' | 'db' | 'now'>;

/** An expense in the caller's company and branches, or 404. */
async function findExpense(ctx: AnyCtx, db: DbOrTx, id: string): Promise<ExpenseRow> {
  const [row] = await db.select().from(E).where(and(eq(E.companyId, ctx.company.id), eq(E.id, id)));
  if (!row || (ctx.user.branchIds.length && !ctx.user.branchIds.includes(row.branchId))) throw notFound('Expense');
  return row;
}

/** The number of a live invoice that bills this expense on to its customer, if one does. */
async function recoveringInvoice(db: DbOrTx, expenseId: string): Promise<string | undefined> {
  const L = schema.documentLines;
  const D = schema.documents;
  const [hit] = await db
    .select({ number: D.number })
    .from(L)
    .innerJoin(D, eq(D.id, L.documentId))
    .where(and(eq(L.expenseId, expenseId), notInArray(D.status, ['draft', 'cancelled', 'rejected'])))
    .limit(1);
  return hit ? (hit.number?.trim() || 'an invoice') : undefined;
}

/**
 * An expense billed on to a customer stays as it was billed: the invoice credits
 * Reimbursements recoverable with this amount, so deleting it, or changing what
 * was recovered, would leave that account short and the invoice line pointing at nothing.
 */
async function assertNotRecovered(db: DbOrTx, current: ExpenseRow, next?: { amountMinor: number; currency: string; billable: boolean; customerId: string | null }) {
  if (next && next.amountMinor === current.amountMinor && next.currency === current.currency.trim() && next.billable === current.billable && next.customerId === current.customerId) return;
  const invoice = await recoveringInvoice(db, current.id);
  if (!invoice) return;
  throw conflict(
    'EXPENSE_RECOVERED',
    next
      ? `This expense is billed on invoice ${invoice}; cancel that invoice before changing its amount, currency, customer or billable flag`
      : `This expense is billed on invoice ${invoice}; cancel that invoice before deleting it`,
  );
}

async function toWire(db: DbOrTx, row: ExpenseRow) {
  const [w] = await expensesToWire(db, [row]);
  return w;
}

/**
 * Checks an Expense body against the company's records and works out what
 * the server owns: the branch, the exchange rate, the input tax and the
 * next recurrence. Returns the columns to write.
 */
export async function prepare(ctx: AnyCtx, db: DbOrTx, body: Schema<'Expense'>, current?: ExpenseRow) {
  const issues: Issue[] = [];
  const blocking = (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });
  const companyId = ctx.company.id;
  const baseCurrency = ctx.company.baseCurrency.trim();

  const [category] = await db.select({ id: schema.expenseCategories.id }).from(schema.expenseCategories).where(and(eq(schema.expenseCategories.companyId, companyId), eq(schema.expenseCategories.id, body.categoryId)));
  if (!category) blocking('categoryId', 'No such expense category in this company');

  if (body.supplierId) {
    const [supplier] = await db.select({ kind: schema.parties.kind }).from(schema.parties).where(and(eq(schema.parties.companyId, companyId), eq(schema.parties.id, body.supplierId)));
    if (!supplier) blocking('supplierId', 'No such party in this company');
    else if (!buysFrom(supplier.kind)) blocking('supplierId', 'An expense can only name a supplier');
  }

  const [account] = await db.select().from(schema.paymentAccounts).where(and(eq(schema.paymentAccounts.companyId, companyId), eq(schema.paymentAccounts.id, body.accountId)));
  if (!account) blocking('accountId', 'No such payment account in this company');
  else if (!accountFitsMethod(body.method, account)) {
    blocking('accountId', `A ${body.method} expense cannot be paid from a ${account.type} account`);
  }

  if (body.amount.currency !== body.currency) blocking('amount.currency', `Must match the expense currency (${body.currency})`);
  if (!(body.amount.minor > 0)) blocking('amount.minor', 'Must be more than zero');
  const [cur] = await db.select({ code: schema.currencies.code }).from(schema.currencies).where(eq(schema.currencies.code, body.currency));
  if (!cur) blocking('currency', `Unknown currency ${body.currency}`);

  let rate = 0;
  if (body.taxCategoryId) {
    // The rate in force on the expense's date: a rate changed later doesn't reach back to it.
    const onDate = await categoryOn(db, companyId, body.taxCategoryId, body.date);
    if (!onDate) blocking('taxCategoryId', 'No such tax category in this company');
    else if (!onDate.available) blocking('taxCategoryId', `${onDate.name} applies from ${onDate.effectiveFrom}; the expense is dated ${body.date}`);
    else rate = onDate.rate;
  }

  let branchId = body.branchId ?? current?.branchId ?? null;
  if (branchId) {
    const [b] = await db.select({ id: schema.branches.id }).from(schema.branches).where(and(eq(schema.branches.companyId, companyId), eq(schema.branches.id, branchId)));
    if (!b) blocking('branchId', 'No such branch in this company');
  } else {
    const branches = await db.select().from(schema.branches).where(eq(schema.branches.companyId, companyId));
    branchId = (branches.find((b) => b.isPrimary) ?? branches[0])?.id ?? null;
  }
  if (branchId && ctx.user.branchIds.length && !ctx.user.branchIds.includes(branchId)) blocking('branchId', 'You cannot record expenses in this branch');

  const exchangeRate =
    body.currency === baseCurrency
      ? 1
      : (body.exchangeRate ??
        (current && current.currency.trim() === body.currency && current.date === body.date ? Number(current.exchangeRate) : null) ??
        (cur ? await rateToBase(db, companyId, body.currency, baseCurrency, body.date) : null));
  if (!exchangeRate || exchangeRate <= 0) blocking('exchangeRate', `A ${body.currency} expense needs its rate to ${baseCurrency}`);

  if (body.attachmentIds?.length) {
    const A = schema.attachments;
    const found = await db.select({ id: A.id }).from(A).where(and(eq(A.companyId, companyId), inArray(A.id, body.attachmentIds)));
    const missing = body.attachmentIds.filter((id) => !found.some((f) => f.id === id));
    if (missing.length) blocking('attachmentIds', `No such attachment in this company: ${missing.join(', ')}`);
  }
  if (body.customerId) {
    const P = schema.parties;
    const [customer] = await db.select({ kind: P.kind }).from(P).where(and(eq(P.companyId, companyId), eq(P.id, body.customerId)));
    if (!customer || !sellsTo(customer.kind)) blocking('customerId', 'No such customer in this company');
    else if (!body.billable) blocking('customerId', 'Only a billable expense is recovered from a customer');
  }
  issues.push(...(await costCentreIssues(db, companyId, [{ field: 'costCentreId', id: body.costCentreId }])));
  issues.push(...(await vehicleIssues(db, companyId, body.vehicleId)));
  if (issues.length) throw unprocessable(issues);

  const taxInclusive = body.taxInclusive ?? current?.taxInclusive ?? true;
  const reverseCharge = body.reverseCharge ?? current?.reverseCharge ?? false;
  const recurrence = body.recurrence ?? current?.recurrence ?? 'none';
  // Input credit needs a tax invoice from a registered supplier (s.16(2)(a)) and a business on regular
  // GST: without the supplier's GSTIN (on the expense or its saved supplier), or for an unregistered or
  // composition business, the GST is part of the cost. Reverse charge is the business's own tax.
  const supplierGstin = body.supplierGstin?.trim().toUpperCase() || null;
  const [supplier] = body.supplierId ? await db.select({ taxId: schema.parties.taxId }).from(schema.parties).where(and(eq(schema.parties.companyId, companyId), eq(schema.parties.id, body.supplierId))) : [];
  const onRegularGst = !!ctx.company.taxRegistered && !ctx.company.compositionScheme;
  const creditable = onRegularGst && (reverseCharge || !!supplierGstin || !!supplier?.taxId);
  const itcEligibility = creditable ? (body.itcEligibility ?? 'eligible') : 'ineligible';
  // A template keeps its place in the series unless its date or frequency changed.
  const keepSchedule = current && current.recurrence === recurrence && current.date === body.date && current.nextRecurrenceDate;
  return {
    branchId: branchId!,
    categoryId: body.categoryId,
    supplierId: body.supplierId ?? null,
    date: body.date,
    amountMinor: body.amount.minor,
    currency: body.currency,
    exchangeRate: String(exchangeRate),
    taxCategoryId: body.taxCategoryId ?? null,
    taxAmountMinor: expenseTax(money(body.amount.minor, body.currency), rate, taxInclusive, reverseCharge).minor,
    taxInclusive,
    placeOfSupplyStateCode: body.placeOfSupplyStateCode ?? null,
    supplierGstin,
    itcEligibility,
    reverseCharge,
    accountId: body.accountId,
    method: body.method,
    reference: body.reference ?? null,
    notes: body.notes ?? null,
    billable: body.billable ?? false,
    customerId: body.billable ? (body.customerId ?? null) : null,
    costCentreId: body.costCentreId ?? null,
    vehicleId: body.vehicleId ?? null,
    recurrence,
    nextRecurrenceDate: keepSchedule ? current.nextRecurrenceDate : nextRecurrence(body.date, recurrence),
  };
}

/** Money is spent on the day it is spent: not a day ahead of today (a day's grace for time zones). */
function assertNotAhead(date: string, now: Date) {
  if (date > addDaysISO(businessDateOf(now), 1)) throw unprocessable([{ field: 'date', message: `An expense can't be dated ${date}, in the future`, severity: 'blocking' }]);
}

/** Expenses: listExpenses, createExpense, getExpense, saveExpense, removeExpense. */
type ExpenseQuery = Pick<Ctx<'listExpenses'>['query'], 'categoryId' | 'supplierId' | 'billable' | 'recurring' | 'branchId' | 'from' | 'to' | 'q'> &
  Partial<Pick<Ctx<'listExpenses'>['query'], 'unrecovered' | 'forCustomer' | 'exceptDocumentId'>>;

/** The WHERE of an expense list, shared by the list and its summary so the two never disagree. */
function expenseFilters(ctx: Pick<Ctx<'listExpenses'>, 'company' | 'user' | 'db'>, q: ExpenseQuery): (SQL | undefined)[] {
  const filters: (SQL | undefined)[] = [eq(E.companyId, ctx.company.id)];
  if (q.categoryId) filters.push(eq(E.categoryId, q.categoryId));
  if (q.supplierId) filters.push(eq(E.supplierId, q.supplierId));
  if (q.billable !== undefined) filters.push(eq(E.billable, q.billable));
  if (q.recurring !== undefined) filters.push(q.recurring ? ne(E.recurrence, 'none') : eq(E.recurrence, 'none'));
  if (q.forCustomer) filters.push(or(isNull(E.customerId), eq(E.customerId, q.forCustomer)));
  if (q.unrecovered) {
    // Billable, and on no live invoice yet (this one's own lines aside, while it is being edited).
    const L = schema.documentLines;
    const D = schema.documents;
    filters.push(eq(E.billable, true));
    filters.push(
      notExists(
        ctx.db
          .select({ one: sql`1` })
          .from(L)
          .innerJoin(D, eq(D.id, L.documentId))
          .where(and(eq(L.expenseId, E.id), notInArray(D.status, ['draft', 'cancelled', 'rejected']), q.exceptDocumentId ? ne(D.id, q.exceptDocumentId) : undefined)),
      ),
    );
  }
  if (q.branchId) filters.push(eq(E.branchId, q.branchId));
  if (ctx.user.branchIds.length) filters.push(inArray(E.branchId, ctx.user.branchIds));
  if (q.from) filters.push(gte(E.date, q.from));
  if (q.to) filters.push(lte(E.date, q.to));
  if (q.q) {
    const like = `%${q.q.trim()}%`;
    const P = schema.parties;
    const C = schema.expenseCategories;
    filters.push(
      or(
        ilike(E.number, like),
        ilike(E.reference, like),
        ilike(E.notes, like),
        exists(ctx.db.select({ one: sql`1` }).from(P).where(and(eq(P.id, E.supplierId), ilike(P.name, like)))),
        exists(ctx.db.select({ one: sql`1` }).from(C).where(and(eq(C.id, E.categoryId), ilike(C.name, like)))),
      ),
    );
  }
  return filters;
}

export const expensesHandlers = defineHandlers({
  async summarizeExpenseList(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const inBase = (col: typeof E.amountMinor | typeof E.taxAmountMinor) => sql<number>`coalesce(sum(round(${col} * ${E.exchangeRate})), 0)::bigint`;
    const rows = await ctx.db
      .select({ categoryId: E.categoryId, count: sql<number>`count(*)::int`, total: inBase(E.amountMinor), tax: inBase(E.taxAmountMinor) })
      .from(E)
      .where(and(...expenseFilters(ctx, ctx.query)))
      .groupBy(E.categoryId);
    const add = (k: 'total' | 'tax') => money(rows.reduce((a, r) => a + Number(r[k]), 0), base);
    return {
      count: rows.reduce((a, r) => a + r.count, 0),
      total: add('total'),
      tax: add('tax'),
      byCategory: rows.map((r) => ({ categoryId: r.categoryId, total: money(Number(r.total), base) })).sort((a, b) => b.total.minor - a.total.minor),
    };
  },

  async listExpenses(ctx) {
    const q = ctx.query;
    const filters = expenseFilters(ctx, q);
    const k = keyset({ cursor: q.cursor, limit: q.limit, sort: E.date, id: E.id, order: 'desc' });
    const rows = await ctx.db
      .select()
      .from(E)
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    return k.page(await expensesToWire(ctx.db, rows.slice(0, k.take - 1)), rows);
  },

  async createExpense(ctx) {
    assertPeriodOpen(ctx.company, ctx.body.date);
    assertNotAhead(ctx.body.date, ctx.now);
    const cols = await prepare(ctx, ctx.db, ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      // No account pays out more than it holds, as with payments.
      await assertPeriodOpenNow(tx, ctx.company, cols.date);
      assertExpenseWithinLimit(ctx.company, ctx.user, cols);
      await assertAccountCovers(tx, ctx.company.id, ctx.company.baseCurrency.trim(), cols);
      const number = await assignNumber(tx, { companyId: ctx.company.id, kind: 'expense', branchId: cols.branchId, date: cols.date });
      const [created] = await tx
        .insert(E)
        .values({ id: newId('exp'), companyId: ctx.company.id, number, createdBy: ctx.user.id, ...cols, createdAt: ctx.now, updatedAt: ctx.now })
        .returning();
      await linkExpenseAttachments(tx, ctx.company.id, created.id, ctx.body.attachmentIds);
      // s.40A(3): over ₹10,000 in cash to one person in a day isn't allowed as an expense; the owners are told.
      const base = Math.round(created.amountMinor * Number(created.exchangeRate));
      if (created.method === 'cash' && base > CASH_PAYMENT_LIMIT) {
        await notify(tx, ctx.deps, { companyId: ctx.company.id, kind: 'system', title: 'Cash payment over ₹10,000', body: `${created.number}: ${noteMoney(base, ctx.company.baseCurrency)} paid in cash. Cash over ₹10,000 to one person in a day isn't allowed as an expense for income tax (s.40A(3)); pay by bank where you can.`, entityType: 'expense', entityId: created.id });
      }
      const wire = await toWire(tx, created);
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'expense', entityId: created.id, entityLabel: created.number, version: created.version, after: wire });
      return created;
    });
    track(ctx, 'expense_created', { hasTax: row.taxAmountMinor > 0 });
    setEtag(ctx.reply, row.version);
    return toWire(ctx.db, row);
  },

  async getExpense(ctx) {
    const row = await findExpense(ctx, ctx.db, ctx.params.id);
    setEtag(ctx.reply, row.version);
    return toWire(ctx.db, row);
  },

  async saveExpense(ctx) {
    // The router gates createExpense; editing is the same module.
    if (!hasModule(ctx.company.plan, 'expenses')) throw planUpgradeRequired(FULL_PLAN, 'expenses');
    const current = await findExpense(ctx, ctx.db, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    assertPeriodOpen(ctx.company, current.date);
    assertPeriodOpen(ctx.company, ctx.body.date);
    assertNotAhead(ctx.body.date, ctx.now);
    const cols = await prepare(ctx, ctx.db, ctx.body, current);
    const row = await ctx.db.transaction(async (tx) => {
      await assertPeriodOpenNow(tx, ctx.company, cols.date, current.date);
      await assertNotRecovered(tx, current, cols);
      if (current.amountMinor !== cols.amountMinor || current.date !== cols.date || current.accountId !== cols.accountId || current.currency.trim() !== cols.currency) {
        await assertNotReconciled(tx, 'expense', current.id, current.number);
      }
      assertExpenseWithinLimit(ctx.company, ctx.user, cols, current);
      await assertAccountCovers(tx, ctx.company.id, ctx.company.baseCurrency.trim(), cols, current);
      const before = await toWire(tx, current);
      const [updated] = await tx
        .update(E)
        .set({ ...cols, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(E.id, current.id), eq(E.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await linkExpenseAttachments(tx, ctx.company.id, updated.id, ctx.body.attachmentIds);
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'updated',
        entityType: 'expense',
        entityId: updated.id,
        entityLabel: updated.number,
        version: updated.version,
        before,
        after: await toWire(tx, updated),
      });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return toWire(ctx.db, row);
  },

  /**
   * Deleting a recurring template stops the series; the occurrences it
   * already created stay, as ordinary expenses.
   */
  async removeExpense(ctx) {
    const current = await findExpense(ctx, ctx.db, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    assertPeriodOpen(ctx.company, current.date);
    await ctx.db.transaction(async (tx) => {
      await assertNotRecovered(tx, current);
      await assertNotReconciled(tx, 'expense', current.id, current.number);
      const before = await toWire(tx, current);
      await linkExpenseAttachments(tx, ctx.company.id, current.id, []);
      await tx.update(E).set({ recurringParentId: null }).where(and(eq(E.companyId, ctx.company.id), eq(E.recurringParentId, current.id)));
      const deleted = await tx.delete(E).where(and(eq(E.id, current.id), eq(E.version, current.version))).returning({ id: E.id });
      if (!deleted.length) throw preconditionFailed();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'deleted', entityType: 'expense', entityId: current.id, entityLabel: current.number, version: current.version + 1, deleted: true, before });
    });
    return undefined;
  },
});
