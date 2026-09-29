import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { accountBalances } from '@esmart/core/domain/paymentAccounts';
import type { Expense, Payment, PaymentAccount } from '@esmart/core/types';
import { schema } from '@esmart/db';
import { defineHandlers, type AuthUser } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, notFound, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { audit, firstUse } from './shared';
import { paymentAccountToWire } from './wire';

const A = schema.paymentAccounts;
type AccountRow = typeof A.$inferSelect;

async function findAccount(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(A).where(and(eq(A.companyId, companyId), eq(A.id, id)));
  if (!row) throw notFound('Payment account');
  return row;
}

/**
 * Current balances through core's `accountBalances`: opening + received −
 * paid − expenses. SQL sums each account's movements (rounding each row to
 * base minor units first, as core does), and core applies the signs.
 */
export async function paymentAccountBalances(db: DbOrTx, companyId: string, accounts: AccountRow[]): Promise<Record<string, number>> {
  if (!accounts.length) return {};
  const p = schema.payments;
  const e = schema.expenses;
  const [pays, exps] = await Promise.all([
    db
      .select({ accountId: p.accountId, direction: p.direction, total: sql<string>`coalesce(sum(round(${p.amountMinor} * ${p.exchangeRate})), 0)` })
      .from(p)
      .where(eq(p.companyId, companyId))
      .groupBy(p.accountId, p.direction),
    db
      .select({ accountId: e.accountId, total: sql<string>`coalesce(sum(round(${e.amountMinor} * ${e.exchangeRate})), 0)` })
      .from(e)
      .where(eq(e.companyId, companyId))
      .groupBy(e.accountId),
  ]);
  const coreAccounts = accounts.map((a) => ({ id: a.id, openingBalance: { minor: a.openingBalanceMinor, currency: a.currency.trim() } }) as PaymentAccount);
  const corePayments = pays.map((r) => ({ accountId: r.accountId, direction: r.direction, amount: { minor: Number(r.total) }, exchangeRate: 1 }) as Payment);
  const coreExpenses = exps.map((r) => ({ accountId: r.accountId, amount: { minor: Number(r.total) }, exchangeRate: 1 }) as Expense);
  return accountBalances(coreAccounts, corePayments, coreExpenses);
}

async function toWire(db: DbOrTx, row: AccountRow) {
  const balances = await paymentAccountBalances(db, row.companyId, [row]);
  return paymentAccountToWire(row, balances[row.id] ?? row.openingBalanceMinor);
}

async function validate(db: DbOrTx, body: Schema<'PaymentAccount'>) {
  const issues: Issue[] = [];
  if (!body.name.trim()) issues.push({ field: 'name', message: 'Name is required', severity: 'blocking' });
  if (body.openingBalance.currency !== body.currency) {
    issues.push({ field: 'openingBalance.currency', message: `Must be in the account's currency (${body.currency})`, severity: 'blocking' });
  }
  const [cur] = await db.select().from(schema.currencies).where(eq(schema.currencies.code, body.currency));
  if (!cur) issues.push({ field: 'currency', message: `Unknown currency ${body.currency}`, severity: 'blocking' });
  if (issues.length) throw unprocessable(issues);
}

function columns(body: Schema<'PaymentAccount'>) {
  return {
    name: body.name.trim(),
    type: body.type,
    currency: body.currency,
    accountNumber: body.accountNumber ?? null,
    openingBalanceMinor: body.openingBalance.minor,
  };
}

/** One default per company: making this one the default clears the others. */
async function clearOtherDefaults(tx: DbOrTx, user: AuthUser, companyId: string, keepId: string, now: Date) {
  const cleared = await tx
    .update(A)
    .set({ isDefault: false, version: sql`${A.version} + 1`, updatedAt: now })
    .where(and(eq(A.companyId, companyId), ne(A.id, keepId), eq(A.isDefault, true)))
    .returning();
  for (const r of cleared) await audit(tx, user, companyId, 'payment_account', 'updated', r, r.name, { after: paymentAccountToWire(r, r.openingBalanceMinor) });
}

