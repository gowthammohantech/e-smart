import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { PAYABLE_KINDS, RECEIVABLE_KINDS } from '@esmart/core/domain/documentStates';
import { applyOpening } from '@esmart/core/domain/receivables';
import { openingOnSide } from '@esmart/core/domain/partyKinds';
import type { PartyKind } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { DbOrTx } from './audit';

/**
 * Party balances, computed in SQL over the columns the Payments module keeps
 * current:
 *
 * - `documents.amount_paid_minor` is the sum of that document's payment
 *   allocations;
 * - `payments.unallocated_minor` is what a payment has left over (an advance).
 *
 * Outstanding follows `@esmart/core/domain/receivables`: grand total minus
 * allocated payments, never below zero, over documents that are neither
 * drafts nor cancelled or rejected. Customers owe on invoices and debit
 * notes; the company owes suppliers on purchase bills and their debit notes.
 * The party's opening balance counts too, settled first by its advances.
 */
export type PartyBalance = { outstanding: number; overdue: number; advance: number };

const CLOSED = ['draft', 'cancelled', 'rejected'] as const;

export async function partyBalances(
  db: DbOrTx,
  companyId: string,
  parties: { id: string; kind: PartyKind }[],
  today: string,
  /** Which side to read a party that is both from; others read from their own. */
  side: 'customer' | 'supplier' = 'customer',
): Promise<Map<string, PartyBalance>> {
  const out = new Map<string, PartyBalance>(parties.map((p) => [p.id, { outstanding: 0, overdue: 0, advance: 0 }]));
  if (!parties.length) return out;
  const ids = parties.map((p) => p.id);
  const d = schema.documents;
  const open = sql`greatest(${d.grandTotalMinor} - ${d.amountPaidMinor}, 0)`;
  const p = schema.payments;
  // The four reads don't depend on each other: one round trip's wait instead of four.
  const [docs, pays, notes, openings] = await Promise.all([
    db
      .select({
        partyId: d.partyId,
        kind: d.kind,
        outstanding: sql<number>`coalesce(sum(${open}), 0)::bigint`,
        overdue: sql<number>`coalesce(sum(case when ${d.dueDate} < ${today} then ${open} else 0 end), 0)::bigint`,
      })
      .from(d)
      .where(and(eq(d.companyId, companyId), inArray(d.partyId, ids), inArray(d.kind, PAYABLE_KINDS), notInArray(d.status, [...CLOSED])))
      .groupBy(d.partyId, d.kind),
    db
      .select({ partyId: p.partyId, direction: p.direction, advance: sql<number>`coalesce(sum(${p.unallocatedMinor}), 0)::bigint` })
      .from(p)
      .where(and(eq(p.companyId, companyId), inArray(p.partyId, ids)))
      .groupBy(p.partyId, p.direction),
    // A direct credit note, against no one invoice or bill, is credit the party holds until it is
    // applied: counted with their advances. TDS a supplier credit note gives back was never theirs.
    db
      // Less what has been applied to an invoice or bill since (the adjustment entry).
      .select({
        partyId: d.partyId,
        kind: d.kind,
        total: sql<number>`coalesce(sum(${d.grandTotalMinor} - coalesce(${d.tdsAmountMinor}, 0) - coalesce((select sum(ca.amount_minor) from credit_applications ca where ca.note_id = "documents"."id"), 0)), 0)::bigint`,
      })
      .from(d)
      .where(and(eq(d.companyId, companyId), inArray(d.partyId, ids), inArray(d.kind, ['creditNote', 'supplierCreditNote']), isNull(d.sourceDocumentId), notInArray(d.status, [...CLOSED, 'requested'])))
      .groupBy(d.partyId, d.kind),
    db.select({ id: schema.parties.id, opening: schema.parties.openingBalanceMinor, openingSide: schema.parties.openingBalanceSide }).from(schema.parties).where(inArray(schema.parties.id, ids)),
  ]);
  // The side each party is read from: a supplier's own, a customer's or general contact's the customer
  // side, and a party that is both the one asked for.
  const sideOf = new Map(parties.map((x) => [x.id, x.kind === 'both' ? side : x.kind === 'supplier' ? 'supplier' : 'customer']));
  const kindOf = new Map(parties.map((x) => [x.id, sideOf.get(x.id)]));
  for (const r of docs) {
    // A customer owes on invoices and debit notes; the company owes a supplier on bills and their debit notes.
    if (RECEIVABLE_KINDS.includes(r.kind) === (kindOf.get(r.partyId) === 'supplier')) continue;
    const b = out.get(r.partyId)!;
    b.outstanding += Number(r.outstanding);
    b.overdue += Number(r.overdue);
  }
  for (const r of pays) {
    const wanted = kindOf.get(r.partyId) === 'supplier' ? 'paid' : 'received';
    if (r.direction === wanted) out.get(r.partyId)!.advance += Number(r.advance);
  }
  for (const r of notes) {
    if ((r.kind === 'supplierCreditNote') === (kindOf.get(r.partyId) === 'supplier')) out.get(r.partyId)!.advance += Number(r.total);
  }
  // Credit notes that, with what was paid, came to more than their invoice: the excess is credit too.
  const withLinked = await db
    .selectDistinct({ partyId: d.partyId, currency: d.currency })
    .from(d)
    .where(and(eq(d.companyId, companyId), inArray(d.partyId, ids), inArray(d.kind, ['creditNote', 'supplierCreditNote']), isNotNull(d.sourceDocumentId), notInArray(d.status, [...CLOSED, 'requested'])));
  for (const r of withLinked) {
    const partySide = kindOf.get(r.partyId) === 'supplier' ? 'supplier' : 'customer';
    const extra = await excessOfLinkedNotes(db, companyId, r.partyId, partySide, r.currency.trim());
    out.get(r.partyId)!.advance += extra.reduce((a, x) => a + x.left, 0);
  }
  // Last: the opening balance is settled first from the advances counted above.
  for (const r of openings) {
    const b = out.get(r.id)!;
    const party = parties.find((x) => x.id === r.id)!;
    const signed = openingOnSide({ kind: party.kind, openingBalance: { minor: Number(r.opening ?? 0) }, openingBalanceSide: r.openingSide ?? undefined }, sideOf.get(r.id)!);
    const { opening, advance } = applyOpening(signed, b.advance);
    b.outstanding += opening;
    b.advance = advance;
  }
  return out;
}

