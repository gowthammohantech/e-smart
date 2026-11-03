import { and, eq, gte, inArray, ne, notInArray, sql, type SQL } from 'drizzle-orm';
import { businessDate } from '@esmart/core/lib/date';
import { INVOICE_LIMITS, nextInvoicePlan } from '@esmart/core/domain/plan';
import { isFinalized, isPayableDocument } from '@esmart/core/domain/documentStates';
import { statusForOutstanding } from '@esmart/core/domain/receivables';
import { MOVEMENT_SIGN, signedQuantity, stockMapOn } from '@esmart/core/domain/stockLedger';
import type { BusinessDocument, DocStatus, DocumentKind, StockMovement, StockMovementType } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow } from '../../context';
import { conflict, invoiceLimitReached, preconditionFailed, unprocessable } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { partyBalances } from '../../lib/balances';
import { newId } from '../../lib/ids';
import { assignNumber } from '../../lib/numbering';
import { replayQueuedAt } from '../../lib/replay';
import type { DocRow } from './engine';

const D = schema.documents;
const M = schema.stockMovements;

/** Statuses the server derives from payments and the due date; clients never set them. */
export const DERIVED: DocStatus[] = ['paid', 'partiallyPaid', 'overdue'];
const SETTLEMENT: DocStatus[] = ['issued', 'partiallyPaid', 'paid', 'overdue'];

/** Where `finalizeDocument` takes each kind (FRD 9). */
export const FINAL_STATUS: Record<DocumentKind, DocStatus> = {
  quote: 'sent',
  salesOrder: 'confirmed',
  purchaseOrder: 'confirmed',
  delivery: 'delivered',
  goodsReceipt: 'received',
  salesReturn: 'approved',
  purchaseReturn: 'approved',
  invoice: 'issued',
  purchaseBill: 'issued',
};

/** Which kinds each kind converts into (quote → order → delivery → invoice, PO → receipt → bill, invoice/bill → return). */
export const CONVERSIONS: Record<DocumentKind, DocumentKind[]> = {
  quote: ['salesOrder', 'invoice'],
  salesOrder: ['delivery', 'invoice'],
  delivery: ['invoice'],
  invoice: ['salesReturn'],
  salesReturn: [],
  purchaseOrder: ['goodsReceipt', 'purchaseBill'],
  goodsReceipt: ['purchaseBill'],
  purchaseBill: ['purchaseReturn'],
  purchaseReturn: [],
};

export const today = (d: Date) => businessDate(d);

/**
 * The status a document is in right now. Invoices and bills past issue take
 * theirs from `@esmart/core` receivables (paid / partly paid / overdue from
 * `amount_paid_minor` and the due date), so an invoice becomes overdue the
 * day after it falls due without anything being written.
 */
export function effectiveStatus(row: Pick<DocRow, 'kind' | 'status' | 'grandTotalMinor' | 'amountPaidMinor' | 'dueDate'>, asOf: string): DocStatus {
  if (!isPayableDocument(row.kind) || !SETTLEMENT.includes(row.status)) return row.status;
  const doc = { status: 'issued', totals: { grandTotal: { minor: row.grandTotalMinor } }, dueDate: row.dueDate ?? undefined } as BusinessDocument;
  return statusForOutstanding(doc, { minor: row.grandTotalMinor - row.amountPaidMinor, currency: '' }, asOf);
}

/** `effectiveStatus` in SQL, for filtering lists by status. Keep the two in step. */
export function effectiveStatusSql(asOf: string): SQL<string> {
  return sql<string>`(case when ${D.kind} in ('invoice', 'purchaseBill') and ${D.status} in ('issued', 'partiallyPaid', 'paid', 'overdue') then
    case when ${D.grandTotalMinor} - ${D.amountPaidMinor} <= 0 then 'paid'
         when ${D.dueDate} is not null and ${D.dueDate} < ${asOf} then 'overdue'
         when ${D.amountPaidMinor} > 0 then 'partiallyPaid'
         else 'issued' end
    else ${D.status}::text end)`;
}