export const accountHandlers = defineHandlers({
  async listPaymentAccounts(ctx) {
    const rows = await ctx.db.select().from(A).where(eq(A.companyId, ctx.company.id)).orderBy(desc(A.isDefault), asc(A.name));
    const balances = await paymentAccountBalances(ctx.db, ctx.company.id, rows);
    return { data: rows.map((r) => paymentAccountToWire(r, balances[r.id] ?? r.openingBalanceMinor)) };
  },

  async createPaymentAccount(ctx) {
    await validate(ctx.db, ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      // The company's first account is its default whatever the body says.
      const [existingDefault] = await tx.select({ id: A.id }).from(A).where(and(eq(A.companyId, ctx.company.id), eq(A.isDefault, true)));
      const isDefault = !!ctx.body.isDefault || !existingDefault;
      const id = newId('pac');
      if (isDefault) await clearOtherDefaults(tx, ctx.user, ctx.company.id, id, ctx.now);
      const [created] = await tx.insert(A).values({ id, companyId: ctx.company.id, ...columns(ctx.body), isDefault }).returning();
      await audit(tx, ctx.user, ctx.company.id, 'payment_account', 'created', created, created.name, { after: paymentAccountToWire(created, created.openingBalanceMinor) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return toWire(ctx.db, row);
  },

  async savePaymentAccount(ctx) {
    const current = await findAccount(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    await validate(ctx.db, ctx.body);
    // Accounts with money through them keep their currency: past balances are in it.
    if (ctx.body.currency !== current.currency.trim()) {
      const used = await firstUse(ctx.db, [
        ['payments', sql`select 1 from payments where account_id = ${current.id} limit 1`],
        ['expenses', sql`select 1 from expenses where account_id = ${current.id} limit 1`],
      ]);
      if (used) throw unprocessable([{ field: 'currency', message: `This account has ${used}; its currency can't change`, severity: 'blocking' }]);
    }
    // The default moves by making another account the default, never by unsetting it.
    if (current.isDefault && ctx.body.isDefault === false) {
      throw unprocessable([{ field: 'isDefault', message: 'Make another account the default instead', severity: 'blocking' }]);
    }
    const isDefault = ctx.body.isDefault ?? current.isDefault;
    const row = await ctx.db.transaction(async (tx) => {
      if (isDefault && !current.isDefault) await clearOtherDefaults(tx, ctx.user, ctx.company.id, current.id, ctx.now);
      const [updated] = await tx
        .update(A)
        .set({ ...columns(ctx.body), isDefault, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(A.id, current.id), eq(A.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await audit(tx, ctx.user, ctx.company.id, 'payment_account', 'updated', updated, updated.name, {
        before: paymentAccountToWire(current, current.openingBalanceMinor),
        after: paymentAccountToWire(updated, updated.openingBalanceMinor),
      });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return toWire(ctx.db, row);
  },

  async removePaymentAccount(ctx) {
    const current = await findAccount(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const used = await firstUse(ctx.db, [
      ['payments', sql`select 1 from payments where account_id = ${current.id} limit 1`],
      ['expenses', sql`select 1 from expenses where account_id = ${current.id} limit 1`],
    ]);
    if (used) throw conflict('PAYMENT_ACCOUNT_IN_USE', `This account has ${used}; it can't be deleted`);
    await ctx.db.transaction(async (tx) => {
      await tx.delete(A).where(eq(A.id, current.id));
      await audit(tx, ctx.user, ctx.company.id, 'payment_account', 'deleted', current, current.name, { before: paymentAccountToWire(current, current.openingBalanceMinor) });
      if (current.isDefault) {
        // Hand the default to the oldest remaining account, if any.
        const [next] = await tx.select().from(A).where(eq(A.companyId, ctx.company.id)).orderBy(asc(A.createdAt), asc(A.id)).limit(1);
        if (next) {
          const [promoted] = await tx.update(A).set({ isDefault: true, version: next.version + 1, updatedAt: ctx.now }).where(eq(A.id, next.id)).returning();
          await audit(tx, ctx.user, ctx.company.id, 'payment_account', 'updated', promoted, promoted.name, { after: paymentAccountToWire(promoted, promoted.openingBalanceMinor) });
        }
      }
    });
    return undefined;
  },
});
