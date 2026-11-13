import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { hasLedger } from '@esmart/core/domain/partyKinds';
import { PAYABLE_KINDS, RECEIVABLE_KINDS, isFinalized } from '@esmart/core/domain/documentStates';
import { settlementGainLoss } from '@esmart/core/domain/fx';
import { accountFitsMethod } from '@esmart/core/domain/paymentAccounts';
import { FULL_PLAN, hasModule } from '@esmart/core/domain/plan';
import { tdsSection as tdsSectionOf } from '@esmart/core/data/tdsSections';
import type { PaymentMethod } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow, Deps } from '../../context';
import { conflict, planUpgradeRequired, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { categoryOn } from '../../lib/taxRates';
import { assignNumber } from '../../lib/numbering';
import { notify, noteMoney } from '../../lib/notify';
import { rateToBase } from '../documents/engine';
import { assertPeriodOpen, assertPeriodOpenNow, syncPaymentState } from '../documents/lifecycle';
import { assertNotReconciled } from '../banking/engine';
import { addDaysISO, businessDate } from '@esmart/core/lib/date';
import type { PaymentRow } from './wire';

const PAY = schema.payments;
const A = schema.paymentAllocations;
const D = schema.documents;

/**
 * An account's balance in base-currency minor units, as core's
 * `accountBalances` computes it: opening + received − paid − expenses.
 * `exceptPaymentId` leaves out a payment being rewritten (`exceptVoucherId`, `exceptExpenseId` the same).
 */
export async function accountBalanceMinor(
  tx: DbOrTx,
  account: typeof schema.paymentAccounts.$inferSelect,
  exceptPaymentId?: string,
  exceptVoucherId?: string,
  exceptExpenseId?: string,
): Promise<number> {
  const base = sql<string>`coalesce(sum(round(${PAY.amountMinor} * ${PAY.exchangeRate})), 0)`;
  const pays = await tx
    .select({ direction: PAY.direction, total: base })
    .from(PAY)
    .where(and(eq(PAY.accountId, account.id), exceptPaymentId ? ne(PAY.id, exceptPaymentId) : undefined))
    .groupBy(PAY.direction);
  const E = schema.expenses;
  const [spent] = await tx
    .select({ total: sql<string>`coalesce(sum(round(${E.amountMinor} * ${E.exchangeRate})), 0)` })
    .from(E)
    .where(and(eq(E.accountId, account.id), exceptExpenseId ? ne(E.id, exceptExpenseId) : undefined));
  const net = pays.reduce((s, p) => s + (p.direction === 'received' ? 1 : -1) * Number(p.total), 0);
  // Contra and journal vouchers that moved money in or out of it.
  const V = schema.vouchers;
  const [moved] = await tx
    .select({ total: sql<string>`coalesce(sum((l->>'debitMinor')::bigint - (l->>'creditMinor')::bigint), 0)` })
    .from(sql`${V}, jsonb_array_elements(${V.lines}) as l`)
    .where(and(eq(V.companyId, account.companyId), eq(V.status, 'posted'), sql`l->>'account' = ${`pay:${account.id}`}`, exceptVoucherId ? ne(V.id, exceptVoucherId) : undefined));
  return Math.round(account.openingBalanceMinor * Number(account.openingRate)) + net - Number(spent?.total ?? 0) + Number(moved?.total ?? 0);
}

/** The most any section deducts (its no-PAN rate, s.206AA, or its normal rate if higher); 20% when no section is named. */
export function tdsCeilingPercent(code: string | null | undefined): number {
  const s = tdsSectionOf(code ?? undefined);
  return s ? Math.max(s.rateIndividual, s.rateOther, s.noPanRate) : 20;
}

/** s.269ST: cash received from one person in a day must stay under ₹2 lakh. */
export const CASH_RECEIPT_LIMIT = 2_00_000_00;
/** s.40A(3): cash paid to one person in a day over ₹10,000 is disallowed as an expense. */
export const CASH_PAYMENT_LIMIT = 10_000_00;

/** How far a rate sent with a payment may stray from the company's rate for the day. */
export const RATE_TOLERANCE = 0.1;

/**
 * No account pays out more than it holds (RULES 6.26), whichever way it would be emptied: money paid
 * out, or money that came in taken back (deleted, cut, moved to another account). `after` and
 * `before` are what this record does to the account (received positive, paid negative), in base
 * currency. A change that leaves the account no worse off is never refused, so a record made before
 * the rule can still be corrected. Returns what the account holds without this record when it
 * would end below zero, else null.
 */
export async function wouldOverdraw(
  tx: DbOrTx,
  account: typeof schema.paymentAccounts.$inferSelect,
  change: { after: number; before: number; date?: string; wasDate?: string },
  except: { paymentId?: string; voucherId?: string; expenseId?: string } = {},
  pending = 0,
): Promise<number | null> {
  if (!change.date) {
    if (change.after >= change.before) return null;
    const others = (await accountBalanceMinor(tx, account, except.paymentId, except.voucherId, except.expenseId)) - pending;
    return others + change.after < 0 ? others : null;
  }
  // Moved to another day: on the days between the two dates the record counts on one side only.
  const was = change.wasDate ?? change.date;
  if (was !== change.date) {
    const [from, until] = was < change.date ? [was, change.date] : [change.date, was];
    // Moved later, those days lose what it did then; moved earlier, they gain what it does now.
    const nowThen = was < change.date ? 0 : change.after;
    const thenThen = was < change.date ? change.before : 0;
    if (nowThen < thenThen) {
      const between = (await lowestBalanceFrom(tx, account, from, except, until)) - pending;
      if (between + nowThen < 0) return between;
    }
  }
  if (change.after >= change.before) return null;
  const others = (await lowestBalanceFrom(tx, account, was > change.date ? was : change.date, except)) - pending;
  return others + change.after < 0 ? others : null;
}

/**
 * The lowest an account stands, in base currency, at the end of `date` or any day after it, leaving
 * out the record being written. A payment dated 1 June can't be covered by money that only comes in
 * on 30 June: the cash book would be negative for the days between (RULES 6.26).
 */
export async function lowestBalanceFrom(
  tx: DbOrTx,
  account: typeof schema.paymentAccounts.$inferSelect,
  date: string,
  except: { paymentId?: string; voucherId?: string; expenseId?: string } = {},
  until?: string,
): Promise<number> {
  const E = schema.expenses;
  const V = schema.vouchers;
  const key = `pay:${account.id}`;
  const rows = await tx.execute<{ before: string | null; later: string | null }>(sql`
    with m as (
      select d, sum(amt) as amt from (
        select ${PAY.date} as d, case when ${PAY.direction} = 'received' then round(${PAY.amountMinor} * ${PAY.exchangeRate}) else -round(${PAY.amountMinor} * ${PAY.exchangeRate}) end as amt
          from ${PAY} where ${PAY.accountId} = ${account.id} ${except.paymentId ? sql`and ${PAY.id} <> ${except.paymentId}` : sql``}
        union all
        select ${E.date}, -round(${E.amountMinor} * ${E.exchangeRate}) from ${E} where ${E.accountId} = ${account.id} ${except.expenseId ? sql`and ${E.id} <> ${except.expenseId}` : sql``}
        union all
        select v.date, (l->>'debitMinor')::bigint - (l->>'creditMinor')::bigint
          from ${V} v, jsonb_array_elements(v.lines) l
          where v.company_id = ${account.companyId} and v.status = 'posted' and l->>'account' = ${key} ${except.voucherId ? sql`and v.id <> ${except.voucherId}` : sql``}
      ) x group by d
    ), c as (select d, sum(amt) over (order by d) as cum from m)
    select (select coalesce(sum(amt), 0) from m where d <= ${date}) as before,
           (select min(cum) from c where d > ${date} ${until ? sql`and d < ${until}` : sql``}) as later`);
  const r = rows.rows[0];
  const opening = Math.round(account.openingBalanceMinor * Number(account.openingRate));
  const onDay = Number(r?.before ?? 0);
  const later = r?.later == null ? onDay : Math.min(onDay, Number(r.later));
  return opening + later;
}

export type PaymentInput = {
  direction: 'received' | 'paid';
  partyId: string;
  branchId?: string | null;
  date: string;
  amountMinor: number;
  currency: string;
  /** Currency the amount was sent in; must match `currency`. */
  amountCurrency?: string;
  exchangeRate?: number | null;
  method: PaymentMethod;
  reference?: string | null;
  accountId: string;
  notes?: string | null;
  /** An advance for services, taxed when received at this category's rate and place of supply. */
  advanceTax?: { taxCategoryId: string; placeOfSupplyStateCode: string; hsn?: string; cessRate?: number; reverseCharge?: boolean } | null;
  /** On money received: TDS the customer deducted from an advance, not tied to an invoice. Credits them as money does. */
  advanceTdsMinor?: number;
  /** Money paid back to a customer out of this advance receipt (a refund voucher, Rule 51). */
  refundOf?: string | null;
  /** On money paid: the section of the TDS its allocations kept back. */
  tdsSection?: string | null;
  /** `amountMinor` is cash; the other three settle the document without money moving. */
  allocations: { documentId: string; amountMinor: number; tdsMinor?: number; discountMinor?: number; writeOffMinor?: number; currency?: string }[];
};

/** What one allocation settles: cash plus TDS deducted, discount and write-off. */
const settles = (a: PaymentInput['allocations'][number]) => a.amountMinor + (a.tdsMinor ?? 0) + (a.discountMinor ?? 0) + (a.writeOffMinor ?? 0);
const adjusts = (a: PaymentInput['allocations'][number]) => (a.tdsMinor ?? 0) + (a.discountMinor ?? 0) + (a.writeOffMinor ?? 0);

/** Paying suppliers is the payables module (Pro and up); refunding a customer's advance is not. */
export function assertDirectionAllowed(company: CompanyRow, direction: 'received' | 'paid', refund = false) {
  if (direction === 'paid' && !refund && !hasModule(company.plan, 'payables')) throw planUpgradeRequired(FULL_PLAN, 'payables');
}

/** What has been paid back out of a receipt so far. */
async function refundedFrom(tx: DbOrTx, receiptId: string): Promise<number> {
  const [r] = await tx.select({ total: sql<string>`coalesce(sum(${PAY.amountMinor}), 0)` }).from(PAY).where(eq(PAY.refundOfPaymentId, receiptId));
  return Number(r?.total ?? 0);
}

/** A receipt's advance after a refund out of it changed by `delta` (positive pays more back). */
async function moveRefund(tx: DbOrTx, actor: AuthUser, receipt: PaymentRow, delta: number, now: Date) {
  if (!delta) return;
  const [updated] = await tx
    .update(PAY)
    .set({ unallocatedMinor: receipt.unallocatedMinor - delta, version: receipt.version + 1, updatedAt: now })
    .where(eq(PAY.id, receipt.id))
    .returning();
  await recordChange(tx, actor, {
    companyId: receipt.companyId,
    action: delta > 0 ? 'advance refunded' : 'refund reversed',
    entityType: 'payment',
    entityId: receipt.id,
    entityLabel: receipt.number,
    version: updated.version,
    before: { unallocatedMinor: receipt.unallocatedMinor },
    after: { unallocatedMinor: updated.unallocatedMinor },
  });
}

/**
 * Records a new payment, or rewrites `existing`, inside `tx`. This is where
 * the ledger's invariants are kept:
 *
 * - each allocation is to a finalised, uncancelled document of the same
 *   party and currency, of the kind that fits the direction (received →
 *   invoice, paid → purchase bill), and no more than what it still owes;
 * - the allocations add up to no more than the payment;
 * - `unallocated_minor` = amount − allocations − refunds (the party's advance);
 * - a refund (`refundOf`) pays back no more than is left of that receipt's advance, and moves it;
 * - every document touched (before or after) gets `amount_paid_minor`
 *   re-summed from its allocations and its status re-derived.
 *
 * The documents are locked `FOR UPDATE` first, so concurrent payments
 * against one invoice cannot both take its last rupee.
 */
export async function writePayment(
  tx: DbOrTx,
  deps: Deps,
  company: CompanyRow,
  actor: AuthUser,
  input: PaymentInput,
  opts: { now: Date; existing?: PaymentRow; notifyReceived?: boolean },
): Promise<PaymentRow> {
  const issues: Issue[] = [];
  const blocking = (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });
  const baseCurrency = company.baseCurrency.trim();
  const existing = opts.existing;
  // Books closed through a date stay as they were: nothing new, changed or removed in that period.
  assertPeriodOpen(company, input.date);
  // Money moves on the day it moves: not a day ahead of today (a day's grace for time zones and devices).
  if (input.date > addDaysISO(businessDate(opts.now), 1)) blocking('date', `A payment can't be dated ${input.date}, in the future`);
  if (existing) assertPeriodOpen(company, existing.date);
  await assertPeriodOpenNow(tx, company, input.date, existing?.date);
  // Reconciled with the bank: what the bank saw stays as it saw it.
  if (existing && (existing.amountMinor !== input.amountMinor || existing.date !== input.date || existing.accountId !== input.accountId || existing.direction !== input.direction || existing.currency.trim() !== input.currency)) {
    await assertNotReconciled(tx, 'payment', existing.id, existing.number);
  }

  const [party] = await tx.select().from(schema.parties).where(and(eq(schema.parties.companyId, company.id), eq(schema.parties.id, input.partyId)));
  if (!party) blocking('partyId', 'No such party in this company');
  else if (!hasLedger(party.kind)) blocking('partyId', `${party.name} is a general contact; money is received from customers and paid to suppliers`);
  // Locked so two payments out of one cash box cannot both spend its last rupee.
  const [account] = await tx
    .select()
    .from(schema.paymentAccounts)
    .where(and(eq(schema.paymentAccounts.companyId, company.id), eq(schema.paymentAccounts.id, input.accountId)))
    .for('update');
  if (!account) blocking('accountId', 'No such payment account in this company');
  else if (!accountFitsMethod(input.method, account)) {
    blocking('accountId', `A ${input.method} payment cannot go through a ${account.type} account`);
  }
  if (input.amountCurrency && input.amountCurrency !== input.currency) blocking('amount.currency', `Must match the payment currency (${input.currency})`);
  // A receipt may move no money when it only records TDS deducted, a discount or a write-off.
  const adjusting = input.allocations.some((a) => adjusts(a) > 0);
  if (!(input.amountMinor > 0) && !(adjusting && input.amountMinor === 0)) blocking('amount.minor', 'Must be more than zero');
  // Settling without money moving is for the books' keepers: a discount or a write-off clears what a
  // party owes as surely as cash does.
  const keeper = ['owner', 'admin', 'accountant'].includes(actor.companyRoles?.[company.id] ?? actor.role);
  if (input.allocations.some((a) => (a.writeOffMinor ?? 0) > 0) && !keeper) {
    blocking('allocations', 'Only an owner, admin or accountant can write off what a party owes');
  }
  if (input.allocations.some((a) => (a.discountMinor ?? 0) > 0) && !keeper) {
    blocking('allocations', 'Only an owner, admin or accountant can settle an invoice with a discount');
  }
  const [cur] = await tx.select().from(schema.currencies).where(eq(schema.currencies.code, input.currency));
  if (!cur) blocking('currency', `Unknown currency ${input.currency}`);

  if (input.branchId && actor.branchIds.length && !actor.branchIds.includes(input.branchId)) blocking('branchId', 'You cannot record payments in this branch');
  let branchId = input.branchId ?? existing?.branchId ?? null;
  if (branchId) {
    const [b] = await tx.select({ id: schema.branches.id }).from(schema.branches).where(and(eq(schema.branches.companyId, company.id), eq(schema.branches.id, branchId)));
    if (!b) blocking('branchId', 'No such branch in this company');
  } else {
    const branches = await tx.select().from(schema.branches).where(eq(schema.branches.companyId, company.id));
    const mine = actor.branchIds.length ? branches.filter((b) => actor.branchIds.includes(b.id)) : branches;
    branchId = (mine.find((b) => b.isPrimary) ?? mine[0])?.id ?? null;
  }

  const exchangeRate =
    input.currency === baseCurrency
      ? 1
      : (input.exchangeRate ??
        (existing && existing.currency.trim() === input.currency && existing.date === input.date ? Number(existing.exchangeRate) : null) ??
        (await rateToBase(tx, company.id, input.currency, baseCurrency, input.date)));
  if (!exchangeRate || exchangeRate <= 0) blocking('exchangeRate', `A ${input.currency} payment needs its rate to ${baseCurrency}`);
  // A rate sent with the payment is the bank's, near the company's own for the day; far from it, it
  // would make a payment look small for the approval rule and book a gain or loss that isn't there.
  else if (input.currency !== baseCurrency && input.exchangeRate != null && !(existing && Number(existing.exchangeRate) === input.exchangeRate)) {
    const table = await rateToBase(tx, company.id, input.currency, baseCurrency, input.date);
    if (table && Math.abs(input.exchangeRate / table - 1) > RATE_TOLERANCE) {
      blocking('exchangeRate', `${input.exchangeRate} is more than ${RATE_TOLERANCE * 100}% from the rate on file for ${input.date} (${table}); check it, or update the rate on file`);
    }
  }

  // Lock every document this write touches, in a stable order.
  const before = existing ? await tx.select().from(A).where(eq(A.paymentId, existing.id)) : [];
  const docIds = [...new Set([...before.map((a) => a.documentId), ...input.allocations.map((a) => a.documentId)])].sort();
  const docs = docIds.length
    ? await tx.select().from(D).where(and(eq(D.companyId, company.id), inArray(D.id, docIds))).orderBy(D.id).for('update')
    : [];
  // Money received settles invoices and debit notes; money paid, bills and supplier debit notes.
  const wanted = PAYABLE_KINDS.filter((k) => RECEIVABLE_KINDS.includes(k) === (input.direction === 'received'));

  const merged = new Map<string, number>();
  let overOutstanding = false;
  // Each branch's GSTIN (its own, else the company's), for an advance's tax.
  const branchRows = input.advanceTax || existing?.advanceTaxCategoryId ? await tx.select({ id: schema.branches.id, gstin: schema.branches.gstin }).from(schema.branches).where(eq(schema.branches.companyId, company.id)) : [];
  const gstinOf = branchRows.length ? (id: string) => branchRows.find((b) => b.id === id)?.gstin ?? company.taxIdentifier ?? null : null;
  input.allocations.forEach((a, i) => {
    const field = `allocations[${i}]`;
    const doc = docs.find((d) => d.id === a.documentId);
    if (!doc) return blocking(`${field}.documentId`, 'No such document in this company');
    if (merged.has(a.documentId)) return blocking(`${field}.documentId`, `${doc.number} is allocated twice`);
    merged.set(a.documentId, a.amountMinor);
    if (doc.partyId !== input.partyId) blocking(`${field}.documentId`, `${doc.number} belongs to another party`);
    // A user kept to some branches settles only their documents.
    if (actor.branchIds.length && !actor.branchIds.includes(doc.branchId)) blocking(`${field}.documentId`, `${doc.number} is in a branch you don't work in`);
    // Tax on an advance was paid under the receiving branch's GSTIN: it is taken back only under that GSTIN.
    if (gstinOf && branchId && gstinOf(doc.branchId) !== gstinOf(branchId) && (input.advanceTax || existing?.advanceTaxCategoryId)) {
      blocking(`${field}.documentId`, `${doc.number} is under GSTIN ${gstinOf(doc.branchId) ?? 'none'}; the advance's tax was paid under ${gstinOf(branchId) ?? 'none'}`);
    }
    if (!wanted.includes(doc.kind)) blocking(`${field}.documentId`, `A ${input.direction} payment settles ${input.direction === 'received' ? 'invoices and debit notes' : 'purchase bills and supplier debit notes'}, not a ${doc.kind}`);
    if (!isFinalized(doc.status) || doc.status === 'cancelled') blocking(`${field}.documentId`, `${doc.number} is ${doc.status}`);
    if (doc.currency.trim() !== input.currency) blocking(`${field}.documentId`, `${doc.number} is in ${doc.currency.trim()}, the payment in ${input.currency}`);
    if (a.currency && a.currency !== input.currency) blocking(`${field}.amount.currency`, `Must be in the payment currency (${input.currency})`);
    for (const k of ['amountMinor', 'tdsMinor', 'discountMinor', 'writeOffMinor'] as const) {
      if ((a[k] ?? 0) < 0) return blocking(`${field}.${k}`, 'Cannot be negative');
    }
    if (!(settles(a) > 0)) return blocking(`${field}.amount.minor`, 'Must be more than zero');
    // TDS is kept back once (RULES 4.16, pending CA): a bill that kept it back takes no more on what
    // pays it, under its own section or any other (one payment is one nature of payment).
    if (input.direction === 'paid' && (a.tdsMinor ?? 0) > 0 && doc.tdsAmountMinor > 0) {
      blocking(`${field}.tdsDeducted`, `${doc.number} already kept back TDS under ${doc.tdsSection ?? 'its section'}; it is not deducted again on the payment`);
    }
    // TDS is a share of the taxable value at the section's rate, never more (the no-PAN rate at most).
    if ((a.tdsMinor ?? 0) > 0) {
      const ceiling = Math.ceil((doc.taxableAmountMinor * tdsCeilingPercent(input.tdsSection)) / 100);
      if ((a.tdsMinor ?? 0) > ceiling) blocking(`${field}.tdsDeducted`, `TDS on ${doc.number} can't be more than ${tdsCeilingPercent(input.tdsSection)}% of its taxable value (${input.currency} ${(ceiling / 100).toFixed(2)})`);
    }
    const earlier = before.find((b) => b.documentId === doc.id);
    const mine = earlier ? earlier.amountMinor + earlier.tdsMinor + earlier.discountMinor + earlier.writeOffMinor : 0;
    const owed = doc.grandTotalMinor - doc.amountPaidMinor + mine;
    if (settles(a) > owed) {
      overOutstanding = true;
      blocking(`${field}.amount.minor`, `${doc.number} has ${input.currency} ${(Math.max(owed, 0) / 100).toFixed(2)} outstanding`);
    }
  });
  // Only cash comes out of the payment; adjustments settle on top of it.
  const allocated = input.allocations.reduce((s, a) => s + a.amountMinor, 0);
  // TDS the customer deducted from an advance credits them as the money does.
  const advanceTds = input.advanceTdsMinor ?? 0;
  if (advanceTds < 0) blocking('advanceTds', 'Cannot be negative');
  if (advanceTds > 0 && input.direction !== 'received') blocking('advanceTds', 'Only money received carries TDS the customer deducted; TDS kept back from a supplier goes on the bill it settles');
  if (advanceTds > 0 && !(input.tdsSection && input.tdsSection !== 'none')) blocking('tdsSection', 'Which section the customer deducted TDS under');
  // The customer kept back a share of the gross (cash + TDS) at the section's rate: TDS ≤ cash × r / (100 − r).
  if (advanceTds > 0) {
    const r = tdsCeilingPercent(input.tdsSection);
    const ceiling = Math.ceil((input.amountMinor * r) / (100 - r));
    if (advanceTds > ceiling) blocking('advanceTds', `TDS under ${input.tdsSection ?? 'a section'} is at most ${r}% of what was due; on ${input.currency} ${(input.amountMinor / 100).toFixed(2)} received that is ${input.currency} ${(ceiling / 100).toFixed(2)}`);
  }
  const credit = input.amountMinor + Math.max(advanceTds, 0);
  if (allocated > credit) blocking('allocations', `Allocations (${input.currency} ${(allocated / 100).toFixed(2)}) exceed the payment (${input.currency} ${(credit / 100).toFixed(2)})`);

  // No account pays out more than it holds: cash, bank or wallet. Money taken back out of an
  // account (a receipt cut, turned round or moved elsewhere) is held to the same rule.
  let shortOfCash = false;
  if (account && exchangeRate && !issues.length) {
    const signed = (direction: string, base: number) => (direction === 'received' ? base : -base);
    const amountBase = Math.round(input.amountMinor * exchangeRate);
    const was = existing ? signed(existing.direction, Math.round(existing.amountMinor * Number(existing.exchangeRate))) : 0;
    const after = signed(input.direction, amountBase);
    const same = existing?.accountId === account.id;
    const held = await wouldOverdraw(tx, account, { after, before: same ? was : 0, date: input.date, wasDate: same ? existing!.date : undefined }, { paymentId: existing?.id });
    if (held !== null) {
      shortOfCash = true;
      blocking('amount.minor', input.direction === 'paid'
        ? `${account.name} holds ${baseCurrency} ${(Math.max(held, 0) / 100).toFixed(2)}; this payment needs ${baseCurrency} ${(amountBase / 100).toFixed(2)}`
        : `${account.name} has already spent this money; it would be left at ${baseCurrency} ${((held + after) / 100).toFixed(2)}`);
    }
    // Moved off another account: what it brought in there leaves with it.
    if (existing && existing.accountId !== account.id && was > 0) {
      const [old] = await tx.select().from(schema.paymentAccounts).where(eq(schema.paymentAccounts.id, existing.accountId)).for('update');
      const oldHeld = old ? await wouldOverdraw(tx, old, { after: 0, before: was, date: existing.date }, { paymentId: existing.id }) : null;
      if (oldHeld !== null) {
        shortOfCash = true;
        blocking('accountId', `${old!.name} has already spent this money; moving it off would leave ${baseCurrency} ${(oldHeld / 100).toFixed(2)}`);
      }
    }
  }
  // An advance for services: the rate is the category's on the day, kept once taken.
  let advanceTaxRate: string | null = null;
  const advance = input.advanceTax ?? null;
  if (advance) {
    if (input.direction !== 'received') blocking('advanceTax', 'Only money received is an advance taxed on receipt');
    if (!/^\d{2}$/.test(advance.placeOfSupplyStateCode)) blocking('advanceTax.placeOfSupplyStateCode', 'A two-digit state code');
    // The category's rate on the day the advance came in, not one it takes later.
    const onDate = await categoryOn(tx, company.id, advance.taxCategoryId, input.date);
    if (!onDate) blocking('advanceTax.taxCategoryId', 'No such tax category in this company');
    else if (!onDate.available) blocking('advanceTax.taxCategoryId', `${onDate.name} applies from ${onDate.effectiveFrom}; the receipt is dated ${input.date}`);
    else if (!(onDate.rate > 0)) blocking('advanceTax.taxCategoryId', 'An advance taxed at 0% carries no tax; leave it off');
    else advanceTaxRate = existing?.advanceTaxCategoryId === advance.taxCategoryId && existing.advanceTaxRate && existing.date === input.date ? existing.advanceTaxRate : String(onDate.rate);
    const hsn = advance.hsn?.trim();
    if (hsn && !/^\d{4,8}$/.test(hsn)) blocking('advanceTax.hsn', 'A SAC or HSN of 4 to 8 digits');
    // Advances for goods carry no GST (notification 66/2017): only a service's SAC (99…) is taxed on receipt.
    else if (hsn && !hsn.startsWith('99')) blocking('advanceTax.hsn', `${hsn} is goods: an advance for goods carries no GST (notification 66/2017); leave the tax off`);
    if (advance.cessRate != null && !(advance.cessRate >= 0 && advance.cessRate <= 300)) blocking('advanceTax.cessRate', 'A cess rate from 0 to 300 percent');
    // Reverse charge puts the tax on the customer, which only a registered customer can pay (s.9(3)).
    if (advance.reverseCharge && party && !party.taxId) blocking('advanceTax.reverseCharge', `${party.name} has no GSTIN; reverse charge applies only to a registered customer`);
  }
  // A refund pays a customer back out of an advance they paid (Rule 51): it settles nothing else,
  // and takes no more than is left of that advance.
  const refundOf = input.refundOf ?? null;
  let receipt: PaymentRow | undefined;
  if ((existing?.refundOfPaymentId ?? null) !== refundOf && existing) blocking('refundOf', 'A refund stays with the advance it refunds');
  if (refundOf) {
    if (input.direction !== 'paid') blocking('refundOf', 'Only money paid out refunds an advance');
    if (input.allocations.length) blocking('allocations', 'A refund settles no documents');
    [receipt] = await tx.select().from(PAY).where(and(eq(PAY.companyId, company.id), eq(PAY.id, refundOf))).for('update');
    if (!receipt || receipt.direction !== 'received') blocking('refundOf', 'No such receipt in this company');
    else {
      if (receipt.partyId !== input.partyId) blocking('refundOf', `${receipt.number} was received from another party`);
      if (receipt.currency.trim() !== input.currency) blocking('refundOf', `${receipt.number} is in ${receipt.currency.trim()}`);
      if (input.date < receipt.date) blocking('date', `Not before the advance was received (${receipt.date})`);
      // Only cash comes back: TDS the customer kept back from the advance was never paid to us.
      const left = Math.max(receipt.unallocatedMinor - receipt.tdsMinor, 0) + (existing ? existing.amountMinor : 0);
      if (input.amountMinor > left) blocking('amount.minor', `${receipt.number} has ${input.currency} ${(Math.max(left, 0) / 100).toFixed(2)} of its advance left`);
    }
  }
  // A receipt keeps room for what was already paid back out of it.
  const refunded = existing && existing.direction === 'received' ? await refundedFrom(tx, existing.id) : 0;
  if (refunded && input.direction !== 'received') blocking('direction', `${existing!.number} has refunds against it; it stays money received`);
  if (refunded) {
    if (input.partyId !== existing!.partyId || input.currency !== existing!.currency.trim()) blocking('partyId', `${existing!.number} has refunds against it; its party and currency stay`);
    if (allocated + refunded > credit) blocking('allocations', `${input.currency} ${(refunded / 100).toFixed(2)} of it has been refunded; allocations can use only the rest`);
  }
  if (input.tdsSection && input.tdsSection !== 'none' && !tdsSectionOf(input.tdsSection)) blocking('tdsSection', `Unknown TDS section ${input.tdsSection}`);
  // s.269ST: no one may receive ₹2 lakh or more in cash from one person in a day (the penalty is the
  // whole amount). Counted with the party's other cash receipts that day.
  let cashToday = 0;
  if (input.method === 'cash' && exchangeRate && party) {
    const [r] = await tx
      .select({ total: sql<string>`coalesce(sum(round(${PAY.amountMinor} * ${PAY.exchangeRate})), 0)` })
      .from(PAY)
      .where(and(eq(PAY.companyId, company.id), eq(PAY.partyId, input.partyId), eq(PAY.direction, input.direction), eq(PAY.method, 'cash'), eq(PAY.date, input.date), isNull(PAY.refundOfPaymentId), existing ? ne(PAY.id, existing.id) : undefined));
    cashToday = Number(r?.total ?? 0) + Math.round(input.amountMinor * exchangeRate);
    if (input.direction === 'received' && !refundOf && cashToday >= CASH_RECEIPT_LIMIT) {
      blocking('method', `${party.name} would have paid ${baseCurrency} ${(cashToday / 100).toFixed(2)} in cash on ${input.date}; ₹2,00,000 or more in cash from one person in a day is not allowed (s.269ST). Take it by bank`);
    }
  }
  if (issues.length) throw unprocessable(issues, overOutstanding ? 'ALLOCATION_EXCEEDS_OUTSTANDING' : shortOfCash ? 'INSUFFICIENT_BALANCE' : 'VALIDATION_FAILED');

  // FX gain or loss (base currency) when a foreign-currency document settles at another rate.
  let fxGainLossMinor: number | null = null;
  if (input.currency !== baseCurrency) {
    fxGainLossMinor = input.allocations.reduce((s, a) => {
      const doc = docs.find((d) => d.id === a.documentId)!;
      // On all it settles: TDS, discount and write-off clear the invoice at its own rate too.
      const diff = settlementGainLoss({ minor: settles(a), currency: input.currency }, Number(doc.exchangeRate), exchangeRate!, baseCurrency).minor;
      // Receiving more base currency than booked is a gain; paying more is a loss.
      return s + (input.direction === 'received' ? diff : -diff);
    }, 0);
    // A refund pays back an advance taken at the receipt's rate: paying more in base is a loss.
    if (receipt) fxGainLossMinor += -settlementGainLoss({ minor: input.amountMinor, currency: input.currency }, Number(receipt.exchangeRate), exchangeRate!, baseCurrency).minor;
  }

  const columns = {
    branchId: branchId!,
    direction: input.direction,
    partyId: input.partyId,
    date: input.date,
    amountMinor: input.amountMinor,
    currency: input.currency,
    exchangeRate: String(exchangeRate),
    method: input.method,
    reference: input.reference ?? null,
    accountId: input.accountId,
    // A refund is all applied: to the advance it pays back.
    unallocatedMinor: refundOf ? 0 : credit - allocated - refunded,
    fxGainLossMinor,
    advanceTaxCategoryId: advance?.taxCategoryId ?? null,
    advanceTaxRate,
    advancePlaceOfSupply: advance?.placeOfSupplyStateCode ?? null,
    advanceHsn: advance?.hsn?.trim() || null,
    advanceCessRate: advance?.cessRate ? String(advance.cessRate) : null,
    advanceReverseCharge: !!advance?.reverseCharge,
    tdsMinor: input.direction === 'received' ? Math.max(advanceTds, 0) : 0,
    refundOfPaymentId: refundOf,
    // Paid: what was kept back (26Q). Received: what the customer deducted, so it reaches that section's receivable (26AS).
    tdsSection: input.allocations.some((a) => (a.tdsMinor ?? 0) > 0) || advanceTds > 0 ? (input.tdsSection ?? null) : null,
    notes: input.notes ?? null,
  };

  let row: PaymentRow;
  if (existing) {
    const [updated] = await tx
      .update(PAY)
      .set({ ...columns, version: existing.version + 1, updatedAt: opts.now })
      .where(and(eq(PAY.id, existing.id), eq(PAY.version, existing.version)))
      .returning();
    if (!updated) throw preconditionFailed();
    row = updated;
    await tx.delete(A).where(eq(A.paymentId, existing.id));
  } else {
    const number = await assignNumber(tx, { companyId: company.id, kind: 'payment', branchId, date: input.date });
    [row] = await tx
      .insert(PAY)
      .values({ id: newId('pay'), companyId: company.id, number, createdBy: actor.id, ...columns, createdAt: opts.now, updatedAt: opts.now })
      .returning();
  }
  if (input.allocations.length) {
    await tx.insert(A).values(
      input.allocations.map((a) => ({
        id: newId('pal'),
        paymentId: row.id,
        documentId: a.documentId,
        documentNumber: docs.find((d) => d.id === a.documentId)!.number,
        amountMinor: a.amountMinor,
        tdsMinor: a.tdsMinor ?? 0,
        discountMinor: a.discountMinor ?? 0,
        writeOffMinor: a.writeOffMinor ?? 0,
      })),
    );
  }
  await syncPaymentState(tx, actor, company.id, docIds, opts.now);
  if (receipt) await moveRefund(tx, actor, receipt, input.amountMinor - (existing?.amountMinor ?? 0), opts.now);

  await recordChange(tx, actor, {
    companyId: company.id,
    action: existing ? 'updated' : 'created',
    entityType: 'payment',
    entityId: row.id,
    entityLabel: row.number,
    version: row.version,
    before: existing ? { amountMinor: existing.amountMinor, allocations: before.map((b) => ({ documentId: b.documentId, amountMinor: b.amountMinor })) } : undefined,
    after: { amountMinor: row.amountMinor, allocations: input.allocations },
  });
  // s.40A(3): cash paid to one person over ₹10,000 in a day is not allowed as an expense. Allowed to
  // record, but the owners are told, so it is a choice made knowingly.
  if (input.direction === 'paid' && !refundOf && cashToday > CASH_PAYMENT_LIMIT && cashToday - Math.round(input.amountMinor * (exchangeRate ?? 1)) <= CASH_PAYMENT_LIMIT) {
    await notify(tx, deps, {
      companyId: company.id,
      kind: 'system',
      title: 'Cash payment over ₹10,000',
      body: `${row.number}: ${party!.name} has been paid ${noteMoney(cashToday, baseCurrency)} in cash on ${input.date}. Cash over ₹10,000 to one person in a day isn't allowed as an expense for income tax (s.40A(3)); pay by bank where you can.`,
      entityType: 'payment',
      entityId: row.id,
    });
  }
  if (!existing && input.direction === 'received' && (opts.notifyReceived ?? true)) {
    const amount = noteMoney(row.amountMinor, row.currency);
    await notify(tx, deps, {
      companyId: company.id,
      kind: 'paymentReceived',
      title: 'Payment received',
      body: `${row.number}: ${amount} from ${party!.name}.`,
      entityType: 'payment',
      entityId: row.id,
    });
  }
  return row;
}