// ------------------------------------------------------------ stock

/** The movement a finalised document writes, per `@esmart/core` stockLedger types. */
function movementTypeFor(kind: DocumentKind): StockMovementType | null {
  switch (kind) {
    case 'invoice':
    case 'delivery':
      return 'salesIssue';
    case 'goodsReceipt':
    case 'purchaseBill':
      return 'purchaseReceipt';
    case 'salesReturn':
      return 'salesReturn';
    case 'purchaseReturn':
      return 'purchaseReturn';
    default:
      return null;
  }
}

/** Net quantity per reference that is still on the books (posted minus reversed). */
async function netPosted(tx: DbOrTx, referenceIds: string[]) {
  if (!referenceIds.length) return [];
  return tx
    .select({ referenceId: M.referenceId, itemId: M.itemId, branchId: M.branchId, net: sql<string>`sum(${M.quantity})` })
    .from(M)
    .where(inArray(M.referenceId, referenceIds))
    .groupBy(M.referenceId, M.itemId, M.branchId);
}

/**
 * Has the stock for this invoice (bill) already moved on a delivery note
 * (goods receipt) in its chain? Either one it was converted from, or one
 * raised from the same order. Then the invoice must not move it again.
 */
async function movedUpstream(tx: DbOrTx, row: DocRow): Promise<boolean> {
  const pair = row.kind === 'invoice' ? { via: 'delivery', order: 'salesOrder' } : row.kind === 'purchaseBill' ? { via: 'goodsReceipt', order: 'purchaseOrder' } : null;
  if (!pair) return false;
  const via: string[] = [];
  const orders: string[] = [];
  let sourceId = row.sourceDocumentId;
  for (let depth = 0; sourceId && depth < 10; depth++) {
    const [src] = await tx.select({ id: D.id, kind: D.kind, sourceDocumentId: D.sourceDocumentId }).from(D).where(eq(D.id, sourceId));
    if (!src) break;
    if (src.kind === pair.via) via.push(src.id);
    if (src.kind === pair.order) orders.push(src.id);
    sourceId = src.sourceDocumentId;
  }
  if (orders.length) {
    const siblings = await tx
      .select({ id: D.id })
      .from(D)
      .where(and(inArray(D.sourceDocumentId, orders), eq(D.kind, pair.via as DocumentKind)));
    via.push(...siblings.map((s) => s.id));
  }
  return (await netPosted(tx, via)).some((r) => Number(r.net) !== 0);
}

/**
 * Writes the stock movements for a document that has just been finalised:
 * one per line whose item tracks inventory. Quantities are signed (the
 * ledger's convention), with the sign from `@esmart/core` MOVEMENT_SIGN.
 *
 * Unless the company allows negative stock, a document that takes stock out
 * (a sale, a delivery, a purchase return) may not take a tracked item below
 * zero at its branch: that is 422 INSUFFICIENT_STOCK and the whole
 * finalisation rolls back.
 */
