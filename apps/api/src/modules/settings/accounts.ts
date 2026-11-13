import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { accountBalances } from '@esmart/core/domain/paymentAccounts';
import type { Expense, Payment, PaymentAccount, Voucher } from '@esmart/core/types';
import { schema } from '@esmart/db';
import { defineHandlers, type AuthUser, type CompanyRow } from '../../context';
import { rateToBase } from '../documents/engine';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, forbidden, notFound, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { notify } from '../../lib/notify';
import { businessDate } from '@esmart/core/lib/date';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { audit, firstUse } from './shared';
import { assertOpeningOpen, ledgerKeyUse } from '../books/usage';
import { paymentAccountToWire } from './wire';
import { invoiceBankColumns } from '../companies/wire';

const A = schema.paymentAccounts;
type AccountRow = typeof A.$inferSelect;

async function findAccount(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(A).where(and(eq(A.companyId, companyId), eq(A.id, id)));
  if (!row) throw notFound('Payment account');
  return row;
}

/**
 * Current balances through core's `accountBalances`: opening + received −
 * paid − expenses ± contra and journal lines on the account. SQL sums each
 * account's movements (rounding each row to base minor units first, as core
 * does), and core applies the signs.
 */
export async function paymentAccountBalances(db: DbOrTx, companyId: string, accounts: AccountRow[]): Promise<Record<string, number>> {
  if (!accounts.length) return {};
  const p = schema.payments;
  const e = schema.expenses;
  const V = schema.vouchers;
  const [pays, exps, moved] = await Promise.all([
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
    db
      .select({ account: sql<string>`l->>'account'`, debit: sql<string>`coalesce(sum((l->>'debitMinor')::bigint), 0)`, credit: sql<string>`coalesce(sum((l->>'creditMinor')::bigint), 0)` })
      .from(sql`${V}, jsonb_array_elements(${V.lines}) as l`)
      .where(and(eq(V.companyId, companyId), eq(V.status, 'posted'), sql`l->>'account' like 'pay:%'`))
      .groupBy(sql`l->>'account'`),
  ]);
  const coreAccounts = accounts.map((a) => ({ id: a.id, openingBalance: { minor: a.openingBalanceMinor, currency: a.currency.trim() }, openingRate: Number(a.openingRate) }) as PaymentAccount);
  const corePayments = pays.map((r) => ({ accountId: r.accountId, direction: r.direction, amount: { minor: Number(r.total) }, exchangeRate: 1 }) as Payment);
  const coreExpenses = exps.map((r) => ({ accountId: r.accountId, amount: { minor: Number(r.total) }, exchangeRate: 1 }) as Expense);
  const coreVouchers = [{ lines: moved.map((r) => ({ account: r.account, debit: { minor: Number(r.debit) }, credit: { minor: Number(r.credit) } })) } as Pick<Voucher, 'lines'>];
  return accountBalances(coreAccounts, corePayments, coreExpenses, coreVouchers);
}

async function toWire(db: DbOrTx, row: AccountRow, base: string) {
  const balances = await paymentAccountBalances(db, row.companyId, [row]);
  return paymentAccountToWire(row, balances[row.id] ?? row.openingBalanceMinor, base);
}

/**
 * The opening balance's rate to base on the day it was counted: a foreign-currency account's
 * opening is then the same in base everywhere (balances, the books). 422 when no rate is on file.
 */
async function openingRateFor(db: DbOrTx, company: CompanyRow, body: Schema<'PaymentAccount'>, today: string): Promise<string> {
  const base = company.baseCurrency.trim();
  if (body.currency === base || !body.openingBalance.minor) return '1';
  const on = body.openingBalanceDate ?? today;
  const rate = await rateToBase(db, company.id, body.currency, base, on);
  if (!rate) throw unprocessable([{ field: 'openingBalance', message: `No ${body.currency}→${base} rate on or before ${on}; add one in exchange rates first`, severity: 'blocking' }]);
  return String(rate);
}

