import { and, eq, gt, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Schema } from '@esmart/api-contract';
import { inclusiveTax } from '@esmart/core/lib/money';
import { schema } from '@esmart/db';
import { defineHandlers, type Ctx } from '../../context';
import { pageInMemory } from '../../http/pagination';
import { money } from '../../lib/wire';

const PAY = schema.payments;
const A = schema.paymentAllocations;
const D = schema.documents;
const CA = schema.creditApplications;
const P = schema.parties;

type Adjustment = Schema<'Adjustment'>;
type Filters = Pick<Ctx<'listAdjustments'>['query'], 'partyId' | 'branchId' | 'from' | 'to' | 'q'>;
type AnyCtx = Pick<Ctx<'listAdjustments'>, 'company' | 'user' | 'db'>;

/**
 * Every adjustment the filters match, newest first. An advance used on a document: a payment's
 * allocation to one dated after it (money put on an invoice of that day or earlier settled it and was
 * never an advance), on the document's date, as the GST rules read it (RULES 8.13). A direct note
 * applied to a document: its credit application, on the date applied. Refunds aside.
 */
async function adjustments(ctx: AnyCtx, q: Filters): Promise<Adjustment[]> {
  const base = ctx.company.baseCurrency.trim();
  const branches = ctx.user.branchIds;
  const like = q.q?.trim() ? `%${q.q.trim()}%` : undefined;

  const advances = await ctx.db
    .select({
      id: A.id,
      amount: A.amountMinor,
      paymentId: PAY.id,
      paymentNumber: PAY.number,
      direction: PAY.direction,
      exchangeRate: PAY.exchangeRate,
      taxCategoryId: PAY.advanceTaxCategoryId,
      taxRate: PAY.advanceTaxRate,
      cessRate: PAY.advanceCessRate,
      reverseCharge: PAY.advanceReverseCharge,
      branchId: PAY.branchId,
      partyId: P.id,
      partyName: P.name,
      documentId: D.id,
      documentNumber: D.number,
      documentKind: D.kind,
      date: D.date,
    })
    .from(A)
    .innerJoin(PAY, eq(PAY.id, A.paymentId))
    .innerJoin(D, eq(D.id, A.documentId))
    .innerJoin(P, eq(P.id, PAY.partyId))
    .where(
      and(
        eq(PAY.companyId, ctx.company.id),
        sql`${D.date} > ${PAY.date}`,
        gt(A.amountMinor, 0),
        isNull(PAY.refundOfPaymentId),
        q.partyId ? eq(PAY.partyId, q.partyId) : undefined,
        q.branchId ? eq(PAY.branchId, q.branchId) : undefined,
        branches.length ? inArray(PAY.branchId, branches) : undefined,
        q.from ? gte(D.date, q.from) : undefined,
        q.to ? lte(D.date, q.to) : undefined,
        like ? or(ilike(P.name, like), ilike(PAY.number, like), ilike(D.number, like)) : undefined,
      ),
    );

  const N = alias(D, 'note');
  const notes = await ctx.db
    .select({
      id: CA.id,
      amount: CA.amountMinor,
      date: CA.date,
      noteId: N.id,
      noteNumber: N.number,
      noteKind: N.kind,
      branchId: N.branchId,
      partyId: P.id,
      partyName: P.name,
      documentId: D.id,
      documentNumber: D.number,
      documentKind: D.kind,
    })
    .from(CA)
    .innerJoin(N, eq(N.id, CA.noteId))
    .innerJoin(D, eq(D.id, CA.documentId))
    .innerJoin(P, eq(P.id, N.partyId))
    .where(
      and(
        eq(CA.companyId, ctx.company.id),
        q.partyId ? eq(N.partyId, q.partyId) : undefined,
        q.branchId ? eq(N.branchId, q.branchId) : undefined,
        branches.length ? inArray(N.branchId, branches) : undefined,
        q.from ? gte(CA.date, q.from) : undefined,
        q.to ? lte(CA.date, q.to) : undefined,
        like ? or(ilike(P.name, like), ilike(N.number, like), ilike(D.number, like)) : undefined,
      ),
    );

  const rows: Adjustment[] = [
    ...advances.map((a): Adjustment => {
      const minor = Math.round(a.amount * Number(a.exchangeRate || 1));
      const rate = Number(a.taxRate ?? 0) + Number(a.cessRate ?? 0);
      const taxed = !!a.taxCategoryId && !a.reverseCharge && rate > 0;
      return {
        id: `alloc:${a.id}`,
        kind: a.direction === 'received' ? 'advanceReceived' : 'advancePaid',
        date: a.date,
        partyId: a.partyId,
        partyName: a.partyName,
        branchId: a.branchId ?? undefined,
        sourceType: 'payment',
        sourceId: a.paymentId,
        sourceNumber: a.paymentNumber,
        documentId: a.documentId,
        documentNumber: a.documentNumber,
        documentKind: a.documentKind as Adjustment['documentKind'],
        amount: money(minor, base),
        ...(taxed && { gst: money(inclusiveTax({ minor, currency: base }, rate).minor, base) }),
      };
    }),
    ...notes.map(
      (n): Adjustment => ({
        id: `cap:${n.id}`,
        kind: n.noteKind === 'creditNote' ? 'creditNote' : 'supplierCreditNote',
        date: n.date,
        partyId: n.partyId,
        partyName: n.partyName,
        branchId: n.branchId ?? undefined,
        sourceType: 'note',
        sourceId: n.noteId,
        sourceNumber: n.noteNumber,
        documentId: n.documentId,
        documentNumber: n.documentNumber,
        documentKind: n.documentKind as Adjustment['documentKind'],
        amount: money(n.amount, base),
      }),
    ),
  ];
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

/** Payments: listAdjustments, summarizeAdjustments. */
export const adjustmentListHandlers = defineHandlers({
  async listAdjustments(ctx) {
    const rows = await adjustments(ctx, ctx.query);
    return pageInMemory(rows, { cursor: ctx.query.cursor, limit: ctx.query.limit, key: (r) => [r.date, r.id] });
  },

  async summarizeAdjustments(ctx) {
    const rows = await adjustments(ctx, ctx.query);
    return { count: rows.length, total: money(rows.reduce((a, r) => a + r.amount.minor, 0), ctx.company.baseCurrency.trim()) };
  },
});