export async function postStock(tx: DbOrTx, company: CompanyRow, row: DocRow, actorId: string): Promise<number> {
  const type = movementTypeFor(row.kind);
  if (!type) return 0;
  if ((await netPosted(tx, [row.id])).some((r) => Number(r.net) !== 0)) return 0;
  if (await movedUpstream(tx, row)) return 0;

  const lines = await tx.select().from(schema.documentLines).where(eq(schema.documentLines.documentId, row.id));
  const itemIds = [...new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x))];
  if (!itemIds.length) return 0;
  // Locked so two sales finalised at once cannot both spend the same stock.
  const items = await tx
    .select()
    .from(schema.items)
    .where(and(eq(schema.items.companyId, row.companyId), inArray(schema.items.id, itemIds)))
    .orderBy(schema.items.id)
    .for('update');
  const tracked = new Map(items.filter((i) => i.trackInventory && i.type === 'goods').map((i) => [i.id, i]));
  const baseCurrency = company.baseCurrency.trim();
  const rate = Number(row.exchangeRate) || 1;

  const values = lines
    .filter((l) => l.itemId && tracked.has(l.itemId))
    .map((l) => {
      const item = tracked.get(l.itemId!)!;
      const quantity = Number(l.quantity);
      const signed = signedQuantity({ type, quantity } as Parameters<typeof signedQuantity>[0]);
      // Receipts are valued at what was paid; issues and returns at the item's cost.
      const cost = type === 'purchaseReceipt' ? { minor: Math.round(l.unitPriceMinor * rate), currency: baseCurrency } : { minor: item.purchasePriceMinor, currency: item.currency.trim() };
      return {
        id: newId('stk'),
        companyId: row.companyId,
        branchId: row.branchId,
        itemId: item.id,
        type,
        quantity: String(signed),
        currency: cost.currency,
        unitCostMinor: cost.minor,
        date: row.date,
        referenceType: 'document',
        referenceId: row.id,
        referenceNumber: row.number,
        createdBy: actorId,
      };
    });
  if (values.length && MOVEMENT_SIGN[type] < 0 && !company.allowNegativeStock) {
    const need = new Map<string, number>();
    for (const v of values) need.set(v.itemId, (need.get(v.itemId) ?? 0) + Math.abs(Number(v.quantity)));
    // Only stock there on the document date counts, and never more than the lowest it
    // gets on a later day: the same rule the app checks before finalising.
    const ledger = await tx
      .select({ itemId: M.itemId, branchId: M.branchId, type: M.type, quantity: M.quantity, date: M.date })
      .from(M)
      .where(and(eq(M.companyId, row.companyId), eq(M.branchId, row.branchId), inArray(M.itemId, [...need.keys()])));
    const available = stockMapOn(ledger.map((m) => ({ ...m, quantity: Number(m.quantity) }) as StockMovement), row.date, row.branchId);
    const onHand = new Map([...need.keys()].map((id) => [id, available[id] ?? 0]));
    const short = [...need].filter(([id, qty]) => (onHand.get(id) ?? 0) < qty);
    if (short.length) {
      throw unprocessable(
        short.map(([id, qty]) => {
          const item = tracked.get(id)!;
          const line = lines.find((l) => l.itemId === id)!;
          return {
            field: `lines[${line.position - 1}].quantity`,
            message: `${item.name}: ${onHand.get(id) ?? 0} ${item.unit} in stock at this branch on ${row.date}, ${qty} needed`,
            severity: 'blocking' as const,
          };
        }),
        'INSUFFICIENT_STOCK',
      );
    }
  }
  if (values.length) await tx.insert(M).values(values);
  return values.length;
}

/**
 * Reverses what a document put on the stock ledger. The ledger is
 * append-only, so this adds an adjustment per item and branch that brings
 * the document's net back to zero.
 */
