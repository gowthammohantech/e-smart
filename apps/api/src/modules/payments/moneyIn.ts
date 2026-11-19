import { and, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Schema } from '@esmart/api-contract';
import { moduleEnabled, type Module } from '@esmart/core/domain/plan';
import { schema } from '@esmart/db';
import { defineHandlers, type Ctx } from '../../context';
import { decode, encode } from '../../http/pagination';
import { money } from '../../lib/wire';
import { voucherFilters, vouchersToWire } from '../books/handlers';
import { paymentFilters } from './handlers';
import { paymentsToWire } from './wire';

const PAY = schema.payments;
const V = schema.vouchers;

type MoneyInQuery = Pick<Ctx<'listMoneyIn'>['query'], 'type' | 'partyId' | 'branchId' | 'from' | 'to' | 'q'>;
type AnyCtx = Pick<Ctx<'listMoneyIn'>, 'company' | 'user' | 'db'>;

/** Receipt vouchers are the books': a plan without them, or a business that switched them off, lists payments alone. */
const keepsBooks = (ctx: AnyCtx) => moduleEnabled(ctx.company.plan, ctx.company.disabledModules as Module[] | null, 'books');

/** What each table's list matches: payments received, and receipt vouchers (where the books are on). */
function moneyInFilters(ctx: AnyCtx, q: MoneyInQuery) {
  const payments = q.type === 'receipt' ? null : paymentFilters(ctx, { direction: 'received', partyId: q.partyId, branchId: q.branchId, from: q.from, to: q.to, q: q.q });
  const vouchers =
    q.type === 'payment' || !keepsBooks(ctx)
      ? null
      : [...voucherFilters(ctx, { kind: 'receipt', partyId: q.partyId, from: q.from, to: q.to, q: q.q }), q.branchId ? eq(V.branchId, q.branchId) : undefined];
  return { payments, vouchers };
}

/**
 * The two tables page by one cursor, (date, id) newest first. Ids compare byte by byte (COLLATE "C") in
 * both tables and in the merge here, so a page never skips or repeats a row whatever the database's collation.
 */
const byteId = (id: PgColumn) => sql`${id} collate "C"`;
function after(date: PgColumn, id: PgColumn, cursor: string | undefined): SQL | undefined {
  if (!cursor) return undefined;
  const [d, i] = decode(cursor).map(String);
  return or(lt(date, d), and(eq(date, d), sql`${byteId(id)} < ${i} collate "C"`));
}
const newestFirst = (a: { date: string; id: string }, b: { date: string; id: string }) =>
  a.date === b.date ? (a.id === b.id ? 0 : a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1;

export const moneyInHandlers = defineHandlers({
  async listMoneyIn(ctx) {
    const q = ctx.query;
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
    const f = moneyInFilters(ctx, q);
    // One more than a page from each: the merge then knows whether anything follows.
    const [payments, vouchers] = await Promise.all([
      f.payments
        ? ctx.db.select().from(PAY).where(and(...f.payments, after(PAY.date, PAY.id, q.cursor))).orderBy(desc(PAY.date), desc(byteId(PAY.id))).limit(limit + 1)
        : [],
      f.vouchers
        ? ctx.db.select().from(V).where(and(...f.vouchers, after(V.date, V.id, q.cursor))).orderBy(desc(V.date), desc(byteId(V.id))).limit(limit + 1)
        : [],
    ]);
    const merged = [
      ...payments.map((row) => ({ date: row.date, id: row.id, payment: row })),
      ...vouchers.map((row) => ({ date: row.date, id: row.id, voucher: row })),
    ].sort(newestFirst);
    const page = merged.slice(0, limit);
    const base = ctx.company.baseCurrency.trim();
    const [paymentWire, voucherWire] = await Promise.all([
      paymentsToWire(ctx.db, page.flatMap((r) => ('payment' in r ? [r.payment] : [])), base),
      vouchersToWire(ctx.db, page.flatMap((r) => ('voucher' in r ? [r.voucher] : [])), base),
    ]);
    const paymentById = new Map(paymentWire.map((p) => [p.id, p]));
    const voucherById = new Map(voucherWire.map((v) => [v.id, v]));
    const data: Schema<'MoneyInEntry'>[] = page.map((r) =>
      'payment' in r ? { type: 'payment', payment: paymentById.get(r.id) } : { type: 'receipt', voucher: voucherById.get(r.id) },
    );
    const last = page[page.length - 1];
    return { data, nextCursor: merged.length > limit && last ? encode([last.date, last.id]) : null };
  },

  async summarizeMoneyIn(ctx) {
    const base = ctx.company.baseCurrency.trim();
    const f = moneyInFilters(ctx, ctx.query);
    const [paid] = f.payments
      ? await ctx.db
          .select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(round(${PAY.amountMinor} * ${PAY.exchangeRate})), 0)::bigint` })
          .from(PAY)
          .where(and(...f.payments))
      : [{ count: 0, total: 0 }];
    const voucherRows = f.vouchers ? await ctx.db.select({ lines: V.lines }).from(V).where(and(...f.vouchers)) : [];
    let receiptTotal = 0;
    const byAccount = new Map<string, number>();
    for (const r of voucherRows) {
      for (const l of r.lines as { account: string; debitMinor: number; creditMinor: number }[]) {
        receiptTotal += l.debitMinor;
        if (l.creditMinor > 0) byAccount.set(l.account, (byAccount.get(l.account) ?? 0) + l.creditMinor);
      }
    }
    const paymentTotal = Number(paid.total);
    return {
      count: paid.count + voucherRows.length,
      total: money(paymentTotal + receiptTotal, base),
      payments: { count: paid.count, total: money(paymentTotal, base) },
      receipts: { count: voucherRows.length, total: money(receiptTotal, base) },
      byAccount: [...byAccount.entries()].sort((a, b) => b[1] - a[1]).map(([account, minor]) => ({ account, total: money(minor, base) })),
    };
  },
});
