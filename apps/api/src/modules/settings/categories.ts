import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, invalid, notFound, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { ensureHsn } from '../catalog/hsn';
import { audit, firstUse } from './shared';
import { expenseCategoryToWire, taxCategoryToWire } from './wire';

const T = schema.taxCategories;
const E = schema.expenseCategories;

async function findTax(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(T).where(and(eq(T.companyId, companyId), eq(T.id, id)));
  if (!row) throw notFound('Tax category');
  return row;
}

async function findExpenseCategory(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(E).where(and(eq(E.companyId, companyId), eq(E.id, id)));
  if (!row) throw notFound('Expense category');
  return row;
}

/** Cess can run past 100% (tobacco, aerated drinks); every other tax cannot. */
function validateTax(body: Schema<'TaxCategory'>) {
  const issues: Issue[] = [];
  const max = body.type === 'CESS' ? 999.999 : 100;
  if (!(body.rate >= 0 && body.rate <= max)) issues.push({ field: 'rate', message: `Rate must be between 0 and ${max}`, severity: 'blocking' });
  if (Math.round(body.rate * 1000) !== body.rate * 1000) issues.push({ field: 'rate', message: 'Rate allows at most three decimals', severity: 'blocking' });
  if (!body.name.trim()) issues.push({ field: 'name', message: 'Name is required', severity: 'blocking' });
  if (issues.length) throw unprocessable(issues);
}

async function taxColumns(tx: DbOrTx, body: Schema<'TaxCategory'>) {
  return {
    name: body.name.trim(),
    rate: String(body.rate),
    type: body.type,
    hsnCode: body.hsnCode ? await ensureHsn(tx, body.hsnCode) : null,
    effectiveFrom: body.effectiveFrom,
    description: body.description ?? null,
  };
}

const COLOR_RE = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

function expenseCategoryColumns(body: Schema<'ExpenseCategory'>, current?: { icon: string; color: string }) {
  const name = body.name.trim();
  if (!name) throw invalid('name', 'Name is required');
  if (body.color && !COLOR_RE.test(body.color)) throw invalid('color', 'Colour must be a hex value like #4DA3FF');
  return { name, icon: body.icon ?? current?.icon ?? 'tag-outline', color: body.color ?? current?.color ?? '#8E98AC' };
}

/** Names are unique per company (`expense_categories_company_id_name_idx`). */
async function assertNameFree(db: DbOrTx, companyId: string, name: string, exceptId?: string) {
  const filters = [eq(E.companyId, companyId), sql`lower(${E.name}) = lower(${name})`];
  if (exceptId) filters.push(ne(E.id, exceptId));
  const [dupe] = await db.select({ id: E.id }).from(E).where(and(...filters));
  if (dupe) throw invalid('name', `There is already a category called ${name}`, 'EXPENSE_CATEGORY_EXISTS');
}

/** Tax and expense categories. */
export const categoryHandlers = defineHandlers({
  async listTaxCategories(ctx) {
    const rows = await ctx.db.select().from(T).where(eq(T.companyId, ctx.company.id)).orderBy(asc(T.rate), asc(T.name));
    return { data: rows.map(taxCategoryToWire) };
  },

  async createTaxCategory(ctx) {
    validateTax(ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(T)
        .values({ id: newId('tax'), companyId: ctx.company.id, ...(await taxColumns(tx, ctx.body)) })
        .returning();
      await audit(tx, ctx.user, ctx.company.id, 'tax_category', 'created', created, created.name, { after: taxCategoryToWire(created) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return taxCategoryToWire(row);
  },

  async saveTaxCategory(ctx) {
    const current = await findTax(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    validateTax(ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(T)
        .set({ ...(await taxColumns(tx, ctx.body)), version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(T.id, current.id), eq(T.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await audit(tx, ctx.user, ctx.company.id, 'tax_category', 'updated', updated, updated.name, { before: taxCategoryToWire(current), after: taxCategoryToWire(updated) });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return taxCategoryToWire(row);
  },

  async removeTaxCategory(ctx) {
    const current = await findTax(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const id = current.id;
    const used = await firstUse(ctx.db, [
      ['items', sql`select 1 from items where tax_category_id = ${id} limit 1`],
      ['document lines', sql`select 1 from document_lines where tax_category_id = ${id} limit 1`],
      ['document tax lines', sql`select 1 from document_tax_lines where tax_category_id = ${id} limit 1`],
      ['expenses', sql`select 1 from expenses where tax_category_id = ${id} limit 1`],
    ]);
    if (used) throw conflict('TAX_CATEGORY_IN_USE', `${used} use this tax category`);
    await ctx.db.transaction(async (tx) => {
      await tx.delete(T).where(eq(T.id, id));
      await audit(tx, ctx.user, ctx.company.id, 'tax_category', 'deleted', current, current.name, { before: taxCategoryToWire(current) });
    });
    return undefined;
  },

  async listExpenseCategories(ctx) {
    const rows = await ctx.db.select().from(E).where(eq(E.companyId, ctx.company.id)).orderBy(asc(E.name));
    return { data: rows.map(expenseCategoryToWire) };
  },

  async createExpenseCategory(ctx) {
    const cols = expenseCategoryColumns(ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      await assertNameFree(tx, ctx.company.id, cols.name);
      const [created] = await tx.insert(E).values({ id: newId('exc'), companyId: ctx.company.id, ...cols }).returning();
      await audit(tx, ctx.user, ctx.company.id, 'expense_category', 'created', created, created.name, { after: expenseCategoryToWire(created) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return expenseCategoryToWire(row);
  },

  async saveExpenseCategory(ctx) {
    const current = await findExpenseCategory(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const cols = expenseCategoryColumns(ctx.body, current);
    const row = await ctx.db.transaction(async (tx) => {
      await assertNameFree(tx, ctx.company.id, cols.name, current.id);
      const [updated] = await tx
        .update(E)
        .set({ ...cols, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(E.id, current.id), eq(E.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await audit(tx, ctx.user, ctx.company.id, 'expense_category', 'updated', updated, updated.name, {
        before: expenseCategoryToWire(current),
        after: expenseCategoryToWire(updated),
      });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return expenseCategoryToWire(row);
  },

  async removeExpenseCategory(ctx) {
    const current = await findExpenseCategory(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const used = await firstUse(ctx.db, [['expenses', sql`select 1 from expenses where category_id = ${current.id} limit 1`]]);
    if (used) throw conflict('EXPENSE_CATEGORY_IN_USE', 'Expenses are filed under this category');
    await ctx.db.transaction(async (tx) => {
      await tx.delete(E).where(eq(E.id, current.id));
      await audit(tx, ctx.user, ctx.company.id, 'expense_category', 'deleted', current, current.name, { before: expenseCategoryToWire(current) });
    });
    return undefined;
  },
});
