import { and, desc, eq, ne } from 'drizzle-orm';
import { budgetVariance, budgetable, type Budget, type BudgetLine } from '@esmart/core/domain/budgets';
import { accountFor, type Book } from '@esmart/core/domain/ledger/accounts';
import { addDaysISO, businessDate, financialYearOf } from '@esmart/core/lib/date';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { forbidden, notFound, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { compact, versioned } from '../../lib/wire';
import { costCentreIssues } from './costCentres';
import { loadBook } from './book';

const B = schema.budgets;
type Row = typeof B.$inferSelect;

function toWire(r: Row): Schema<'Budget'> {
  return compact({ id: r.id, name: r.name, yearFrom: r.yearFrom, branchId: r.branchId, costCentreId: r.costCentreId, notes: r.notes, lines: r.lines as BudgetLine[], ...versioned(r) });
}

const core = (r: Row): Budget => ({ id: r.id, name: r.name, yearFrom: r.yearFrom, branchId: r.branchId ?? undefined, costCentreId: r.costCentreId ?? undefined, lines: r.lines as BudgetLine[] });

async function find(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(B).where(and(eq(B.companyId, companyId), eq(B.id, id)));
  if (!row) throw notFound('Budget');
  return row;
}

/** The accounts a budget can name: system ones, the company's own and its expense categories. */
async function chart(db: DbOrTx, companyId: string): Promise<Book> {
  const categories = await db.select({ id: schema.expenseCategories.id, name: schema.expenseCategories.name }).from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, companyId));
  const LA = schema.ledgerAccounts;
  const accounts = await db.select().from(LA).where(eq(LA.companyId, companyId));
  return { parties: [], paymentAccounts: [], expenseCategories: categories, ledgerAccounts: accounts.map((a) => ({ id: a.id, name: a.name, group: a.group })) } as Book;
}

async function columns(db: DbOrTx, company: typeof schema.companies.$inferSelect, body: Schema<'Budget'>, selfId?: string) {
  const issues: Issue[] = [];
  const block = (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });
  const name = body.name.trim();
  if (!name) block('name', 'Give the budget a name');
  const [same] = await db.select({ id: B.id }).from(B).where(and(eq(B.companyId, company.id), eq(B.name, name), selfId ? ne(B.id, selfId) : undefined));
  if (same) block('name', `There is already a budget called ${name}`);
  const fy = financialYearOf(body.yearFrom, company.fiscalYearStartMonth);
  if (fy.start !== body.yearFrom) block('yearFrom', `A budget plans a financial year, from its first day: ${fy.start}`);
  const book = await chart(db, company.id);
  const seen = new Set<string>();
  body.lines.forEach((l, i) => {
    if (!budgetable(l.account, book)) block(`lines[${i}].account`, `${accountFor(l.account, book)?.name ?? l.account} isn't an income or expense account`);
    if (seen.has(l.account)) block(`lines[${i}].account`, 'Each account is planned once');
    seen.add(l.account);
    if (l.months.length !== 12 || l.months.some((m) => !Number.isInteger(m) || m < 0)) block(`lines[${i}].months`, 'Twelve amounts, none below nothing');
  });
  if (body.branchId) {
    const [b] = await db.select({ id: schema.branches.id }).from(schema.branches).where(and(eq(schema.branches.companyId, company.id), eq(schema.branches.id, body.branchId)));
    if (!b) block('branchId', 'No such branch in this company');
  }
  issues.push(...(await costCentreIssues(db, company.id, [{ field: 'costCentreId', id: body.costCentreId }])));
  if (issues.length) throw unprocessable(issues);
  return {
    name,
    yearFrom: body.yearFrom,
    branchId: body.branchId || null,
    costCentreId: body.costCentreId || null,
    notes: body.notes?.trim() || null,
    lines: body.lines.map((l) => ({ account: l.account, months: l.months })),
  };
}

/** Budgets and the books against them (RULES 6.16). */
export const budgetHandlers = defineHandlers({
  async listBudgets(ctx) {
    const rows = await ctx.db.select().from(B).where(eq(B.companyId, ctx.company.id)).orderBy(desc(B.yearFrom), B.name);
    return { data: rows.map(toWire) };
  },

  async createBudget(ctx) {
    const cols = await columns(ctx.db, ctx.company, ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      const [created] = await tx.insert(B).values({ id: newId('bud'), companyId: ctx.company.id, createdBy: ctx.user.id, ...cols, createdAt: ctx.now, updatedAt: ctx.now }).returning();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'budget', entityId: created.id, entityLabel: created.name, version: created.version });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return toWire(row);
  },

  async getBudget(ctx) {
    const row = await find(ctx.db, ctx.company.id, ctx.params.id);
    setEtag(ctx.reply, row.version);
    return toWire(row);
  },

  async saveBudget(ctx) {
    const current = await find(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const cols = await columns(ctx.db, ctx.company, ctx.body, current.id);
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx.update(B).set({ ...cols, version: current.version + 1, updatedAt: ctx.now }).where(and(eq(B.id, current.id), eq(B.version, current.version))).returning();
      if (!updated) throw preconditionFailed();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'updated', entityType: 'budget', entityId: updated.id, entityLabel: updated.name, version: updated.version });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return toWire(row);
  },

  async removeBudget(ctx) {
    const current = await find(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    await ctx.db.transaction(async (tx) => {
      const deleted = await tx.delete(B).where(and(eq(B.id, current.id), eq(B.version, current.version))).returning({ id: B.id });
      if (!deleted.length) throw preconditionFailed();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'deleted', entityType: 'budget', entityId: current.id, entityLabel: current.name, version: current.version + 1, deleted: true });
    });
    return undefined;
  },

  async getBudgetVariance(ctx) {
    if (ctx.user.branchIds.length) {
      const branches = await ctx.db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.companyId, ctx.company.id));
      if (branches.some((b) => !ctx.user.branchIds.includes(b.id))) throw forbidden('BOOKS_ALL_BRANCHES', 'The books cover every branch; ask an owner or admin');
    }
    const row = await find(ctx.db, ctx.company.id, ctx.params.id);
    const yearEnd = addDaysISO(financialYearOf(row.yearFrom, ctx.company.fiscalYearStartMonth).end, 0);
    const today = businessDate(ctx.now);
    const from = ctx.query.from ?? row.yearFrom;
    // To date, for a year still running.
    const to = ctx.query.to ?? (today < yearEnd ? today : yearEnd);
    const { postings, book } = await loadBook({ db: ctx.db, company: ctx.company, user: ctx.user, now: ctx.now, from, to });
    const v = budgetVariance(core(row), postings, book, { from, to });
    return {
      ...v,
      rows: v.rows.map((r) => {
        const a = accountFor(r.account, book);
        return { ...r, account: { key: r.account, name: a?.name ?? r.account, group: a?.group ?? 'indirectExpenses' } };
      }),
    };
  },
});