export async function reverseStock(tx: DbOrTx, company: CompanyRow, row: DocRow, actorId: string, why: string): Promise<number> {
  const open = (await netPosted(tx, [row.id])).filter((r) => Number(r.net) !== 0);
  if (!open.length) return 0;
  // Taking back stock this document brought in: it may have been sold since.
  const incoming = open.filter((r) => Number(r.net) > 0);
  if (incoming.length && !company.allowNegativeStock) {
    const ids = [...new Set(incoming.map((r) => r.itemId))].sort();
    const items = await tx.select().from(schema.items).where(and(eq(schema.items.companyId, row.companyId), inArray(schema.items.id, ids))).orderBy(schema.items.id).for('update');
    const ledger = await tx.select({ itemId: M.itemId, branchId: M.branchId, type: M.type, quantity: M.quantity, date: M.date }).from(M).where(and(eq(M.companyId, row.companyId), inArray(M.itemId, ids)));
    const issues = incoming.flatMap((r) => {
      const available = stockMapOn(ledger.map((m) => ({ ...m, quantity: Number(m.quantity) }) as StockMovement), row.date, r.branchId)[r.itemId] ?? 0;
      if (available >= Number(r.net)) return [];
      const item = items.find((i) => i.id === r.itemId);
      return [{ field: 'status', message: `${item?.name ?? r.itemId}: ${available} in stock, and reversing ${row.number} takes back ${Number(r.net)}`, severity: 'blocking' as const }];
    });
    if (issues.length) throw unprocessable(issues, 'INSUFFICIENT_STOCK');
  }
  await tx.insert(M).values(
    open.map((r) => ({
      id: newId('stk'),
      companyId: row.companyId,
      branchId: r.branchId,
      itemId: r.itemId,
      type: 'adjustment' as const,
      quantity: String(-Number(r.net)),
      currency: company.baseCurrency.trim(),
      unitCostMinor: 0,
      date: row.date,
      referenceType: 'document',
      referenceId: row.id,
      referenceNumber: row.number,
      adjustReason: 'other' as const,
      notes: `Reversed: ${row.number} ${why}`,
      createdBy: actorId,
    })),
  );
  return open.length;
}

// ------------------------------------------------------------ transitions

/**
 * An invoice may not take its customer past their credit limit unless the
 * caller says so (`overrideCreditLimit`, which the app sends once the user
 * has seen the warning): 422 CREDIT_LIMIT_EXCEEDED. Exposure is what the
 * customer already owes on open invoices plus this one; `row` is still a
 * draft here, so it is not counted twice.
 */
async function checkCreditLimit(tx: DbOrTx, row: DocRow, now: Date): Promise<void> {
  if (row.kind !== 'invoice') return;
  const [party] = await tx.select().from(schema.parties).where(eq(schema.parties.id, row.partyId));
  if (!party?.creditLimitMinor || party.creditLimitMinor <= 0) return;
  const balances = await partyBalances(tx, row.companyId, [{ id: party.id, kind: 'customer' }], today(now));
  const exposure = (balances.get(party.id)?.outstanding ?? 0) + row.grandTotalMinor;
  if (exposure <= party.creditLimitMinor) return;
  const amount = (minor: number) => `${party.currency.trim()} ${(minor / 100).toFixed(2)}`;
  throw unprocessable(
    [{ field: 'partyId', message: `${party.name} would owe ${amount(exposure)}, over their credit limit of ${amount(party.creditLimitMinor)}`, severity: 'blocking' }],
    'CREDIT_LIMIT_EXCEEDED',
  );
}

/**
 * Takes a draft to a finalised status inside `tx`: draws its number from the
 * series, writes stock, and settles invoices and bills to their derived
 * status. The caller has already recomputed and saved the totals.
 */
