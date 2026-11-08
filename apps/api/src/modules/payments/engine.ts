import { and, eq, inArray, ne, sql } from 'drizzle-orm';
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
import { assignNumber } from '../../lib/numbering';
import { notify, noteMoney } from '../../lib/notify';
import { rateToBase } from '../documents/engine';
import { assertPeriodOpen, syncPaymentState } from '../documents/lifecycle';
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
  advanceTax?: { taxCategoryId: string; placeOfSupplyStateCode: string; hsn?: string; cessRate?: number } | null;
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
  if (existing) assertPeriodOpen(company, existing.date);

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
  else if (!accountFitsMethod(input.method, { ...account, currency: account.currency.trim(), openingBalance: { minor: account.openingBalanceMinor, currency: account.currency.trim() }, openingBalanceDate: account.openingBalanceDate ?? undefined, openingRate: Number(account.openingRate), accountNumber: account.accountNumber ?? undefined })) {
    blocking('accountId', `A ${input.method} payment cannot go through a ${account.type} account`);
  }
  if (input.amountCurrency && input.amountCurrency !== input.currency) blocking('amount.currency', `Must match the payment currency (${input.currency})`);
  // A receipt may move no money when it only records TDS deducted, a discount or a write-off.
  const adjusting = input.allocations.some((a) => adjusts(a) > 0);
  if (!(input.amountMinor > 0) && !(adjusting && input.amountMinor === 0)) blocking('amount.minor', 'Must be more than zero');
  if (input.allocations.some((a) => (a.writeOffMinor ?? 0) > 0) && !['owner', 'admin', 'accountant'].includes(actor.companyRoles?.[company.id] ?? actor.role)) {
    blocking('allocations', 'Only an owner, admin or accountant can write off what a party owes');
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
  input.allocations.forEach((a, i) => {
    const field = `allocations[${i}]`;
    const doc = docs.find((d) => d.id === a.documentId);
    if (!doc) return blocking(`${field}.documentId`, 'No such document in this company');
    if (merged.has(a.documentId)) return blocking(`${field}.documentId`, `${doc.number} is allocated twice`);
    merged.set(a.documentId, a.amountMinor);
    if (doc.partyId !== input.partyId) blocking(`${field}.documentId`, `${doc.number} belongs to another party`);
    if (!wanted.includes(doc.kind)) blocking(`${field}.documentId`, `A ${input.direction} payment settles ${input.direction === 'received' ? 'invoices and debit notes' : 'purchase bills and supplier debit notes'}, not a ${doc.kind}`);
    if (!isFinalized(doc.status) || doc.status === 'cancelled') blocking(`${field}.documentId`, `${doc.number} is ${doc.status}`);
    if (doc.currency.trim() !== input.currency) blocking(`${field}.documentId`, `${doc.number} is in ${doc.currency.trim()}, the payment in ${input.currency}`);
    if (a.currency && a.currency !== input.currency) blocking(`${field}.amount.currency`, `Must be in the payment currency (${input.currency})`);
    for (const k of ['amountMinor', 'tdsMinor', 'discountMinor', 'writeOffMinor'] as const) {
      if ((a[k] ?? 0) < 0) return blocking(`${field}.${k}`, 'Cannot be negative');
    }
    if (!(settles(a) > 0)) return blocking(`${field}.amount.minor`, 'Must be more than zero');
    // TDS is kept back once (RULES 4.16, pending CA): a bill that kept it back under this section takes no more on what pays it.
    if (input.direction === 'paid' && (a.tdsMinor ?? 0) > 0 && doc.tdsAmountMinor > 0 && (!input.tdsSection || input.tdsSection === 'none' || doc.tdsSection === input.tdsSection)) {
      blocking(`${field}.tdsDeducted`, `${doc.number} already kept back TDS under ${doc.tdsSection ?? 'its section'}; it is not deducted again on the payment`);
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
  const credit = input.amountMinor + Math.max(advanceTds, 0);
  if (allocated > credit) blocking('allocations', `Allocations (${input.currency} ${(allocated / 100).toFixed(2)}) exceed the payment (${input.currency} ${(credit / 100).toFixed(2)})`);

  // No account pays out more than it holds: cash, bank or wallet.
  let shortOfCash = false;
  if (input.direction === 'paid' && account && exchangeRate && !issues.length) {
    const balance = await accountBalanceMinor(tx, account, existing?.id);
    const amountBase = Math.round(input.amountMinor * exchangeRate);
    if (amountBase > balance) {
      shortOfCash = true;
      blocking('amount.minor', `${account.name} holds ${baseCurrency} ${(Math.max(balance, 0) / 100).toFixed(2)}; this payment needs ${baseCurrency} ${(amountBase / 100).toFixed(2)}`);
    }
  }
  // An advance for services: the rate is the category's on the day, kept once taken.
  let advanceTaxRate: string | null = null;
  const advance = input.advanceTax ?? null;
  if (advance) {
    if (input.direction !== 'received') blocking('advanceTax', 'Only money received is an advance taxed on receipt');
    if (!/^\d{2}$/.test(advance.placeOfSupplyStateCode)) blocking('advanceTax.placeOfSupplyStateCode', 'A two-digit state code');
    const T = schema.taxCategories;
    const [tax] = await tx.select({ rate: T.rate }).from(T).where(and(eq(T.companyId, company.id), eq(T.id, advance.taxCategoryId)));
    if (!tax) blocking('advanceTax.taxCategoryId', 'No such tax category in this company');
    else if (!(Number(tax.rate) > 0)) blocking('advanceTax.taxCategoryId', 'An advance taxed at 0% carries no tax; leave it off');
    else advanceTaxRate = existing?.advanceTaxCategoryId === advance.taxCategoryId && existing.advanceTaxRate && existing.date === input.date ? existing.advanceTaxRate : String(tax.rate);
    const hsn = advance.hsn?.trim();
    if (hsn && !/^\d{4,8}$/.test(hsn)) blocking('advanceTax.hsn', 'A SAC or HSN of 4 to 8 digits');
    // Advances for goods carry no GST (notification 66/2017): only a service's SAC (99…) is taxed on receipt.
    else if (hsn && !hsn.startsWith('99')) blocking('advanceTax.hsn', `${hsn} is goods: an advance for goods carries no GST (notification 66/2017); leave the tax off`);
    if (advance.cessRate != null && !(advance.cessRate >= 0 && advance.cessRate <= 300)) blocking('advanceTax.cessRate', 'A cess rate from 0 to 300 percent');
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
      const left = receipt.unallocatedMinor + (existing ? existing.amountMinor : 0);
      if (input.amountMinor > left) blocking('amount.minor', `${receipt.number} has ${input.currency} ${(Math.max(left, 0) / 100).toFixed(2)} of its advance left`);
    }
  }
  // A receipt keeps room for what was already paid back out of it.
  const refunded = existing && input.direction === 'received' ? await refundedFrom(tx, existing.id) : 0;
  if (refunded) {
    if (input.partyId !== existing!.partyId || input.currency !== existing!.currency.trim()) blocking('partyId', `${existing!.number} has refunds against it; its party and currency stay`);
    if (allocated + refunded > credit) blocking('allocations', `${input.currency} ${(refunded / 100).toFixed(2)} of it has been refunded; allocations can use only the rest`);
  }
  if (input.tdsSection && input.tdsSection !== 'none' && !tdsSectionOf(input.tdsSection)) blocking('tdsSection', `Unknown TDS section ${input.tdsSection}`);
  if (issues.length) throw unprocessable(issues, overOutstanding ? 'ALLOCATION_EXCEEDS_OUTSTANDING' : shortOfCash ? 'INSUFFICIENT_BALANCE' : 'VALIDATION_FAILED');

  // FX gain or loss (base currency) when a foreign-currency document settles at another rate.
  let fxGainLossMinor: number | null = null;
  if (input.currency !== baseCurrency) {
    fxGainLossMinor = input.allocations.reduce((s, a) => {
      const doc = docs.find((d) => d.id === a.documentId)!;
      const diff = settlementGainLoss({ minor: a.amountMinor, currency: input.currency }, Number(doc.exchangeRate), exchangeRate!, baseCurrency).minor;
      // Receiving more base currency than booked is a gain; paying more is a loss.
      return s + (input.direction === 'received' ? diff : -diff);
    }, 0);
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
  if (row.direction === 'received' && (await refundedFrom(tx, row.id))) throw conflict('PAYMENT_REFUNDED', `${row.number} has refunds against it; remove those first`);
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
