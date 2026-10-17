import { and, eq, exists, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { RawBody, defineHandlers, type Ctx } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { notFound } from '../../http/errors';
import { keyset } from '../../http/pagination';
import type { DbOrTx } from '../../lib/audit';
import { deletePayment, assertDirectionAllowed, linkPaymentAttachments, writePayment, type PaymentInput } from './engine';
import { receiptHtml } from './receipt';
import { paymentsToWire, type PaymentRow } from './wire';

const PAY = schema.payments;
type AnyCtx = Pick<Ctx<'getPayment'>, 'company' | 'user' | 'db' | 'now' | 'deps'>;

/** A payment in the caller's company, or 404. Payments made need the payables module. */
async function findPayment(ctx: AnyCtx, db: DbOrTx, id: string, opts: { lock?: boolean } = {}): Promise<PaymentRow> {
  const q = db.select().from(PAY).where(and(eq(PAY.companyId, ctx.company.id), eq(PAY.id, id)));
  const [row] = opts.lock ? await q.for('update') : await q;
  if (!row || (ctx.user.branchIds.length && !ctx.user.branchIds.includes(row.branchId))) throw notFound('Payment');
  assertDirectionAllowed(ctx.company, row.direction);
  return row;
}

async function toWire(ctx: AnyCtx, row: PaymentRow) {
  const [p] = await paymentsToWire(ctx.db, [row], ctx.company.baseCurrency.trim());
  return p;
}

function inputOf(body: Schema<'Payment'>): PaymentInput {
  return {
    direction: body.direction,
    partyId: body.partyId,
    branchId: body.branchId,
    date: body.date,
    amountMinor: body.amount.minor,
    amountCurrency: body.amount.currency,
    currency: body.currency,
    exchangeRate: body.exchangeRate,
    method: body.method,
    reference: body.reference,
    accountId: body.accountId,
    notes: body.notes,
    allocations: (body.allocations ?? []).map((a) => ({ documentId: a.documentId, amountMinor: a.amount.minor, currency: a.amount.currency })),
  };
}

/**
 * Payments: listPayments, createPayment, getPayment, savePayment,
 * removePayment, getPaymentReceiptPdf.
 */
export const paymentsHandlers = defineHandlers({
  async listPayments(ctx) {
    const q = ctx.query;
    if (q.direction) assertDirectionAllowed(ctx.company, q.direction);
    const filters: (SQL | undefined)[] = [eq(PAY.companyId, ctx.company.id)];
    if (q.direction) filters.push(eq(PAY.direction, q.direction));
    if (q.partyId) filters.push(eq(PAY.partyId, q.partyId));
    if (q.method) filters.push(eq(PAY.method, q.method));
    if (q.accountId) filters.push(eq(PAY.accountId, q.accountId));
    if (q.branchId) filters.push(eq(PAY.branchId, q.branchId));
    if (ctx.user.branchIds.length) filters.push(inArray(PAY.branchId, ctx.user.branchIds));
    if (q.from) filters.push(gte(PAY.date, q.from));
    if (q.to) filters.push(lte(PAY.date, q.to));
    if (q.documentId) {
      const A = schema.paymentAllocations;
      filters.push(exists(ctx.db.select({ one: sql`1` }).from(A).where(and(eq(A.paymentId, PAY.id), eq(A.documentId, q.documentId)))));
    }
    if (q.q) {
      const like = `%${q.q.trim()}%`;
      const P = schema.parties;
      filters.push(or(ilike(PAY.number, like), ilike(PAY.reference, like), exists(ctx.db.select({ one: sql`1` }).from(P).where(and(eq(P.id, PAY.partyId), ilike(P.name, like))))));
    }
    const k = keyset({ cursor: q.cursor, limit: q.limit, sort: PAY.date, id: PAY.id, order: 'desc' });
    const rows = await ctx.db
      .select()
      .from(PAY)
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    return k.page(await paymentsToWire(ctx.db, rows.slice(0, k.take - 1), ctx.company.baseCurrency.trim()), rows);
  },

  async createPayment(ctx) {
    assertDirectionAllowed(ctx.company, ctx.body.direction);
    const row = await ctx.db.transaction(async (tx) => {
      const created = await writePayment(tx, ctx.deps, ctx.company, ctx.user, inputOf(ctx.body), { now: ctx.now });
      await linkPaymentAttachments(tx, ctx.company.id, created.id, ctx.body.attachmentIds);
      return created;
    });
    setEtag(ctx.reply, row.version);
    return toWire(ctx, row);
  },

  async getPayment(ctx) {
    const row = await findPayment(ctx, ctx.db, ctx.params.id);
    setEtag(ctx.reply, row.version);
    return toWire(ctx, row);
  },

  async savePayment(ctx) {
    assertDirectionAllowed(ctx.company, ctx.body.direction);
    const row = await ctx.db.transaction(async (tx) => {
      const current = await findPayment(ctx, tx, ctx.params.id, { lock: true });
      checkIfMatch(ctx.req, current.version);
      const saved = await writePayment(tx, ctx.deps, ctx.company, ctx.user, inputOf(ctx.body), { now: ctx.now, existing: current });
      await linkPaymentAttachments(tx, ctx.company.id, saved.id, ctx.body.attachmentIds);
      return saved;
    });
    setEtag(ctx.reply, row.version);
    return toWire(ctx, row);
  },

  async removePayment(ctx) {
    await ctx.db.transaction(async (tx) => {
      const current = await findPayment(ctx, tx, ctx.params.id, { lock: true });
      checkIfMatch(ctx.req, current.version);
      await deletePayment(tx, ctx.company, ctx.user, current, ctx.now);
    });
    return undefined;
  },

  async getPaymentReceiptPdf(ctx) {
    const row = await findPayment(ctx, ctx.db, ctx.params.id);
    const html = await receiptHtml(ctx.db, ctx.company, await toWire(ctx, row));
    const pdf = await ctx.deps.providers.pdf.render(html);
    return new RawBody(pdf, 'application/pdf', `${row.number.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`);
  },
});
