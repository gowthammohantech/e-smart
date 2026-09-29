import { and, eq, inArray } from 'drizzle-orm';
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
  return rows.map((r) => expenseToWire(r, attachments.filter((a) => a.entityId === r.id).map((a) => a.id)));
}

export function expenseToWire(r: ExpenseRow, attachmentIds: string[]): Schema<'Expense'> {
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
    accountId: r.accountId,
    method: r.method,
    reference: r.reference,
    notes: r.notes,
    billable: r.billable,
    recurrence: r.recurrence,
    nextRecurrenceDate: r.nextRecurrenceDate,
    attachmentIds,
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
    accountId: r.accountId,
    method: r.method,
    reference: r.reference ?? undefined,
    notes: r.notes ?? undefined,
    billable: r.billable,
    recurrence: r.recurrence,
    nextRecurrenceDate: r.nextRecurrenceDate ?? undefined,
    attachmentIds: [],
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  };
}
