import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
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
 * drafts nor cancelled or rejected. Customers owe on invoices; the company
 * owes suppliers on purchase bills.
 */
export type PartyBalance = { outstanding: number; overdue: number; advance: number };

const CLOSED = ['draft', 'cancelled', 'rejected'] as const;

export async function partyBalances(
  db: DbOrTx,
  companyId: string,
  parties: { id: string; kind: 'customer' | 'supplier' }[],
  today: string,
): Promise<Map<string, PartyBalance>> {
  const out = new Map<string, PartyBalance>(parties.map((p) => [p.id, { outstanding: 0, overdue: 0, advance: 0 }]));
  if (!parties.length) return out;
  const ids = parties.map((p) => p.id);
  const d = schema.documents;
  const open = sql`greatest(${d.grandTotalMinor} - ${d.amountPaidMinor}, 0)`;
  const docs = await db
    .select({
      partyId: d.partyId,
      kind: d.kind,
      outstanding: sql<number>`coalesce(sum(${open}), 0)::bigint`,
      overdue: sql<number>`coalesce(sum(case when ${d.dueDate} < ${today} then ${open} else 0 end), 0)::bigint`,
    })
    .from(d)
    .where(and(eq(d.companyId, companyId), inArray(d.partyId, ids), inArray(d.kind, ['invoice', 'purchaseBill']), notInArray(d.status, [...CLOSED])))
    .groupBy(d.partyId, d.kind);
  const kindOf = new Map(parties.map((p) => [p.id, p.kind]));
  for (const r of docs) {
    const wanted = kindOf.get(r.partyId) === 'supplier' ? 'purchaseBill' : 'invoice';
    if (r.kind !== wanted) continue;
    const b = out.get(r.partyId)!;
    b.outstanding += Number(r.outstanding);
    b.overdue += Number(r.overdue);
  }

  const p = schema.payments;
  const pays = await db
    .select({ partyId: p.partyId, direction: p.direction, advance: sql<number>`coalesce(sum(${p.unallocatedMinor}), 0)::bigint` })
    .from(p)
    .where(and(eq(p.companyId, companyId), inArray(p.partyId, ids)))
    .groupBy(p.partyId, p.direction);
  for (const r of pays) {
    const wanted = kindOf.get(r.partyId) === 'supplier' ? 'paid' : 'received';
    if (r.direction === wanted) out.get(r.partyId)!.advance += Number(r.advance);
  }
  return out;
}