/**
 * Credit notes (or returns) against an invoice or bill that, with what was paid on it, came to more
 * than it was for: the excess is the party's credit, to set against another document like a direct
 * note's (money audit A15). Shared among the source's notes, latest first, less what each has been
 * applied elsewhere already.
 */
export async function excessOfLinkedNotes(db: DbOrTx, companyId: string, partyId: string, side: 'customer' | 'supplier', base: string, branches: string[] = []) {
  const D = schema.documents;
  const CA = schema.creditApplications;
  const S = alias(D, 'source');
  const noteKind = side === 'customer' ? 'creditNote' : 'supplierCreditNote';
  const rows = await db
    .select({ id: D.id, number: D.number, date: D.date, total: D.grandTotalMinor, tds: D.tdsAmountMinor, sourceId: D.sourceDocumentId, sourceTotal: S.grandTotalMinor, applied: sql<number>`coalesce((select sum(ca.amount_minor) from credit_applications ca where ca.note_id = "documents"."id"), 0)::bigint` })
    .from(D)
    .innerJoin(S, eq(S.id, D.sourceDocumentId))
    .where(and(eq(D.companyId, companyId), eq(D.partyId, partyId), eq(D.kind, noteKind), notInArray(D.status, [...CLOSED, 'requested']), eq(D.currency, base), notInArray(S.status, [...CLOSED, 'requested']), branches.length ? inArray(D.branchId, branches) : undefined))
    .orderBy(D.date, D.id);
  if (!rows.length) return [];
  const sourceIds = [...new Set(rows.map((r) => r.sourceId!))];
  const A = schema.paymentAllocations;
  const settled = await db
    .select({ documentId: A.documentId, total: sql<number>`coalesce(sum(${A.amountMinor} + ${A.tdsMinor} + ${A.discountMinor} + ${A.writeOffMinor}), 0)::bigint` })
    .from(A)
    .where(inArray(A.documentId, sourceIds))
    .groupBy(A.documentId);
  const appliedTo = await db.select({ documentId: CA.documentId, total: sql<number>`coalesce(sum(${CA.amountMinor}), 0)::bigint` }).from(CA).where(inArray(CA.documentId, sourceIds)).groupBy(CA.documentId);
  const out: { n: { id: string; number: string; date: string; total: number; tds: number }; left: number }[] = [];
  for (const sid of sourceIds) {
    const mine = rows.filter((r) => r.sourceId === sid);
    const credited = mine.reduce((a, r) => a + r.total - r.tds, 0);
    const paid = Number(settled.find((x) => x.documentId === sid)?.total ?? 0) + Number(appliedTo.find((x) => x.documentId === sid)?.total ?? 0);
    let excess = Math.max(paid + credited - mine[0].sourceTotal, 0) - mine.reduce((a, r) => a + Number(r.applied), 0);
    for (const r of [...mine].reverse()) {
      if (excess <= 0) break;
      const left = Math.min(r.total - r.tds - Number(r.applied), excess);
      if (left > 0) out.push({ n: { id: r.id, number: r.number, date: r.date, total: r.total, tds: r.tds }, left });
      excess -= Math.max(left, 0);
    }
  }
  return out;
}