export async function finalizeInTx(
  tx: DbOrTx,
  company: CompanyRow,
  actor: AuthUser,
  row: DocRow,
  target: DocStatus,
  now: Date,
  opts: { overrideCreditLimit?: boolean } = {},
): Promise<DocRow> {
  assertPeriodOpen(company, row.date);
  if (TAX_DOCUMENTS.includes(row.kind) && row.date > addDays(today(now), 1)) {
    throw unprocessable([{ field: 'date', message: `A ${row.kind} cannot be dated ${row.date}, in the future`, severity: 'blocking' }], 'DOCUMENT_DATED_IN_FUTURE');
  }
  if (row.kind === 'invoice') await checkInvoiceLimit(tx, company, now);
  if (isReturn(row) && row.sourceDocumentId) await checkReturnWithinSource(tx, row);
  if (!opts.overrideCreditLimit) await checkCreditLimit(tx, row, now);
  const number = await assignNumber(tx, { companyId: row.companyId, kind: row.kind, branchId: row.branchId, date: row.date });
  const status = effectiveStatus({ ...row, status: target }, today(now));
  // The returns report the party as registered when the document was issued, whatever changes later.
  const [party] = await tx
    .select({ taxId: schema.parties.taxId, stateCode: schema.parties.billingStateCode })
    .from(schema.parties)
    .where(eq(schema.parties.id, row.partyId));
  const [updated] = await tx
    .update(D)
    .set({ number, status, finalizedAt: now, partyGstin: party?.taxId ?? null, partyStateCode: party?.stateCode ?? null, version: row.version + 1, updatedAt: now })
    .where(and(eq(D.id, row.id), eq(D.version, row.version)))
    .returning();
  if (!updated) throw preconditionFailed();
  await postStock(tx, company, updated, actor.id);
  if (isReturn(updated) && updated.sourceDocumentId) await syncPaymentState(tx, actor, updated.companyId, [updated.sourceDocumentId], now);
  return updated;
}

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Dated by the business itself, and what the tax return is built from. */
const TAX_DOCUMENTS: DocumentKind[] = ['invoice', 'salesReturn', 'purchaseBill', 'purchaseReturn'];
const RETURN_KINDS: DocumentKind[] = ['salesReturn', 'purchaseReturn'];
export const isReturn = (row: Pick<DocRow, 'kind'>) => RETURN_KINDS.includes(row.kind);
/** A return that counts: approved or issued, and not since withdrawn. */
const LIVE_RETURN = notInArray(D.status, ['draft', 'requested', 'cancelled', 'rejected']);

/** Books closed up to a date stay as they were filed. */
export function assertPeriodOpen(company: CompanyRow, date: string) {
  if (company.lockedThroughDate && date <= company.lockedThroughDate) {
    throw conflict('PERIOD_LOCKED', `The books are closed through ${company.lockedThroughDate}; an owner must reopen them to change a document dated ${date}`);
  }
}

/** How long a queued invoice may have waited for it to count as already issued on the device. */
const OFFLINE_GRACE_MS = 10 * 60_000;

/**
 * The free plan's monthly invoices. An invoice issued offline was given to a
 * customer before the server could say no, so one that has been waiting in a
 * queue goes through; it's only the next one made online that is refused.
 */
async function checkInvoiceLimit(tx: DbOrTx, company: CompanyRow, now: Date) {
  const limit = INVOICE_LIMITS[company.plan];
  if (limit === null) return;
  const queuedAt = replayQueuedAt.getStore();
  if (queuedAt && now.getTime() - queuedAt.getTime() > OFFLINE_GRACE_MS) return;
  const monthStart = new Date(`${today(now).slice(0, 7)}-01T00:00:00+05:30`);
  const [{ used }] = await tx
    .select({ used: sql<number>`count(*)::int` })
    .from(D)
    .where(and(eq(D.companyId, company.id), eq(D.kind, 'invoice'), gte(D.finalizedAt, monthStart)));
  if (used >= limit) throw invoiceLimitReached(company.plan, limit, nextInvoicePlan(company.plan));
}

/** What's returned against a document can't add up to more than it had, per item, across all its returns. */
async function checkReturnWithinSource(tx: DbOrTx, row: DocRow) {
  const L = schema.documentLines;
  const [source] = await tx.select({ id: D.id, number: D.number }).from(D).where(eq(D.id, row.sourceDocumentId!)).for('update');
  if (!source) return;
  const keyOf = (l: { itemId: string | null; name: string }) => l.itemId ?? l.name;
  const total = (lines: { itemId: string | null; name: string; quantity: string }[]) => {
    const out = new Map<string, number>();
    for (const l of lines) out.set(keyOf(l), (out.get(keyOf(l)) ?? 0) + Number(l.quantity));
    return out;
  };
  const sold = total(await tx.select().from(L).where(eq(L.documentId, source.id)));
  const earlier = total(
    await tx
      .select({ itemId: L.itemId, name: L.name, quantity: L.quantity })
      .from(L)
      .innerJoin(D, eq(D.id, L.documentId))
      .where(and(eq(D.sourceDocumentId, source.id), inArray(D.kind, RETURN_KINDS), LIVE_RETURN, ne(D.id, row.id))),
  );
  const lines = await tx.select().from(L).where(eq(L.documentId, row.id));
  const issues = [...total(lines)]
    .filter(([key, qty]) => qty + (earlier.get(key) ?? 0) > (sold.get(key) ?? 0))
    .map(([key, qty]) => {
      const line = lines.find((l) => keyOf(l) === key)!;
      const left = (sold.get(key) ?? 0) - (earlier.get(key) ?? 0);
      return { field: `lines[${line.position - 1}].quantity`, message: `${line.name}: ${Math.max(left, 0)} left to return on ${source.number}, ${qty} on this return`, severity: 'blocking' as const };
    });
  if (issues.length) throw unprocessable(issues, 'RETURN_EXCEEDS_SOURCE');
}

