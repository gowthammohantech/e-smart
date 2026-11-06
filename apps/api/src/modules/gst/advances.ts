import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import { advanceTaxEvents, type AdvanceEvent } from '@esmart/core/domain/advanceTax';
import { homeStateCode } from '@esmart/core/domain/taxEngine';
import type { Branch, Payment } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { CompanyRow } from '../../context';
import type { DbOrTx } from '../../lib/audit';
import { companyCore } from '../documents/engine';

const P = schema.payments;

/**
 * Tax on advances for services received up to `to` (in `branchIds`, when given): when each arose and
 * when invoices or refunds took it back (core advanceTaxEvents). GSTR-1 table 11 and 3B 3.1(a) read these.
 */
export async function loadAdvanceEvents(db: DbOrTx, company: CompanyRow, to: string, branchIds?: string[]): Promise<AdvanceEvent[]> {
  if (branchIds && !branchIds.length) return [];
  const rows = await db
    .select()
    .from(P)
    .where(and(eq(P.companyId, company.id), eq(P.direction, 'received'), isNotNull(P.advanceTaxCategoryId), lte(P.date, to), branchIds ? inArray(P.branchId, branchIds) : undefined));
  if (!rows.length) return [];
  const A = schema.paymentAllocations;
  const allocations = await db.select().from(A).where(inArray(A.paymentId, rows.map((r) => r.id)));
  // Paid back out of them (refund vouchers), up to the same day.
  const refunds = await db
    .select({ id: P.id, of: P.refundOfPaymentId, date: P.date, amountMinor: P.amountMinor })
    .from(P)
    .where(and(inArray(P.refundOfPaymentId, rows.map((r) => r.id)), lte(P.date, to)));
  const docIds = [...new Set(allocations.map((a) => a.documentId))];
  const D = schema.documents;
  const dates = new Map(docIds.length ? (await db.select({ id: D.id, date: D.date }).from(D).where(inArray(D.id, docIds))).map((d) => [d.id, d.date]) : []);
  const branches = await db.select({ id: schema.branches.id, gstin: schema.branches.gstin }).from(schema.branches).where(eq(schema.branches.companyId, company.id));
  const core = companyCore(company);
  return rows.flatMap((r) => {
    const currency = r.currency.trim();
    const p = {
      id: r.id,
      direction: r.direction,
      date: r.date,
      amount: { minor: r.amountMinor, currency },
      exchangeRate: Number(r.exchangeRate),
      allocations: allocations.filter((a) => a.paymentId === r.id).map((a) => ({ documentId: a.documentId, documentNumber: a.documentNumber, amount: { minor: a.amountMinor, currency } })),
      advanceTax: { taxCategoryId: r.advanceTaxCategoryId!, rate: Number(r.advanceTaxRate), placeOfSupplyStateCode: r.advancePlaceOfSupply!, hsn: r.advanceHsn ?? undefined, cessRate: r.advanceCessRate != null ? Number(r.advanceCessRate) : undefined },
      advanceTds: r.tdsMinor ? { minor: r.tdsMinor, currency } : undefined,
      refunds: refunds.filter((f) => f.of === r.id).map((f) => ({ paymentId: f.id, date: f.date, amount: { minor: f.amountMinor, currency } })),
    } as Payment;
    const branch = branches.find((b) => b.id === r.branchId);
    return advanceTaxEvents(p, homeStateCode(core, branch ? ({ gstin: branch.gstin ?? undefined } as Branch) : undefined), (id) => dates.get(id));
  });
}
