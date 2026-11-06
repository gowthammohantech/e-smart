import { and, eq, inArray, notInArray } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import type { Expense } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { DbOrTx } from '../../lib/audit';
import { compact, money, versioned } from '../../lib/wire';

export type ExpenseRow = typeof schema.expenses.$inferSelect;

/** Expenses on the wire, with the attachments that point back at each one. */
export async function expensesToWire(db: DbOrTx, rows: ExpenseRow[]): Promise<Schema<'Expense'>[]> {
  if (!rows.length) return [];
  const A = schema.attachments;
  const attachments = await db
    .select({ id: A.id, entityId: A.entityId })
    .from(A)
    .where(and(eq(A.entityType, 'expense'), inArray(A.entityId, rows.map((r) => r.id))))
    .orderBy(A.uploadedAt);
  // The live invoice each billable one was recovered on, as a reimbursement line.
  const billable = rows.filter((r) => r.billable).map((r) => r.id);
  const L = schema.documentLines;
  const D = schema.documents;
  const recovered = billable.length
    ? await db
        .select({ expenseId: L.expenseId, documentId: D.id, number: D.number })
        .from(L)
        .innerJoin(D, eq(D.id, L.documentId))
        .where(and(inArray(L.expenseId, billable), notInArray(D.status, ['draft', 'cancelled', 'rejected'])))
    : [];
  const by = new Map(recovered.map((r) => [r.expenseId!, { documentId: r.documentId, number: r.number }]));
  return rows.map((r) => expenseToWire(r, attachments.filter((a) => a.entityId === r.id).map((a) => a.id), by.get(r.id)));
}

export function expenseToWire(r: ExpenseRow, attachmentIds: string[], recoveredBy?: { documentId: string; number: string }): Schema<'Expense'> {
  const currency = r.currency.trim();
  return compact({
    id: r.id,
    companyId: r.companyId,
    branchId: r.branchId,
    number: r.number,
    categoryId: r.categoryId,
    supplierId: r.supplierId,
    date: r.date,
    amount: money(r.amountMinor, currency),
    currency,
    exchangeRate: Number(r.exchangeRate),
    taxCategoryId: r.taxCategoryId,
    taxAmount: money(r.taxAmountMinor, currency),
    taxInclusive: r.taxInclusive,
    placeOfSupplyStateCode: r.placeOfSupplyStateCode,
    supplierGstin: r.supplierGstin,
    itcEligibility: r.itcEligibility === 'eligible' ? undefined : r.itcEligibility,
    reverseCharge: r.reverseCharge || undefined,
    accountId: r.accountId,
    method: r.method,
    reference: r.reference,
    notes: r.notes,
    billable: r.billable,
    customerId: r.customerId,
    costCentreId: r.costCentreId,
    vehicleId: r.vehicleId,
    recurrence: r.recurrence,
    nextRecurrenceDate: r.nextRecurrenceDate,
    attachmentIds,
    recoveredBy,
    createdBy: r.createdBy,
    ...versioned(r),
  });
}

/** The expense as `@esmart/core` sees it (reports, account balances). */
export function toCoreExpense(r: ExpenseRow): Expense {
  const currency = r.currency.trim();
  return {
    id: r.id,
    companyId: r.companyId,
    branchId: r.branchId,
    number: r.number,
    categoryId: r.categoryId,
    supplierId: r.supplierId ?? undefined,
    date: r.date,
    amount: money(r.amountMinor, currency),
    currency,
    exchangeRate: Number(r.exchangeRate),
    taxCategoryId: r.taxCategoryId ?? undefined,
    taxAmount: money(r.taxAmountMinor, currency),
    taxInclusive: r.taxInclusive,
    placeOfSupplyStateCode: r.placeOfSupplyStateCode ?? undefined,
    supplierGstin: r.supplierGstin ?? undefined,
    itcEligibility: r.itcEligibility,
    reverseCharge: r.reverseCharge,
    accountId: r.accountId,
    method: r.method,
    reference: r.reference ?? undefined,
    notes: r.notes ?? undefined,
    billable: r.billable,
    customerId: r.customerId ?? undefined,
    costCentreId: r.costCentreId ?? undefined,
    vehicleId: r.vehicleId ?? undefined,
    recurrence: r.recurrence,
    nextRecurrenceDate: r.nextRecurrenceDate ?? undefined,
    attachmentIds: [],
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  };
}