async function validate(db: DbOrTx, body: Schema<'PaymentAccount'>, today: string) {
  const issues: Issue[] = [];
  if (!body.name.trim()) issues.push({ field: 'name', message: 'Name is required', severity: 'blocking' });
  if (body.openingBalance.currency !== body.currency) {
    issues.push({ field: 'openingBalance.currency', message: `Must be in the account's currency (${body.currency})`, severity: 'blocking' });
  }
  if (body.openingBalanceDate && body.openingBalanceDate > today) {
    issues.push({ field: 'openingBalanceDate', message: 'Opening balance date cannot be in the future', severity: 'blocking' });
  }
  const [cur] = await db.select().from(schema.currencies).where(eq(schema.currencies.code, body.currency));
  if (!cur) issues.push({ field: 'currency', message: `Unknown currency ${body.currency}`, severity: 'blocking' });
  // The same shapes the business profile checked when these were typed there.
  if (body.type === 'bank' && body.ifsc?.trim() && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(body.ifsc.trim())) {
    issues.push({ field: 'ifsc', message: 'An IFSC is 4 letters, a 0, then 6 letters or digits', severity: 'blocking' });
  }
  if (body.type !== 'cash' && body.upiId?.trim() && !/^[A-Za-z0-9.\-_]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$/.test(body.upiId.trim())) {
    issues.push({ field: 'upiId', message: 'A UPI ID looks like name@bank', severity: 'blocking' });
  }
  if (issues.length) throw unprocessable(issues);
}

function columns(body: Schema<'PaymentAccount'>) {
  const text = (v?: string) => v?.trim() || null;
  // A cash account has no bank details; a wallet keeps only its holder and UPI ID.
  const bank = body.type === 'bank';
  return {
    name: body.name.trim(),
    type: body.type,
    currency: body.currency,
    accountNumber: text(body.accountNumber),
    accountHolderName: body.type === 'cash' ? null : text(body.accountHolderName),
    bankName: bank ? text(body.bankName) : null,
    branchName: bank ? text(body.branchName) : null,
    ifsc: bank ? (text(body.ifsc)?.toUpperCase() ?? null) : null,
    upiId: body.type === 'cash' ? null : (text(body.upiId)?.toLowerCase() ?? null),
    openingBalanceMinor: body.openingBalance.minor,
    openingBalanceDate: body.openingBalanceDate ?? null,
  };
}

/** What has moved money through an account, if anything: then its type and currency are fixed. */
function accountUse(db: DbOrTx, id: string) {
  return firstUse(db, [
    ['payments', sql`select 1 from payments where account_id = ${id} limit 1`],
    ['expenses', sql`select 1 from expenses where account_id = ${id} limit 1`],
    // Transfers, GST challans and journals carry it as a `pay:<id>` voucher line.
    ['transfers or journals', sql`select 1 from vouchers v, jsonb_array_elements(v.lines) l where l->>'account' = ${`pay:${id}`} limit 1`],
    ['bank statements', sql`select 1 from bank_statements where account_id = ${id} limit 1`],
  ]);
}

/**
 * The company whose invoices are linked to this account keeps a copy of its details: bring the copy
 * in step. (The linked account can't be deleted or change type.) The company's version is left
 * alone: the copy is derived, and bumping it would fail the next profile save.
 */
