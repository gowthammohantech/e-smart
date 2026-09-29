import { and, eq, exists, gte, ilike, inArray, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { accountFitsMethod } from '@esmart/core/domain/paymentAccounts';
import { FULL_PLAN, hasModule } from '@esmart/core/domain/plan';
import { money } from '@esmart/core/lib/money';
import { schema } from '@esmart/db';
import { defineHandlers, type Ctx } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { notFound, planUpgradeRequired, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { assignNumber } from '../../lib/numbering';
import { rateToBase } from '../documents/engine';
import { expenseTax, linkExpenseAttachments, nextRecurrence } from './engine';
import { expensesToWire, type ExpenseRow } from './wire';

export { materializeRecurringExpenses } from './engine';

const E = schema.expenses;
type AnyCtx = Pick<Ctx<'getExpense'>, 'company' | 'user' | 'db' | 'now'>;

/** An expense in the caller's company and branches, or 404. */
async function findExpense(ctx: AnyCtx, db: DbOrTx, id: string): Promise<ExpenseRow> {
  const [row] = await db.select().from(E).where(and(eq(E.companyId, ctx.company.id), eq(E.id, id)));
  if (!row || (ctx.user.branchIds.length && !ctx.user.branchIds.includes(row.branchId))) throw notFound('Expense');
  return row;
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
async function prepare(ctx: AnyCtx, db: DbOrTx, body: Schema<'Expense'>, current?: ExpenseRow) {
  const issues: Issue[] = [];
  const blocking = (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });
  const companyId = ctx.company.id;
  const baseCurrency = ctx.company.baseCurrency.trim();

  const [category] = await db.select({ id: schema.expenseCategories.id }).from(schema.expenseCategories).where(and(eq(schema.expenseCategories.companyId, companyId), eq(schema.expenseCategories.id, body.categoryId)));
  if (!category) blocking('categoryId', 'No such expense category in this company');

  if (body.supplierId) {
    const [supplier] = await db.select({ kind: schema.parties.kind }).from(schema.parties).where(and(eq(schema.parties.companyId, companyId), eq(schema.parties.id, body.supplierId)));
    if (!supplier) blocking('supplierId', 'No such party in this company');
    else if (supplier.kind !== 'supplier') blocking('supplierId', 'An expense can only name a supplier');
  }

  const [account] = await db.select().from(schema.paymentAccounts).where(and(eq(schema.paymentAccounts.companyId, companyId), eq(schema.paymentAccounts.id, body.accountId)));
  if (!account) blocking('accountId', 'No such payment account in this company');
  else if (!accountFitsMethod(body.method, { ...account, currency: account.currency.trim(), accountNumber: account.accountNumber ?? undefined, openingBalance: money(account.openingBalanceMinor, account.currency.trim()) })) {
    blocking('accountId', `A ${body.method} expense cannot be paid from a ${account.type} account`);
  }

  if (body.amount.currency !== body.currency) blocking('amount.currency', `Must match the expense currency (${body.currency})`);
  if (!(body.amount.minor > 0)) blocking('amount.minor', 'Must be more than zero');
  const [cur] = await db.select({ code: schema.currencies.code }).from(schema.currencies).where(eq(schema.currencies.code, body.currency));
  if (!cur) blocking('currency', `Unknown currency ${body.currency}`);

  let rate = 0;
  if (body.taxCategoryId) {
    const [tax] = await db.select({ rate: schema.taxCategories.rate }).from(schema.taxCategories).where(and(eq(schema.taxCategories.companyId, companyId), eq(schema.taxCategories.id, body.taxCategoryId)));
    if (!tax) blocking('taxCategoryId', 'No such tax category in this company');
    else rate = Number(tax.rate);
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
  if (issues.length) throw unprocessable(issues);

  const taxInclusive = body.taxInclusive ?? current?.taxInclusive ?? true;
  const recurrence = body.recurrence ?? current?.recurrence ?? 'none';
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
    taxAmountMinor: expenseTax(money(body.amount.minor, body.currency), rate, taxInclusive).minor,
    taxInclusive,
    accountId: body.accountId,
    method: body.method,
    reference: body.reference ?? null,
    notes: body.notes ?? null,
    billable: body.billable ?? false,
    recurrence,
    nextRecurrenceDate: keepSchedule ? current.nextRecurrenceDate : nextRecurrence(body.date, recurrence),
  };
}

/** Expenses: listExpenses, createExpense, getExpense, saveExpense, removeExpense. */
export const expensesHandlers = defineHandlers({
  async listExpenses(ctx) {
    const q = ctx.query;
    const filters: (SQL | undefined)[] = [eq(E.companyId, ctx.company.id)];
    if (q.categoryId) filters.push(eq(E.categoryId, q.categoryId));
    if (q.supplierId) filters.push(eq(E.supplierId, q.supplierId));
    if (q.billable !== undefined) filters.push(eq(E.billable, q.billable));
    if (q.recurring !== undefined) filters.push(q.recurring ? ne(E.recurrence, 'none') : eq(E.recurrence, 'none'));
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
    const cols = await prepare(ctx, ctx.db, ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      const number = await assignNumber(tx, { companyId: ctx.company.id, kind: 'expense', branchId: cols.branchId, date: cols.date });
      const [created] = await tx
        .insert(E)
        .values({ id: newId('exp'), companyId: ctx.company.id, number, createdBy: ctx.user.id, ...cols, createdAt: ctx.now, updatedAt: ctx.now })
        .returning();
      await linkExpenseAttachments(tx, ctx.company.id, created.id, ctx.body.attachmentIds);
      const wire = await toWire(tx, created);
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'expense', entityId: created.id, entityLabel: created.number, version: created.version, after: wire });
      return created;
    });
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
    const cols = await prepare(ctx, ctx.db, ctx.body, current);
    const row = await ctx.db.transaction(async (tx) => {
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
    await ctx.db.transaction(async (tx) => {
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
