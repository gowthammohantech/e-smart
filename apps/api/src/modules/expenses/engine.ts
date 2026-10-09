import { and, eq, inArray, isNull, lte, ne } from 'drizzle-orm';
import { addDaysISO } from '@esmart/core/lib/date';
import { inclusiveTax, money, percent, zero, type Money } from '@esmart/core/lib/money';
import type { RecurrenceFrequency } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { AuthUser, Deps } from '../../context';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { assignNumber } from '../../lib/numbering';
import { expenseToWire, type ExpenseRow } from './wire';

const E = schema.expenses;

/**
 * The input tax in an expense, as the app's expense form works it out with
 * `@esmart/core` money: `inclusiveTax` when the amount was entered with tax
 * in it, `percent` of the net when tax was added on top. `amount` is always
 * what left the account (core's `Expense.amount`, which account balances
 * deduct and the profit snapshot nets the tax out of), so for a
 * tax-exclusive expense the net is recovered as the one `n` with
 * `n + percent(n) = amount`. That keeps a re-save from adding tax twice.
 */
export function expenseTax(amount: Money, rate: number, taxInclusive: boolean): Money {
  if (!(rate > 0)) return zero(amount.currency);
  if (taxInclusive) return inclusiveTax(amount, rate);
  const guess = Math.floor((amount.minor * 100) / (100 + rate));
  for (const n of [guess - 1, guess, guess + 1, guess + 2]) {
    const tax = percent(money(n, amount.currency), rate);
    if (n + tax.minor === amount.minor) return tax;
  }
  // No net adds up to exactly this amount (it was typed in by hand), so take the tax out of it.
  return inclusiveTax(amount, rate);
}

/** `iso` moved on by whole months, clamped to the end of a shorter month (31 Jan + 1 → 28/29 Feb). */
function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** The `k`th occurrence of a series that started on `anchor`. */
function occurrence(anchor: string, frequency: Exclude<RecurrenceFrequency, 'none'>, k: number): string {
  switch (frequency) {
    case 'weekly':
      return addDaysISO(anchor, 7 * k);
    case 'monthly':
      return addMonthsISO(anchor, k);
    case 'quarterly':
      return addMonthsISO(anchor, 3 * k);
    case 'yearly':
      return addMonthsISO(anchor, 12 * k);
  }
}

/**
 * The first occurrence strictly after `after` of a series anchored on the
 * template's date, or null when it does not recur. Counting from the anchor
 * (rather than from the last occurrence) keeps a series that started on the
 * 31st on month ends instead of drifting to the 28th.
 */
export function nextRecurrence(anchor: string, frequency: RecurrenceFrequency, after: string = anchor): string | null {
  if (frequency === 'none') return null;
  for (let k = 1; k < 100_000; k++) {
    const d = occurrence(anchor, frequency, k);
    if (d > after) return d;
  }
  return null;
}

/** Whoever set a series up is the one its occurrences are recorded against. */
async function schedulerActor(db: DbOrTx, userId: string): Promise<AuthUser> {
  const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, userId));
  return {
    id: userId,
    accountId: '',
    name: `${u?.name ?? 'Unknown'} (recurring)`,
    email: '',
    role: 'owner',
    platformRole: null,
    status: 'active',
    locale: null,
    companyIds: [],
    branchIds: [],
    sessionId: '',
  };
}

/**
 * Creates every occurrence of a recurring expense that has fallen due by
 * `today`, and moves each template's `next_recurrence_date` past it. Meant
 * for a scheduled job. Each template is handled in its own transaction under
 * a `FOR UPDATE SKIP LOCKED` row lock and its due date is re-checked there,
 * so two runners (or a rerun) never create the same occurrence twice. A
 * template that was missed for several periods catches up on all of them.
 */
export async function materializeRecurringExpenses(deps: Pick<Deps, 'db'>, today: string | Date): Promise<{ created: string[] }> {
  const asOf = typeof today === 'string' ? today : today.toISOString().slice(0, 10);
  const due = await deps.db
    .select({ id: E.id })
    .from(E)
    .where(and(ne(E.recurrence, 'none'), lte(E.nextRecurrenceDate, asOf), isNull(E.recurringParentId)))
    .orderBy(E.nextRecurrenceDate, E.id);
  const created: string[] = [];

  for (const { id } of due) {
    await deps.db.transaction(async (tx) => {
      const [template] = await tx
        .select()
        .from(E)
        .where(and(eq(E.id, id), ne(E.recurrence, 'none'), lte(E.nextRecurrenceDate, asOf)))
        .for('update', { skipLocked: true });
      if (!template?.nextRecurrenceDate) return;
      const actor = await schedulerActor(tx, template.createdBy);
      const now = new Date();
      let next: string | null = template.nextRecurrenceDate;

      while (next && next <= asOf) {
        const number = await assignNumber(tx, { companyId: template.companyId, kind: 'expense', branchId: template.branchId, date: next });
        const [occ] = await tx
          .insert(E)
          .values({
            ...copyable(template),
            id: newId('exp'),
            number,
            date: next,
            recurrence: 'none',
            nextRecurrenceDate: null,
            recurringParentId: template.id,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        await recordChange(tx, actor, { companyId: occ.companyId, action: 'created', entityType: 'expense', entityId: occ.id, entityLabel: occ.number, version: occ.version, after: expenseToWire(occ, []) });
        created.push(occ.id);
        next = nextRecurrence(template.date, template.recurrence, next);
      }

      const [updated] = await tx
        .update(E)
        .set({ nextRecurrenceDate: next, version: template.version + 1, updatedAt: now })
        .where(eq(E.id, template.id))
        .returning();
      await recordChange(tx, actor, {
        companyId: updated.companyId,
        action: 'recurred',
        entityType: 'expense',
        entityId: updated.id,
        entityLabel: updated.number,
        version: updated.version,
        before: { nextRecurrenceDate: template.nextRecurrenceDate },
        after: { nextRecurrenceDate: next },
      });
    });
  }
  return { created };
}

/** The columns an occurrence inherits from its template. */
function copyable(t: ExpenseRow) {
  return {
    companyId: t.companyId,
    branchId: t.branchId,
    categoryId: t.categoryId,
    supplierId: t.supplierId,
    amountMinor: t.amountMinor,
    currency: t.currency,
    exchangeRate: t.exchangeRate,
    taxCategoryId: t.taxCategoryId,
    taxAmountMinor: t.taxAmountMinor,
    taxInclusive: t.taxInclusive,
    accountId: t.accountId,
    method: t.method,
    reference: t.reference,
    notes: t.notes,
    billable: t.billable,
    createdBy: t.createdBy,
  };
}

/** Attachments listed on an expense point back at it (and only those). */
export async function linkExpenseAttachments(tx: DbOrTx, companyId: string, expenseId: string, ids: string[] | undefined) {
  if (ids === undefined) return;
  const A = schema.attachments;
  await tx.update(A).set({ entityType: null, entityId: null }).where(and(eq(A.companyId, companyId), eq(A.entityType, 'expense'), eq(A.entityId, expenseId)));
  if (ids.length) await tx.update(A).set({ entityType: 'expense', entityId: expenseId }).where(and(eq(A.companyId, companyId), inArray(A.id, ids)));
}
