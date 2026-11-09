import { businessDate } from '@esmart/core/lib/date';
import { and, eq, inArray, isNull, lte, ne } from 'drizzle-orm';
import { inclusiveTax, money, percent, zero, type Money } from '@esmart/core/lib/money';
import { schema } from '@esmart/db';
import { nextRecurrence } from '@esmart/core/domain/recurrence';
import type { AuthUser, Deps } from '../../context';
import { unprocessable } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { notify, noteDate } from '../../lib/notify';
import { assignNumber } from '../../lib/numbering';
import { accountBalanceMinor } from '../payments/engine';
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
export function expenseTax(amount: Money, rate: number, taxInclusive: boolean, reverseCharge = false): Money {
  if (!(rate > 0)) return zero(amount.currency);
  // Under reverse charge the supplier's price has no GST in it: the business pays the tax on top, to the government.
  if (reverseCharge) return percent(amount, rate);
  if (taxInclusive) return inclusiveTax(amount, rate);
  const guess = Math.floor((amount.minor * 100) / (100 + rate));
  for (const n of [guess - 1, guess, guess + 1, guess + 2]) {
    const tax = percent(money(n, amount.currency), rate);
    if (n + tax.minor === amount.minor) return tax;
  }
  // No net adds up to exactly this amount (it was typed in by hand), so take the tax out of it.
  return inclusiveTax(amount, rate);
}

/**
 * What an expense would leave its account short by, or 0 when the account covers it: no account
 * (cash, bank or wallet) pays out more than it holds, the rule payments follow. The account row is
 * locked, so two expenses (or an expense and a payment) can't both spend its last rupee. An edit
 * leaves the expense's own earlier amount out; one that takes no more from the same account than
 * before is never refused, so an expense recorded before this rule can still be corrected.
 */
export async function shortfall(
  tx: DbOrTx,
  companyId: string,
  e: { accountId: string; amountMinor: number; exchangeRate: string | number },
  current?: { id: string; accountId: string; amountMinor: number; exchangeRate: string | number },
): Promise<{ shortMinor: number; name: string; balanceMinor: number; amountBase: number }> {
  const amountBase = Math.round(e.amountMinor * Number(e.exchangeRate));
  const none = { shortMinor: 0, name: '', balanceMinor: 0, amountBase };
  if (current && current.accountId === e.accountId && amountBase <= Math.round(current.amountMinor * Number(current.exchangeRate))) return none;
  const [account] = await tx
    .select()
    .from(schema.paymentAccounts)
    .where(and(eq(schema.paymentAccounts.companyId, companyId), eq(schema.paymentAccounts.id, e.accountId)))
    .for('update');
  if (!account) return none;
  const balanceMinor = await accountBalanceMinor(tx, account, undefined, undefined, current?.id);
  return { shortMinor: Math.max(amountBase - balanceMinor, 0), name: account.name, balanceMinor, amountBase };
}

/** 422 INSUFFICIENT_BALANCE when the account can't cover the expense (see `shortfall`). */
export async function assertAccountCovers(
  tx: DbOrTx,
  companyId: string,
  baseCurrency: string,
  e: Parameters<typeof shortfall>[2],
  current?: Parameters<typeof shortfall>[3],
): Promise<void> {
  const s = await shortfall(tx, companyId, e, current);
  if (!s.shortMinor) return;
  const fmt = (minor: number) => `${baseCurrency} ${(Math.max(minor, 0) / 100).toFixed(2)}`;
  throw unprocessable([{ field: 'amount.minor', message: `${s.name} holds ${fmt(s.balanceMinor)}; this expense needs ${fmt(s.amountBase)}`, severity: 'blocking' }], 'INSUFFICIENT_BALANCE');
}

/** Moved to core so the cash-flow forecast counts a series the same way. */
export { nextRecurrence };

/** Whoever set a series up is the one its occurrences are recorded against. */
export async function schedulerActor(db: DbOrTx, userId: string): Promise<AuthUser> {
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
    mfaEnrolled: false,
    mfaVerified: false,
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
export async function materializeRecurringExpenses(deps: Pick<Deps, 'db'> & Partial<Pick<Deps, 'now'>>, today: string | Date): Promise<{ created: string[] }> {
  const asOf = typeof today === 'string' ? today : businessDate(today);
  // A suspended or closed account's books stay as they were.
  const activeCompanies = deps.db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.companies.accountId))
    .where(and(isNull(schema.accounts.suspendedAt), isNull(schema.companies.archivedAt), eq(schema.accounts.isDemo, false)));
  const due = await deps.db
    .select({ id: E.id })
    .from(E)
    .where(and(ne(E.recurrence, 'none'), lte(E.nextRecurrenceDate, asOf), isNull(E.recurringParentId), inArray(E.companyId, activeCompanies)))
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
      const now = deps.now?.() ?? new Date();
      let next: string | null = template.nextRecurrenceDate;

      while (next && next <= asOf) {
        // An account that can't pay it waits: the occurrence is made, on its own date, once it can.
        const short = await shortfall(tx, template.companyId, template);
        if (short.shortMinor) {
          await notify(tx, deps as Deps, {
            companyId: template.companyId,
            userId: template.createdBy,
            kind: 'system',
            title: `Recurring expense ${template.number.trim()} not recorded`,
            body: `${short.name} doesn't hold enough to pay the ${noteDate(next)} occurrence. Add money to the account; it is recorded on the next run.`,
            entityType: 'expense',
            entityId: template.id,
          });
          break;
        }
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

      // Nothing could be paid this run: the template stays as it was.
      if (next === template.nextRecurrenceDate) return;
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
    placeOfSupplyStateCode: t.placeOfSupplyStateCode,
    supplierGstin: t.supplierGstin,
    itcEligibility: t.itcEligibility,
    reverseCharge: t.reverseCharge,
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