/** A document can't be cancelled while a return stands against it. */
export async function assertNoLiveReturns(tx: DbOrTx, row: DocRow) {
  const [live] = await tx.select({ number: D.number }).from(D).where(and(eq(D.sourceDocumentId, row.id), inArray(D.kind, RETURN_KINDS), LIVE_RETURN)).limit(1);
  if (live) throw conflict('DOCUMENT_HAS_RETURNS', `Cancel return ${live.number} before cancelling ${row.number}`);
}

/**
 * Re-derives `amount_paid_minor` (the sum of the document's allocations and
 * of what its returns credit, the
 * invariant the ledger and balances rely on) and the settlement status of
 * each document, and records a change for each one that moved. Callers lock
 * the documents first.
 */
export async function syncPaymentState(tx: DbOrTx, actor: AuthUser, companyId: string, documentIds: string[], now: Date): Promise<void> {
  const ids = [...new Set(documentIds)];
  if (!ids.length) return;
  const A = schema.paymentAllocations;
  const sums = await tx
    .select({ documentId: A.documentId, paid: sql<number>`coalesce(sum(${A.amountMinor}), 0)::bigint` })
    .from(A)
    .where(inArray(A.documentId, ids))
    .groupBy(A.documentId);
  const paidOf = new Map(sums.map((s) => [s.documentId, Number(s.paid)]));
  // A return settles what it credits, as far as there's anything left to settle.
  const credits = await tx
    .select({ documentId: D.sourceDocumentId, credited: sql<number>`coalesce(sum(${D.grandTotalMinor}), 0)::bigint` })
    .from(D)
    .where(and(inArray(D.sourceDocumentId, ids), inArray(D.kind, RETURN_KINDS), LIVE_RETURN))
    .groupBy(D.sourceDocumentId);
  const creditOf = new Map(credits.map((c) => [c.documentId, Number(c.credited)]));
  const rows = await tx.select().from(D).where(and(eq(D.companyId, companyId), inArray(D.id, ids)));
  for (const row of rows) {
    const allocated = paidOf.get(row.id) ?? 0;
    const amountPaidMinor = Math.max(allocated, Math.min(allocated + (creditOf.get(row.id) ?? 0), row.grandTotalMinor));
    const status = isFinalized(row.status) ? effectiveStatus({ ...row, amountPaidMinor }, today(now)) : row.status;
    if (amountPaidMinor === row.amountPaidMinor && status === row.status) continue;
    const [updated] = await tx
      .update(D)
      .set({ amountPaidMinor, status, version: row.version + 1, updatedAt: now })
      .where(eq(D.id, row.id))
      .returning();
    await recordChange(tx, actor, {
      companyId,
      action: status !== row.status ? `marked ${status}` : 'payment applied',
      entityType: 'document',
      entityId: row.id,
      entityLabel: row.number,
      version: updated.version,
      before: { status: row.status, amountPaidMinor: row.amountPaidMinor },
      after: { status, amountPaidMinor },
    });
  }
}