async function syncInvoiceBank(tx: DbOrTx, companyId: string, account: AccountRow, now: Date) {
  const C = schema.companies;
  await tx
    .update(C)
    .set({ ...invoiceBankColumns(account), updatedAt: now })
    .where(and(eq(C.id, companyId), eq(C.bankPaymentAccountId, account.id)));
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
    return { data: rows.map((r) => paymentAccountToWire(r, balances[r.id] ?? r.openingBalanceMinor, ctx.company.baseCurrency.trim())) };
  },

  async createPaymentAccount(ctx) {
    await validate(ctx.db, ctx.body, businessDate(ctx.now));
    // An opening balance sits at the start of the books (or the day before its date): not inside closed ones.
    if (ctx.body.openingBalance.minor) assertOpeningOpen(ctx.company, ctx.body.openingBalanceDate);
    const row = await ctx.db.transaction(async (tx) => {
      // The company's first account is its default whatever the body says.
      const [existingDefault] = await tx.select({ id: A.id }).from(A).where(and(eq(A.companyId, ctx.company.id), eq(A.isDefault, true)));
      const isDefault = !!ctx.body.isDefault || !existingDefault;
      const id = newId('pac');
      if (isDefault) await clearOtherDefaults(tx, ctx.user, ctx.company.id, id, ctx.now);
      const [created] = await tx.insert(A).values({ id, companyId: ctx.company.id, ...columns(ctx.body), openingRate: await openingRateFor(tx, ctx.company, ctx.body, businessDate(ctx.now)), isDefault }).returning();
      await audit(tx, ctx.user, ctx.company.id, 'payment_account', 'created', created, created.name, { after: paymentAccountToWire(created, created.openingBalanceMinor) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return toWire(ctx.db, row, ctx.company.baseCurrency.trim());
  },

  async savePaymentAccount(ctx) {
    const current = await findAccount(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    await validate(ctx.db, ctx.body, businessDate(ctx.now));
    // The opening balance is the books' starting point: inside closed books, neither the old one nor the new one moves.
    const openingChanged = ctx.body.openingBalance.minor !== current.openingBalanceMinor || (ctx.body.openingBalanceDate ?? null) !== (current.openingBalanceDate ?? null) || ctx.body.currency !== current.currency.trim();
    if (openingChanged) {
      if (current.openingBalanceMinor) assertOpeningOpen(ctx.company, current.openingBalanceDate);
      if (ctx.body.openingBalance.minor) assertOpeningOpen(ctx.company, ctx.body.openingBalanceDate);
    }
    // The account printed on invoices is where customers send money: changing where it points is the
    // owner's call, and the owners hear of it.
    const printed = ctx.company.bankPaymentAccountId === current.id;
    const bankChanged = printed && JSON.stringify(invoiceBankColumns(current)) !== JSON.stringify(invoiceBankColumns({ ...current, ...columns(ctx.body) }));
    if (bankChanged && !['owner', 'admin'].includes(ctx.user.role)) {
      throw forbidden('BANK_DETAILS_ROLE', 'Your invoices print this account’s bank details; only an owner or admin can change them');
    }
    // Accounts with money through them keep their currency and type: past
    // balances are in that currency, and past payments used methods the type allows.
    const currencyChanged = ctx.body.currency !== current.currency.trim();
    const typeChanged = ctx.body.type !== current.type;
    if (typeChanged && ctx.company.bankPaymentAccountId === current.id) {
      throw unprocessable([{ field: 'type', message: 'Your invoices print this account; pick another under Business profile, bank details first', severity: 'blocking' }]);
    }
    if (currencyChanged || typeChanged) {
      const used = await accountUse(ctx.db, current.id);
      if (used) {
        const issues: Issue[] = [];
        if (currencyChanged) issues.push({ field: 'currency', message: `This account has ${used}; its currency can't change`, severity: 'blocking' });
        if (typeChanged) issues.push({ field: 'type', message: `This account has ${used}; its type can't change`, severity: 'blocking' });
        throw unprocessable(issues);
      }
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
        // The opening's rate is taken once: re-reading it on a rename would move the opening balance.
        .set({ ...columns(ctx.body), openingRate: openingChanged ? await openingRateFor(tx, ctx.company, ctx.body, businessDate(ctx.now)) : current.openingRate, isDefault, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(A.id, current.id), eq(A.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await audit(tx, ctx.user, ctx.company.id, 'payment_account', 'updated', updated, updated.name, {
        before: paymentAccountToWire(current, current.openingBalanceMinor),
        after: paymentAccountToWire(updated, updated.openingBalanceMinor),
      });
      await syncInvoiceBank(tx, ctx.company.id, updated, ctx.now);
      if (bankChanged) {
        await notify(tx, ctx.deps, {
          companyId: ctx.company.id,
          kind: 'system',
          title: 'The bank details on your invoices changed',
          body: `${ctx.user.name} changed ${updated.name}: invoices now ask customers to pay ${updated.bankName ?? ''} ${updated.accountNumber ? `account ending ${updated.accountNumber.slice(-4)}` : ''}${updated.upiId ? ` / UPI ${updated.upiId}` : ''}.`.replace(/\s+/g, ' '),
          entityType: 'payment_account',
          entityId: updated.id,
        });
      }
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return toWire(ctx.db, row, ctx.company.baseCurrency.trim());
  },

  async removePaymentAccount(ctx) {
    const current = await findAccount(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const used = await accountUse(ctx.db, current.id);
    if (used) throw conflict('PAYMENT_ACCOUNT_IN_USE', `This account has ${used}; it can't be deleted`);
    if (ctx.company.bankPaymentAccountId === current.id) {
      throw conflict('PAYMENT_ACCOUNT_IN_USE', 'Your invoices print this account; pick another under Business profile, bank details first');
    }
    // Contras and journals name it by key with no foreign key; deleting it would leave their lines posting to nothing.
    const named = (await ledgerKeyUse(ctx.db, ctx.company.id, `pay:${current.id}`)) ?? (current.openingBalanceMinor ? 'an opening balance' : null);
    if (named) throw conflict('PAYMENT_ACCOUNT_IN_USE', `This account is on ${named}; it can't be deleted`);
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
