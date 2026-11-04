import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { PAYABLE_KINDS, RECEIVABLE_KINDS, isFinalized } from '@esmart/core/domain/documentStates';
import { settlementGainLoss } from '@esmart/core/domain/fx';
import { accountFitsMethod } from '@esmart/core/domain/paymentAccounts';
import { FULL_PLAN, hasModule } from '@esmart/core/domain/plan';
import type { PaymentMethod } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow, Deps } from '../../context';
import { planUpgradeRequired, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { assignNumber } from '../../lib/numbering';
import { notify } from '../../lib/notify';
import { rateToBase } from '../documents/engine';
import { assertPeriodOpen, syncPaymentState } from '../documents/lifecycle';
import type { PaymentRow } from './wire';

const PAY = schema.payments;
const A = schema.paymentAllocations;
const D = schema.documents;

/**
 * An account's balance in base-currency minor units, as core's
 * `accountBalances` computes it: opening + received − paid − expenses.
 * `exceptPaymentId` leaves out a payment being rewritten.
 */
export async function accountBalanceMinor(tx: DbOrTx, account: typeof schema.paymentAccounts.$inferSelect, exceptPaymentId?: string, exceptVoucherId?: string): Promise<number> {
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
    .where(eq(E.accountId, account.id));
  const net = pays.reduce((s, p) => s + (p.direction === 'received' ? 1 : -1) * Number(p.total), 0);
  // Contra and journal vouchers that moved money in or out of it.
  const V = schema.vouchers;
  const [moved] = await tx
    .select({ total: sql<string>`coalesce(sum((l->>'debitMinor')::bigint - (l->>'creditMinor')::bigint), 0)` })
    .from(sql`${V}, jsonb_array_elements(${V.lines}) as l`)
    .where(and(eq(V.companyId, account.companyId), sql`l->>'account' = ${`pay:${account.id}`}`, exceptVoucherId ? ne(V.id, exceptVoucherId) : undefined));
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
  advanceTax?: { taxCategoryId: string; placeOfSupplyStateCode: string } | null;
  /** `amountMinor` is cash; the other three settle the document without money moving. */
  allocations: { documentId: string; amountMinor: number; tdsMinor?: number; discountMinor?: number; writeOffMinor?: number; currency?: string }[];
};

/** What one allocation settles: cash plus TDS deducted, discount and write-off. */
const settles = (a: PaymentInput['allocations'][number]) => a.amountMinor + (a.tdsMinor ?? 0) + (a.discountMinor ?? 0) + (a.writeOffMinor ?? 0);
const adjusts = (a: PaymentInput['allocations'][number]) => (a.tdsMinor ?? 0) + (a.discountMinor ?? 0) + (a.writeOffMinor ?? 0);

/** Paying suppliers is the payables module (Pro and up). */
export function assertDirectionAllowed(company: CompanyRow, direction: 'received' | 'paid') {
  if (direction === 'paid' && !hasModule(company.plan, 'payables')) throw planUpgradeRequired(FULL_PLAN, 'payables');
}

/**
 * Records a new payment, or rewrites `existing`, inside `tx`. This is where
 * the ledger's invariants are kept:
 *
 * - each allocation is to a finalised, uncancelled document of the same
 *   party and currency, of the kind that fits the direction (received →
 *   invoice, paid → purchase bill), and no more than what it still owes;
 * - the allocations add up to no more than the payment;
 * - `unallocated_minor` = amount − allocations (the party's advance);
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
  if (allocated > input.amountMinor) blocking('allocations', `Allocations (${input.currency} ${(allocated / 100).toFixed(2)}) exceed the payment (${input.currency} ${(input.amountMinor / 100).toFixed(2)})`);

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
  }
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
    unallocatedMinor: input.amountMinor - allocated,
    fxGainLossMinor,
    advanceTaxCategoryId: advance?.taxCategoryId ?? null,
    advanceTaxRate,
    advancePlaceOfSupply: advance?.placeOfSupplyStateCode ?? null,
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
    const amount = `${row.currency.trim()} ${(row.amountMinor / 100).toFixed(2)}`;
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
  const allocations = await tx.select().from(A).where(eq(A.paymentId, row.id));
  const docIds = [...new Set(allocations.map((a) => a.documentId))].sort();
  if (docIds.length) await tx.select({ id: D.id }).from(D).where(inArray(D.id, docIds)).orderBy(D.id).for('update');
  await tx.delete(A).where(eq(A.paymentId, row.id));
  await tx.update(schema.paymentLinks).set({ paymentId: null }).where(eq(schema.paymentLinks.paymentId, row.id));
  const A2 = schema.attachments;
  await tx.update(A2).set({ entityType: null, entityId: null }).where(and(eq(A2.companyId, company.id), eq(A2.entityType, 'payment'), eq(A2.entityId, row.id)));
  const deleted = await tx.delete(PAY).where(and(eq(PAY.id, row.id), eq(PAY.version, row.version))).returning({ id: PAY.id });
  if (!deleted.length) throw preconditionFailed();
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
