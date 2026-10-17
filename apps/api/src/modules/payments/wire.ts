import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import type { DbOrTx } from '../../lib/audit';
import { compact, maybeMoney, money, versioned } from '../../lib/wire';

export type PaymentRow = typeof schema.payments.$inferSelect;

/**
 * Payments with their allocations, attachments and source, in one round
 * trip per table. A payment is `gateway` when a payment link recorded it.
 */
export async function paymentsToWire(db: DbOrTx, rows: PaymentRow[], baseCurrency: string): Promise<Schema<'Payment'>[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const A = schema.paymentAllocations;
  // Sequential on purpose: `db` may be a transaction, which runs one query at a time.
  const allocations = await db.select().from(A).where(inArray(A.paymentId, ids)).orderBy(A.id);
  const attachments = await db
    .select({ id: schema.attachments.id, entityId: schema.attachments.entityId })
    .from(schema.attachments)
    .where(and(eq(schema.attachments.entityType, 'payment'), inArray(schema.attachments.entityId, ids)))
    .orderBy(schema.attachments.uploadedAt);
  const links = await db
    .select({ paymentId: schema.paymentLinks.paymentId })
    .from(schema.paymentLinks)
    .where(and(isNotNull(schema.paymentLinks.paymentId), inArray(schema.paymentLinks.paymentId, ids)));
  const gateway = new Set(links.map((l) => l.paymentId));
  return rows.map((r) => {
    const currency = r.currency.trim();
    return compact({
      id: r.id,
      companyId: r.companyId,
      branchId: r.branchId,
      number: r.number,
      direction: r.direction,
      partyId: r.partyId,
      date: r.date,
      amount: money(r.amountMinor, currency),
      currency,
      exchangeRate: Number(r.exchangeRate),
      method: r.method,
      reference: r.reference,
      accountId: r.accountId,
      allocations: allocations
        .filter((a) => a.paymentId === r.id)
        .map((a) => ({ documentId: a.documentId, documentNumber: a.documentNumber, amount: money(a.amountMinor, currency) })),
      unallocated: money(r.unallocatedMinor, currency),
      fxGainLoss: maybeMoney(r.fxGainLossMinor, baseCurrency),
      source: gateway.has(r.id) ? ('gateway' as const) : ('manual' as const),
      notes: r.notes,
      attachmentIds: attachments.filter((a) => a.entityId === r.id).map((a) => a.id),
      createdBy: r.createdBy,
      ...versioned(r),
    });
  });
}