/** Deletes a payment and its allocations, and re-derives every document it settled. */
export async function deletePayment(tx: DbOrTx, company: CompanyRow, actor: AuthUser, row: PaymentRow, now: Date) {
  assertPeriodOpen(company, row.date);
  await assertPeriodOpenNow(tx, company, row.date);
  await assertNotReconciled(tx, 'payment', row.id, row.number);
  if (row.direction === 'received' && (await refundedFrom(tx, row.id))) throw conflict('PAYMENT_REFUNDED', `${row.number} has refunds against it; remove those first`);
  // Money that came in and has since been spent can't be taken back out of the books (RULES 6.26).
  if (row.direction === 'received') {
    const [account] = await tx.select().from(schema.paymentAccounts).where(eq(schema.paymentAccounts.id, row.accountId)).for('update');
    const held = account ? await wouldOverdraw(tx, account, { after: 0, before: Math.round(row.amountMinor * Number(row.exchangeRate)), date: row.date }, { paymentId: row.id }) : null;
    if (held !== null) throw conflict('INSUFFICIENT_BALANCE', `${account!.name} has already spent this money; deleting ${row.number} would leave it at ${company.baseCurrency.trim()} ${(held / 100).toFixed(2)}`);
  }
  // Removing a refund gives the advance back to the receipt it came out of.
  const [receipt] = row.refundOfPaymentId ? await tx.select().from(PAY).where(eq(PAY.id, row.refundOfPaymentId)).for('update') : [];
  const allocations = await tx.select().from(A).where(eq(A.paymentId, row.id));
  const docIds = [...new Set(allocations.map((a) => a.documentId))].sort();
  if (docIds.length) await tx.select({ id: D.id }).from(D).where(inArray(D.id, docIds)).orderBy(D.id).for('update');
  await tx.delete(A).where(eq(A.paymentId, row.id));
  await tx.update(schema.paymentLinks).set({ paymentId: null }).where(eq(schema.paymentLinks.paymentId, row.id));
  const A2 = schema.attachments;
  await tx.update(A2).set({ entityType: null, entityId: null }).where(and(eq(A2.companyId, company.id), eq(A2.entityType, 'payment'), eq(A2.entityId, row.id)));
  const deleted = await tx.delete(PAY).where(and(eq(PAY.id, row.id), eq(PAY.version, row.version))).returning({ id: PAY.id });
  if (!deleted.length) throw preconditionFailed();
  if (receipt) await moveRefund(tx, actor, receipt, -row.amountMinor, now);
  await syncPaymentState(tx, actor, company.id, docIds, now);
  await recordChange(tx, actor, { companyId: company.id, action: 'deleted', entityType: 'payment', entityId: row.id, entityLabel: row.number, version: row.version + 1, deleted: true });
}

/** Attachments listed on a payment point back at it. */
export async function linkPaymentAttachments(tx: DbOrTx, companyId: string, paymentId: string, ids: string[] | undefined) {
  if (ids === undefined) return;
  const T = schema.attachments;
  await tx.update(T).set({ entityType: null, entityId: null }).where(and(eq(T.companyId, companyId), eq(T.entityType, 'payment'), eq(T.entityId, paymentId)));
  if (ids.length) await tx.update(T).set({ entityType: 'payment', entityId: paymentId }).where(and(eq(T.companyId, companyId), inArray(T.id, ids)));
}
