import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { isFinalized, isPayableDocument } from '@esmart/core/domain/documentStates';
import { statusForOutstanding } from '@esmart/core/domain/receivables';
import { MOVEMENT_SIGN, signedQuantity } from '@esmart/core/domain/stockLedger';
import type { BusinessDocument, DocStatus, DocumentKind, StockMovementType } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow } from '../../context';
import { preconditionFailed, unprocessable } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { partyBalances } from '../../lib/balances';
import { newId } from '../../lib/ids';
import { assignNumber } from '../../lib/numbering';
import { stockOnHand } from '../catalog/stock';
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

export const today = (d: Date) => d.toISOString().slice(0, 10);

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
    const onHand = await stockOnHand(tx, row.companyId, [...need.keys()], row.branchId);
    const short = [...need].filter(([id, qty]) => (onHand.get(id) ?? 0) < qty);
    if (short.length) {
      throw unprocessable(
        short.map(([id, qty]) => {
          const item = tracked.get(id)!;
          const line = lines.find((l) => l.itemId === id)!;
          return {
            field: `lines[${line.position - 1}].quantity`,
            message: `${item.name}: ${onHand.get(id) ?? 0} ${item.unit} in stock at this branch, ${qty} needed`,
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
  if (!opts.overrideCreditLimit) await checkCreditLimit(tx, row, now);
  const number = await assignNumber(tx, { companyId: row.companyId, kind: row.kind, branchId: row.branchId, date: row.date });
  const status = effectiveStatus({ ...row, status: target }, today(now));
  const [updated] = await tx
    .update(D)
    .set({ number, status, finalizedAt: now, version: row.version + 1, updatedAt: now })
    .where(and(eq(D.id, row.id), eq(D.version, row.version)))
    .returning();
  if (!updated) throw preconditionFailed();
  await postStock(tx, company, updated, actor.id);
  return updated;
}

/**
 * Re-derives `amount_paid_minor` (the sum of the document's allocations, the
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
  const rows = await tx.select().from(D).where(and(eq(D.companyId, companyId), inArray(D.id, ids)));
  for (const row of rows) {
    const amountPaidMinor = paidOf.get(row.id) ?? 0;
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
