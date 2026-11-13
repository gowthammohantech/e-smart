import { and, arrayOverlaps, desc, eq, gt, gte, inArray, lt, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { businessDate, creditNoteDeadline, financialYearOf } from '@esmart/core/lib/date';
import { INVOICE_LIMITS, hasModule, nextInvoicePlan } from '@esmart/core/domain/plan';
import { CREDIT_KINDS, NOTE_KINDS, NOTE_SOURCE, PAYABLE_KINDS, isFinalized, isPayableDocument } from '@esmart/core/domain/documentStates';
import { statusForOutstanding } from '@esmart/core/domain/receivables';
import { MOVEMENT_SIGN, signedQuantity, stockMapOn } from '@esmart/core/domain/stockLedger';
import { calculateLine, lineTreatment } from '@esmart/core/domain/lineCalc';
import type { BusinessDocument, DocStatus, DocumentKind, DocumentLine, StockMovement, StockMovementType } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { AuthUser, CompanyRow } from '../../context';
import { conflict, invoiceLimitReached, preconditionFailed, unprocessable } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { partyBalances } from '../../lib/balances';
import { newId } from '../../lib/ids';
import { assignNumber } from '../../lib/numbering';
import { replayQueuedAt } from '../../lib/replay';
import { gstFlagsFrom } from '../../lib/wire';
import type { DocRow } from './engine';

const D = schema.documents;
const M = schema.stockMovements;

/** Statuses the server derives from payments and the due date; clients never set them. */
export const DERIVED: DocStatus[] = ['paid', 'partiallyPaid', 'overdue'];
const SETTLEMENT: DocStatus[] = ['issued', 'partiallyPaid', 'paid', 'overdue'];

/** Where `finalizeDocument` takes each kind (FRD 9). */
export const FINAL_STATUS: Record<DocumentKind, DocStatus> = {
  quote: 'sent',
  proforma: 'sent',
  salesOrder: 'confirmed',
  purchaseOrder: 'confirmed',
  delivery: 'delivered',
  goodsReceipt: 'received',
  salesReturn: 'approved',
  purchaseReturn: 'approved',
  invoice: 'issued',
  purchaseBill: 'issued',
  creditNote: 'issued',
  debitNote: 'issued',
  supplierCreditNote: 'issued',
  supplierDebitNote: 'issued',
  // Imported already issued; never finalised from a draft.
  openingInvoice: 'issued',
  openingBill: 'issued',
};

/** Which kinds each kind converts into (quote → proforma → order → delivery → invoice, PO → receipt → bill, invoice/bill → return). */
export const CONVERSIONS: Record<DocumentKind, DocumentKind[]> = {
  quote: ['proforma', 'salesOrder', 'invoice'],
  proforma: ['salesOrder', 'invoice'],
  salesOrder: ['delivery', 'invoice'],
  delivery: ['invoice'],
  invoice: ['salesReturn', 'creditNote', 'debitNote'],
  salesReturn: [],
  purchaseOrder: ['goodsReceipt', 'purchaseBill'],
  goodsReceipt: ['purchaseBill'],
  purchaseBill: ['purchaseReturn', 'supplierCreditNote', 'supplierDebitNote'],
  purchaseReturn: [],
  creditNote: [],
  debitNote: [],
  supplierCreditNote: [],
  supplierDebitNote: [],
  openingInvoice: [],
  openingBill: [],
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
  return sql<string>`(case when ${D.kind} in (${sql.join(PAYABLE_KINDS.map((k) => sql`${k}`), sql`, `)}) and ${D.status} in ('issued', 'partiallyPaid', 'paid', 'overdue') then
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
 * (goods receipt) in its chain? Either one it was converted from (or merged
 * from, with others), or one raised from the same order. Then the invoice
 * must not move it again.
 */
async function movedUpstream(tx: DbOrTx, row: DocRow): Promise<boolean> {
  const pair = row.kind === 'invoice' ? { via: 'delivery', order: 'salesOrder' } : row.kind === 'purchaseBill' ? { via: 'goodsReceipt', order: 'purchaseOrder' } : null;
  if (!pair) return false;
  const via: string[] = [];
  const orders: string[] = [];
  // Back through every source, level by level: a merged document has several.
  const seen = new Set<string>();
  let frontier = [row.sourceDocumentId, ...(row.mergedSourceIds ?? [])].filter((id): id is string => !!id);
  for (let depth = 0; frontier.length && depth < 10; depth++) {
    frontier.forEach((id) => seen.add(id));
    const sources = await tx.select({ id: D.id, kind: D.kind, sourceDocumentId: D.sourceDocumentId, mergedSourceIds: D.mergedSourceIds }).from(D).where(inArray(D.id, frontier));
    for (const src of sources) {
      if (src.kind === pair.via) via.push(src.id);
      if (src.kind === pair.order) orders.push(src.id);
    }
    frontier = [...new Set(sources.flatMap((s) => [s.sourceDocumentId, ...s.mergedSourceIds]))].filter((id): id is string => !!id && !seen.has(id));
  }
  if (orders.length) {
    const siblings = await tx
      .select({ id: D.id })
      .from(D)
      .where(and(or(inArray(D.sourceDocumentId, orders), arrayOverlaps(D.mergedSourceIds, orders)), eq(D.kind, pair.via as DocumentKind)));
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
/**
 * What one unit on a bought line cost, in the document's currency: its taxable value (after the line's
 * discount, GST inside a tax-inclusive price taken out) over its quantity, the figure the bill puts in
 * Purchases. GST whose credit is blocked (s.17(5)) or ineligible can't be recovered, so it is part of
 * what the goods cost (AS 2 para 10, 11): it is added, as the bill adds it to Purchases (`itcOfDocument`).
 * The document's discount after tax is posted to Discount received on its own.
 */
function receiptUnitCost(row: DocRow, l: typeof schema.documentLines.$inferSelect): number {
  const quantity = Number(l.quantity);
  if (!(quantity > 0)) return l.unitPriceMinor;
  const currency = row.currency.trim();
  const line: DocumentLine = {
    id: l.id,
    name: l.name,
    quantity,
    unit: l.unit,
    unitPrice: { minor: l.unitPriceMinor, currency },
    discountMode: l.discountMode,
    discountValue: Number(l.discountValue),
    taxCategoryId: l.taxCategoryId,
    taxRate: Number(l.taxRate),
    taxInclusive: l.taxInclusive,
    gst: gstFlagsFrom(l) ?? {},
  };
  // Tax comes out of an inclusive price only when the document charged some.
  const charged = row.totalTaxMinor > 0 || row.reverseChargeTaxMinor > 0;
  const ctx = { regime: 'GST' as const, registered: charged, reverseCharge: row.reverseCharge };
  const { taxable, taxAmount } = calculateLine(line, currency, ctx);
  const eligibility = line.gst?.itcEligibility ?? 'eligible';
  const t = lineTreatment(line, ctx);
  const lost = (eligibility === 'blocked' || eligibility === 'ineligible') && t.rate + t.cessRate > 0 ? taxAmount.minor : 0;
  return (taxable.minor + lost) / quantity;
}

/**
 * Whether stock may not go below zero: unless the business allows it, on a plan that keeps stock.
 * A plan without stock (Free, Basic) has no such setting to turn off, so it never refuses a sale.
 */
function checksStock(company: CompanyRow): boolean {
  return !company.allowNegativeStock && hasModule(company.plan, 'inventory');
}

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
      const cost = type === 'purchaseReceipt' ? { minor: Math.round(receiptUnitCost(row, l) * rate), currency: baseCurrency } : { minor: item.purchasePriceMinor, currency: item.currency.trim() };
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
  if (values.length && MOVEMENT_SIGN[type] < 0 && checksStock(company)) {
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
  if (incoming.length && checksStock(company)) {
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
export async function checkCreditLimit(tx: DbOrTx, row: DocRow, now: Date, opts: { counted?: boolean } = {}): Promise<void> {
  if (row.kind !== 'invoice') return;
  const [party] = await tx.select().from(schema.parties).where(eq(schema.parties.id, row.partyId));
  if (!party?.creditLimitMinor || party.creditLimitMinor <= 0) return;
  const balances = await partyBalances(tx, row.companyId, [{ id: party.id, kind: 'customer' }], today(now));
  // An issued invoice edited in place is already in what the customer owes.
  const exposure = (balances.get(party.id)?.outstanding ?? 0) + (opts.counted ? 0 : row.grandTotalMinor);
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
  await assertPeriodOpenNow(tx, company, row.date);
  if (TAX_DOCUMENTS.includes(row.kind) && row.date > addDays(today(now), 1)) {
    throw unprocessable([{ field: 'date', message: `A ${row.kind} cannot be dated ${row.date}, in the future`, severity: 'blocking' }], 'DOCUMENT_DATED_IN_FUTURE');
  }
  // A sale dated into a month whose GSTR-1 is filed would never be reported: it goes in an open month.
  if (GSTR1_KINDS.includes(row.kind) && (await gstr1Closed(tx, company.id, row.date))) {
    throw conflict('RETURN_FILED', `GSTR-1 for ${row.date.slice(0, 7)} is filed; a ${row.kind} dated ${row.date} would never be reported. Date it in a month whose GSTR-1 is still open`);
  }
  if (row.kind === 'invoice') await checkInvoiceLimit(tx, company, now);
  await checkSupplierNumberUnique(tx, row);
  if (isReturn(row) && row.sourceDocumentId) await checkReturnWithinSource(tx, row);
  if (againstSource(row)) await checkAgainstSource(tx, row);
  if (!opts.overrideCreditLimit) await checkCreditLimit(tx, row, now);
  // Opening invoices and bills keep their own numbers and are never drafts to finalise.
  if (row.kind === 'openingInvoice' || row.kind === 'openingBill') throw conflict('INVALID_TRANSITION', 'An opening invoice or bill is already issued');
  const number = await assignNumber(tx, { companyId: row.companyId, kind: row.kind, branchId: row.branchId, date: row.date });
  const status = effectiveStatus({ ...row, status: target }, today(now));
  // The returns report the party as registered when the document was issued, whatever changes later.
  const [party] = await tx
    .select({ taxId: schema.parties.taxId, stateCode: schema.parties.billingStateCode })
    .from(schema.parties)
    .where(eq(schema.parties.id, row.partyId));
  // Rule 46(f): reverse-charge tax on a purchase from an unregistered supplier is self-invoiced.
  const selfInvoiceNumber =
    row.kind === 'purchaseBill' && row.reverseChargeTaxMinor > 0 && !party?.taxId
      ? await assignNumber(tx, { companyId: row.companyId, kind: 'selfInvoice', branchId: row.branchId, date: row.date })
      : null;
  const [updated] = await tx
    .update(D)
    .set({ number, status, finalizedAt: now, partyGstin: party?.taxId ?? null, partyStateCode: party?.stateCode ?? null, selfInvoiceNumber, version: row.version + 1, updatedAt: now })
    .where(and(eq(D.id, row.id), eq(D.version, row.version)))
    .returning();
  if (!updated) throw preconditionFailed();
  await postStock(tx, company, updated, actor.id);
  // A bill with TDS kept back starts part-settled.
  if (isCredit(updated) && updated.sourceDocumentId) await syncPaymentState(tx, actor, updated.companyId, [updated.sourceDocumentId], now);
  // (An invoice's TDS is only what the customer is expected to deduct: it settles nothing until a receipt says so.)
  if (updated.tdsAmountMinor > 0 && updated.kind !== 'invoice') {
    await syncPaymentState(tx, actor, updated.companyId, [updated.id], now);
    const [settled] = await tx.select().from(D).where(eq(D.id, updated.id));
    return settled;
  }
  return updated;
}

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Dated by the business itself, and what the tax return is built from. */
const TAX_DOCUMENTS: DocumentKind[] = ['invoice', 'salesReturn', 'purchaseBill', 'purchaseReturn', ...NOTE_KINDS];
/** What GSTR-1 reports: sales, and the notes and returns against them. */
export const GSTR1_KINDS: DocumentKind[] = ['invoice', 'salesReturn', 'creditNote', 'debitNote'];
/** Purchases whose credit GSTR-3B claims. */
const ITC_KINDS: DocumentKind[] = ['purchaseBill', 'supplierDebitNote', 'supplierCreditNote', 'purchaseReturn'];
const RETURN_KINDS: DocumentKind[] = ['salesReturn', 'purchaseReturn'];
export const isReturn = (row: Pick<DocRow, 'kind'>) => RETURN_KINDS.includes(row.kind);
/** Returns and credit notes: they lower what their source still owes. */
export const isCredit = (row: Pick<DocRow, 'kind'>) => CREDIT_KINDS.includes(row.kind);
/** Raised against an invoice or bill: returns and notes. */
const AGAINST_SOURCE: DocumentKind[] = [...RETURN_KINDS, ...NOTE_KINDS];
const againstSource = (row: Pick<DocRow, 'kind'>) => AGAINST_SOURCE.includes(row.kind);
/** A return that counts: approved or issued, and not since withdrawn. */
const LIVE_RETURN = notInArray(D.status, ['draft', 'requested', 'cancelled', 'rejected']);

/** Books closed up to a date stay as they were filed. */
export function assertPeriodOpen(company: CompanyRow, date: string) {
  if (company.lockedThroughDate && date <= company.lockedThroughDate) {
    throw conflict('PERIOD_LOCKED', `The books are closed through ${company.lockedThroughDate}; an owner must reopen them to change a document dated ${date}`);
  }
}

/**
 * The same check against the books' lock date as it stands now, read under a share lock on the
 * company: closing the books (an update of that row) waits for this write to finish, and a write
 * that starts after the close sees it. The request's own copy of the company may be older.
 */
export async function assertPeriodOpenNow(tx: DbOrTx, company: CompanyRow, ...dates: (string | null | undefined)[]) {
  const [row] = await tx.select({ lockedThroughDate: schema.companies.lockedThroughDate }).from(schema.companies).where(eq(schema.companies.id, company.id)).for('share');
  for (const date of dates) if (date) assertPeriodOpen({ ...company, lockedThroughDate: row?.lockedThroughDate ?? null }, date);
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

/**
 * A note or return must stand against a finalised invoice or bill of the same party and currency.
 * Credit (returns and credit notes) can't add up to more than the source charged plus its debit
 * notes, and the business's own credit notes have a deadline (s.34(2)). A direct note, raised
 * against no one invoice or bill, has nothing to check here; the draft required its reason.
 */
async function checkAgainstSource(tx: DbOrTx, row: DocRow) {
  const blocking = (field: string, message: string, code = 'VALIDATION_FAILED') => {
    throw unprocessable([{ field, message, severity: 'blocking' }], code);
  };
  if (!row.sourceDocumentId && NOTE_KINDS.includes(row.kind)) {
    // A direct credit note with GST keeps the s.34(2) deadline, from the original invoice it names (RULES 6.24).
    if (row.kind === 'creditNote' && row.noteGst !== 'noGst' && row.originalDate && row.date > creditNoteDeadline(row.originalDate)) {
      return blocking('date', `A credit note for ${row.originalNumber ?? 'an invoice'} of ${row.originalDate} had to be issued by ${creditNoteDeadline(row.originalDate)} (CGST s.34(2))`, 'NOTE_TIME_BARRED');
    }
    return;
  }
  if (!row.sourceDocumentId) return blocking('sourceDocumentId', `A ${row.kind} is raised against an ${NOTE_SOURCE[row.kind] === 'invoice' ? 'invoice' : 'purchase bill'}`, 'NOTE_NEEDS_SOURCE');
  const [source] = await tx.select().from(D).where(and(eq(D.companyId, row.companyId), eq(D.id, row.sourceDocumentId))).for('update');
  if (!source || source.kind !== NOTE_SOURCE[row.kind]) return blocking('sourceDocumentId', `A ${row.kind} is raised against an ${NOTE_SOURCE[row.kind] === 'invoice' ? 'invoice' : 'purchase bill'}`, 'NOTE_NEEDS_SOURCE');
  if (!isFinalized(source.status) || source.status === 'cancelled') return blocking('sourceDocumentId', `${source.number} is ${source.status}`);
  if (source.partyId !== row.partyId) return blocking('partyId', `${source.number} belongs to another party`);
  if (source.currency.trim() !== row.currency.trim()) return blocking('currency', `${source.number} is in ${source.currency.trim()}`);
  if ((row.kind === 'creditNote' || row.kind === 'salesReturn') && row.date > creditNoteDeadline(source.date)) {
    return blocking('date', `A credit note for ${source.number} had to be issued by ${creditNoteDeadline(source.date)} (CGST s.34(2))`, 'NOTE_TIME_BARRED');
  }
  if (!isCredit(row)) return;
  const others = await tx
    .select({ kind: D.kind, total: D.grandTotalMinor })
    .from(D)
    .where(and(eq(D.sourceDocumentId, source.id), inArray(D.kind, AGAINST_SOURCE), LIVE_RETURN, ne(D.id, row.id)));
  const credited = others.filter((o) => isCredit(o)).reduce((a, o) => a + o.total, 0);
  const debited = others.filter((o) => !isCredit(o)).reduce((a, o) => a + o.total, 0);
  const room = source.grandTotalMinor + debited - credited;
  if (row.grandTotalMinor > room) {
    blocking('lines', `${source.number} has ${(Math.max(room, 0) / 100).toFixed(2)} left to credit; this note is ${(row.grandTotalMinor / 100).toFixed(2)}`, 'NOTE_EXCEEDS_SOURCE');
  }
}

/** A document can't be cancelled while a return or note stands against it. */
export async function assertNoLiveReturns(tx: DbOrTx, row: DocRow) {
  const [live] = await tx.select({ number: D.number, kind: D.kind }).from(D).where(and(eq(D.sourceDocumentId, row.id), inArray(D.kind, AGAINST_SOURCE), LIVE_RETURN)).limit(1);
  if (live) throw conflict('DOCUMENT_HAS_RETURNS', `Cancel ${isReturn(live) ? 'return' : 'note'} ${live.number} before cancelling ${row.number}`);
  // A direct note applied to an invoice (or an invoice a note was applied to) holds the other up.
  const CA = schema.creditApplications;
  const [applied] = await tx.select({ id: CA.id }).from(CA).where(or(eq(CA.noteId, row.id), eq(CA.documentId, row.id))).limit(1);
  if (applied) throw conflict('DOCUMENT_HAS_RETURNS', `${row.number} is in a credit note adjustment; remove that adjustment first`);
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
  // Cash and what settled it without cash: TDS deducted, discount, write-off.
  const sums = await tx
    .select({ documentId: A.documentId, paid: sql<number>`coalesce(sum(${A.amountMinor} + ${A.tdsMinor} + ${A.discountMinor} + ${A.writeOffMinor}), 0)::bigint` })
    .from(A)
    .where(inArray(A.documentId, ids))
    .groupBy(A.documentId);
  const paidOf = new Map(sums.map((s) => [s.documentId, Number(s.paid)]));
  // A return settles what it credits, as far as there's anything left to settle.
  const credits = await tx
    // Net of the TDS a supplier credit note gives back, which was never owed to the supplier.
    .select({ documentId: D.sourceDocumentId, credited: sql<number>`coalesce(sum(${D.grandTotalMinor} - ${D.tdsAmountMinor}), 0)::bigint` })
    .from(D)
    .where(and(inArray(D.sourceDocumentId, ids), inArray(D.kind, CREDIT_KINDS), LIVE_RETURN))
    .groupBy(D.sourceDocumentId);
  const creditOf = new Map(credits.map((c) => [c.documentId, Number(c.credited)]));
  // Direct notes applied to it (the adjustment entry): credit, not money.
  const CA = schema.creditApplications;
  const applied = await tx
    .select({ documentId: CA.documentId, applied: sql<number>`coalesce(sum(${CA.amountMinor}), 0)::bigint` })
    .from(CA)
    .where(inArray(CA.documentId, ids))
    .groupBy(CA.documentId);
  for (const a of applied) creditOf.set(a.documentId, (creditOf.get(a.documentId!) ?? 0) + Number(a.applied));
  const rows = await tx.select().from(D).where(and(eq(D.companyId, companyId), inArray(D.id, ids)));
  for (const row of rows) {
    // TDS kept back is paid to the government, so it settles the bill as far as the supplier goes.
    // An invoice's TDS is only expected: the receipt's tdsDeducted settles it, counted above.
    const allocated = (paidOf.get(row.id) ?? 0) + (row.kind === 'invoice' ? 0 : row.tdsAmountMinor);
    const amountPaidMinor = Math.max(allocated, Math.min(allocated + (creditOf.get(row.id) ?? 0), row.grandTotalMinor));
    const status = isFinalized(row.status) ? effectiveStatus({ ...row, amountPaidMinor }, today(now)) : row.status;
    // Rule 37: credit taken back once the bill was paid goes out again when it no longer is (a payment
    // removed); the daily job takes it back again once it is paid.
    const unreclaim = !!row.itcReclaimedOn && amountPaidMinor < row.grandTotalMinor;
    if (amountPaidMinor === row.amountPaidMinor && status === row.status && !unreclaim) continue;
    const [updated] = await tx
      .update(D)
      .set({ amountPaidMinor, status, ...(unreclaim && { itcReclaimedOn: null }), version: row.version + 1, updatedAt: now })
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

// ------------------------------------------------------------ editing the latest invoice

/** Why a finalised invoice can't be edited in full (RULES 6.23); the app shows it as a hint. */
export type EditBlock = 'notInvoice' | 'notFinal' | 'periodLocked' | 'notLatest' | 'hasPayments' | 'hasCredit' | 'hasNotes' | 'eInvoiced' | 'ewayBill' | 'returnFiled' | 'laterStock';

export const EDIT_BLOCK_MESSAGES: Record<EditBlock, string> = {
  notInvoice: 'Only an invoice can be edited after it is issued',
  notFinal: 'Only an issued invoice can be edited this way',
  periodLocked: 'The books are closed for its date',
  notLatest: 'A later invoice has been issued in its series',
  hasPayments: 'A payment is allocated to it',
  hasCredit: 'A credit note is adjusted against it',
  hasNotes: 'A return, credit note or debit note stands against it',
  eInvoiced: 'It has an IRN (e-invoice)',
  ewayBill: 'It has an e-way bill',
  returnFiled: 'Its GSTR-1 period is filed',
  laterStock: 'Its items have later stock movements, and stock is costed FIFO',
};

/**
 * A supplier's bill (or note) is entered once: the same supplier number from the same supplier in
 * the same financial year (April to March, the GST year) would book the payable and its input
 * credit twice. Spaces and case don't make a number different.
 */
async function checkSupplierNumberUnique(tx: DbOrTx, row: DocRow) {
  if (!['purchaseBill', 'supplierDebitNote', 'supplierCreditNote'].includes(row.kind) || !row.supplierDocNumber?.trim()) return;
  const fy = financialYearOf(row.date, 4);
  const norm = (c: SQL | string) => sql`upper(regexp_replace(${c}, '\\s', '', 'g'))`;
  const [dupe] = await tx
    .select({ number: D.number })
    .from(D)
    .where(
      and(
        eq(D.companyId, row.companyId),
        eq(D.partyId, row.partyId),
        eq(D.kind, row.kind),
        ne(D.id, row.id),
        notInArray(D.status, ['draft', 'requested', 'cancelled', 'rejected']),
        gte(D.date, fy.start),
        sql`${D.date} <= ${fy.end}`,
        sql`${norm(sql`${D.supplierDocNumber}`)} = ${norm(row.supplierDocNumber.trim())}`,
      ),
    )
    .limit(1);
  if (dupe) throw conflict('DUPLICATE_SUPPLIER_BILL', `The supplier's ${row.supplierDocNumber.trim()} is already in the books as ${dupe.number.trim()} for ${fy.label}`);
}

/** GSTR-3B for a period (MMYYYY) is filed. */
export async function gstr3bFiled(tx: DbOrTx, companyId: string, period: string): Promise<boolean> {
  const R = schema.gstReturns;
  const [r] = await tx
    .select({ id: R.id })
    .from(R)
    .where(and(eq(R.companyId, companyId), eq(R.returnType, 'gstr3b'), eq(R.period, period), inArray(R.status, ['submitted', 'filed'])))
    .limit(1);
  return !!r;
}

/**
 * Cancelling takes a document out of the returns. One already reported can't simply vanish: a sale
 * in a filed GSTR-1 would drop out of a 3B rebuilt later and then again through the amendment, and
 * a bill whose credit a filed 3B claimed would keep that credit. Those are undone with a credit note
 * (or a return to the supplier) dated today instead.
 */
export async function assertCancellable(tx: DbOrTx, row: DocRow): Promise<void> {
  if (GSTR1_KINDS.includes(row.kind) && (await gstr1Closed(tx, row.companyId, row.date))) {
    throw conflict('RETURN_FILED', `${row.number} is in the filed GSTR-1 for ${row.date.slice(0, 7)}; issue a credit note dated today instead of cancelling it`);
  }
  // A bill whose assets are in the register: the register would keep depreciating what the books no longer hold.
  if (row.kind === 'purchaseBill') {
    const [asset] = await tx.select({ name: schema.fixedAssets.name }).from(schema.fixedAssets).where(and(eq(schema.fixedAssets.companyId, row.companyId), eq(schema.fixedAssets.sourceDocumentId, row.id))).limit(1);
    if (asset) throw conflict('DOCUMENT_HAS_ASSETS', `${row.number} bought ${asset.name}, which is in the fixed asset register; remove it from the register first`);
  }
  if (ITC_KINDS.includes(row.kind)) {
    const own = `${row.date.slice(5, 7)}${row.date.slice(0, 4)}`;
    for (const period of new Set([row.itcClaimPeriod, own].filter((p): p is string => !!p))) {
      if (await gstr3bFiled(tx, row.companyId, period)) {
        throw conflict('RETURN_FILED', `${row.number}'s input tax is in the filed GSTR-3B for ${period.slice(0, 2)}/${period.slice(2)}; record a purchase return or supplier credit note dated today instead of cancelling it`);
      }
    }
  }
}

/** GSTR-1 for the month `date` falls in is filed, or frozen for filing. */
export async function gstr1Closed(tx: DbOrTx, companyId: string, date: string): Promise<boolean> {
  const R = schema.gstReturns;
  const period = `${date.slice(5, 7)}${date.slice(0, 4)}`;
  const [r] = await tx
    .select({ id: R.id })
    .from(R)
    .where(and(eq(R.companyId, companyId), eq(R.returnType, 'gstr1'), eq(R.period, period), inArray(R.status, ['submitted', 'filed'])))
    .limit(1);
  return !!r;
}

/** The finalised invoice issued just before this one in its series (by when it was issued), if any. */
export async function previousInSeries(tx: DbOrTx, row: DocRow): Promise<DocRow | undefined> {
  if (!row.finalizedAt) return undefined;
  const [prev] = await tx
    .select()
    .from(D)
    .where(and(eq(D.companyId, row.companyId), eq(D.kind, row.kind), ne(D.id, row.id), sql`${D.number} not like '%-DRAFT'`, or(lt(D.finalizedAt, row.finalizedAt), and(eq(D.finalizedAt, row.finalizedAt), lt(D.id, row.id)))))
    .orderBy(desc(D.finalizedAt), desc(D.id))
    .limit(1);
  return prev;
}

/**
 * Whether a finalised invoice may still be edited in full (RULES 6.23, pending CA), and if not, why:
 * it is the latest issued in its numbering series, nothing has settled or adjusted it, it is not
 * e-invoiced or e-way billed, its GSTR-1 month is open and its books period too. With FIFO costing,
 * a later movement of any of its items holds it too: re-costing this sale would re-cost those.
 */
export async function canEditLatest(tx: DbOrTx, company: Pick<CompanyRow, 'id' | 'lockedThroughDate' | 'stockCosting'>, row: DocRow): Promise<EditBlock | null> {
  if (row.kind !== 'invoice') return 'notInvoice';
  if (!isFinalized(row.status) || row.status === 'cancelled' || !row.finalizedAt) return 'notFinal';
  if (company.lockedThroughDate && row.date <= company.lockedThroughDate) return 'periodLocked';
  const [later] = await tx
    .select({ id: D.id })
    .from(D)
    .where(
      and(
        eq(D.companyId, row.companyId),
        eq(D.kind, row.kind),
        ne(D.id, row.id),
        sql`${D.number} not like '%-DRAFT'`,
        or(gt(D.finalizedAt, row.finalizedAt), and(eq(D.finalizedAt, row.finalizedAt), gt(D.id, row.id))),
      ),
    )
    .limit(1);
  if (later) return 'notLatest';
  const A = schema.paymentAllocations;
  const [paid] = await tx.select({ id: A.paymentId }).from(A).where(eq(A.documentId, row.id)).limit(1);
  if (paid) return 'hasPayments';
  const CA = schema.creditApplications;
  const [applied] = await tx.select({ id: CA.id }).from(CA).where(eq(CA.documentId, row.id)).limit(1);
  if (applied) return 'hasCredit';
  const [note] = await tx.select({ id: D.id }).from(D).where(and(eq(D.sourceDocumentId, row.id), inArray(D.kind, AGAINST_SOURCE), LIVE_RETURN)).limit(1);
  if (note) return 'hasNotes';
  const [einv] = await tx.select({ irn: schema.eInvoices.irn }).from(schema.eInvoices).where(eq(schema.eInvoices.documentId, row.id));
  if (einv?.irn) return 'eInvoiced';
  const E = schema.ewayBills;
  const [eway] = await tx.select({ id: E.id }).from(E).where(and(eq(E.documentId, row.id), ne(E.status, 'cancelled'))).limit(1);
  if (eway) return 'ewayBill';
  if (await gstr1Closed(tx, row.companyId, row.date)) return 'returnFiled';
  if (company.stockCosting === 'fifo') {
    // Its own movements, and when the ledger got them: the database's clock, as the others carry.
    const own = await tx.select({ itemId: M.itemId, createdAt: M.createdAt }).from(M).where(and(eq(M.referenceType, 'document'), eq(M.referenceId, row.id)));
    const ids = [...new Set(own.map((m) => m.itemId))];
    if (ids.length) {
      const postedAt = new Date(Math.min(...own.map((m) => m.createdAt.getTime())));
      const [moved] = await tx
        .select({ id: M.id })
        .from(M)
        .where(
          and(
            eq(M.companyId, row.companyId),
            inArray(M.itemId, ids),
            or(ne(M.referenceId, row.id), sql`${M.referenceId} is null`),
            or(gt(M.date, row.date), and(eq(M.date, row.date), gt(M.createdAt, postedAt))),
          ),
        )
        .limit(1);
      if (moved) return 'laterStock';
    }
  }
  return null;
}

/**
 * Takes back what a finalised document put on the stock ledger so it can post again after a full
 * edit. Its own movements are deleted rather than reversed: the edit re-issues the same document,
 * and a reversal left beside the new movements would read as stock in at no cost. The edit's audit
 * entry keeps what it was.
 */
export async function withdrawStock(tx: DbOrTx, row: DocRow): Promise<number> {
  const gone = await tx.delete(M).where(and(eq(M.companyId, row.companyId), eq(M.referenceType, 'document'), eq(M.referenceId, row.id))).returning({ id: M.id });
  return gone.length;
}
