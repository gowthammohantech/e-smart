import { DocStatus, DocumentKind } from '../types';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/**
 * The colour a status carries. The words live in the `domain:status.*`
 * catalogue — this layer stays pure so it can be tested without a translator.
 */
export const STATUS_TONE: Record<DocStatus, StatusTone> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
  expired: 'warning',
  confirmed: 'info',
  fulfilled: 'success',
  cancelled: 'neutral',
  delivered: 'success',
  issued: 'info',
  partiallyPaid: 'warning',
  paid: 'success',
  overdue: 'danger',
  requested: 'neutral',
  approved: 'info',
  processed: 'success',
  received: 'success',
  billed: 'success',
};

/**
 * Legal transitions per FRD 9. An overdue document can be cancelled like an
 * issued one; the server still refuses one with payments or live returns.
 */
const TRANSITIONS: Record<DocumentKind, Partial<Record<DocStatus, DocStatus[]>>> = {
  quote: {
    draft: ['sent', 'cancelled'],
    sent: ['accepted', 'rejected', 'expired'],
    accepted: [],
    rejected: [],
    expired: ['sent'],
  },
  // A proforma is sent like a quote and settled by the invoice made from it; it is never on the books.
  proforma: {
    draft: ['sent', 'cancelled'],
    sent: ['accepted', 'rejected', 'expired', 'cancelled'],
    accepted: ['cancelled'],
    rejected: [],
    expired: ['sent'],
  },
  salesOrder: {
    draft: ['confirmed', 'cancelled'],
    confirmed: ['fulfilled', 'cancelled'],
    fulfilled: [],
  },
  delivery: {
    draft: ['delivered', 'cancelled'],
    delivered: [],
  },
  invoice: {
    draft: ['issued', 'cancelled'],
    issued: ['partiallyPaid', 'paid', 'overdue', 'cancelled'],
    partiallyPaid: ['paid', 'overdue'],
    overdue: ['partiallyPaid', 'paid', 'cancelled'],
    paid: [],
  },
  salesReturn: {
    requested: ['approved', 'cancelled'],
    approved: ['processed', 'cancelled'],
    processed: [],
  },
  purchaseOrder: {
    draft: ['confirmed', 'cancelled'],
    confirmed: ['received', 'cancelled'],
    received: [],
  },
  goodsReceipt: {
    draft: ['received', 'cancelled'],
    received: ['billed'],
  },
  purchaseBill: {
    draft: ['issued', 'cancelled'],
    issued: ['partiallyPaid', 'paid', 'overdue', 'cancelled'],
    partiallyPaid: ['paid', 'overdue'],
    overdue: ['partiallyPaid', 'paid', 'cancelled'],
    paid: [],
  },
  purchaseReturn: {
    requested: ['approved', 'cancelled'],
    approved: ['processed', 'cancelled'],
    processed: [],
  },
  creditNote: {
    draft: ['issued', 'cancelled'],
    issued: ['cancelled'],
  },
  supplierCreditNote: {
    draft: ['issued', 'cancelled'],
    issued: ['cancelled'],
  },
  debitNote: {
    draft: ['issued', 'cancelled'],
    issued: ['partiallyPaid', 'paid', 'overdue', 'cancelled'],
    partiallyPaid: ['paid', 'overdue'],
    overdue: ['partiallyPaid', 'paid', 'cancelled'],
    paid: [],
  },
  supplierDebitNote: {
    draft: ['issued', 'cancelled'],
    issued: ['partiallyPaid', 'paid', 'overdue', 'cancelled'],
    partiallyPaid: ['paid', 'overdue'],
    overdue: ['partiallyPaid', 'paid', 'cancelled'],
    paid: [],
  },
  // What was owed when the books started: imported issued, then paid off (or cancelled if entered wrongly).
  openingInvoice: {
    issued: ['partiallyPaid', 'paid', 'overdue', 'cancelled'],
    partiallyPaid: ['paid', 'overdue'],
    overdue: ['partiallyPaid', 'paid', 'cancelled'],
    paid: [],
  },
  openingBill: {
    issued: ['partiallyPaid', 'paid', 'overdue', 'cancelled'],
    partiallyPaid: ['paid', 'overdue'],
    overdue: ['partiallyPaid', 'paid', 'cancelled'],
    paid: [],
  },
};

export function nextStatuses(kind: DocumentKind, status: DocStatus): DocStatus[] {
  return TRANSITIONS[kind]?.[status] ?? [];
}

export function canTransition(kind: DocumentKind, from: DocStatus, to: DocStatus): boolean {
  return nextStatuses(kind, from).includes(to);
}

/**
 * Whether a document standing at `status` can be cancelled. The server checks the same table; it
 * also refuses one with a live e-way bill, a live IRN or live returns, which the app warns about.
 * A sent quote, a delivered note, a fulfilled order, a processed return or a paid invoice cannot.
 */
export function canCancel(kind: DocumentKind, status: DocStatus): boolean {
  return status !== 'cancelled' && canTransition(kind, status, 'cancelled');
}

/**
 * `canCancel` for a document as the app holds it, with what has been paid against it. Money paid
 * (or a credit applied) has to come off first, so anything settled by it can't be cancelled. A bill's
 * own TDS reads as paid from the day it is issued, but no money settled it: cancelling looks past it,
 * as the server does, so such a bill reads as issued (or overdue).
 */
export function canCancelDocument(
  doc: { kind: DocumentKind; status: DocStatus; dueDate?: string },
  paid: { paidMinor: number; ownTdsMinor?: number },
  asOf: string,
): boolean {
  const byMoney = paid.paidMinor - (doc.kind === 'invoice' ? 0 : (paid.ownTdsMinor ?? 0));
  if (byMoney > 0) return false;
  const from: DocStatus = doc.status === 'paid' || doc.status === 'partiallyPaid' ? (doc.dueDate && doc.dueDate < asOf ? 'overdue' : 'issued') : doc.status;
  return canCancel(doc.kind, from);
}

export function initialStatus(kind: DocumentKind): DocStatus {
  if (kind === 'salesReturn' || kind === 'purchaseReturn') return 'requested';
  return 'draft';
}

/** A finalized document is locked from editing and its number is permanent. */
export function isFinalized(status: DocStatus): boolean {
  return !['draft', 'requested'].includes(status);
}

/** Held for an owner or admin: finalising it kept it a draft until they approve it (or send it back). */
export function isAwaitingApproval(doc: { status: DocStatus; approval?: { status: string } | null }): boolean {
  return !isFinalized(doc.status) && doc.approval?.status === 'pending';
}

export function isCancelled(status: DocStatus): boolean {
  return status === 'cancelled' || status === 'rejected';
}

const RETURN_KINDS: DocumentKind[] = ['salesReturn', 'purchaseReturn'];

/** Notes against an invoice or bill: they change what it charged, and move no goods. */
export const NOTE_KINDS: DocumentKind[] = ['creditNote', 'debitNote', 'supplierCreditNote', 'supplierDebitNote'];

/** Documents that lower what their source still owes: returns and credit notes. */
export const CREDIT_KINDS: DocumentKind[] = ['salesReturn', 'purchaseReturn', 'creditNote', 'supplierCreditNote'];

/** Raised against an invoice or bill, any number of times: returns and notes. */
const AGAINST_SOURCE: DocumentKind[] = [...RETURN_KINDS, ...NOTE_KINDS];

/** The kind of document each note is raised against. */
export const NOTE_SOURCE: Partial<Record<DocumentKind, DocumentKind>> = {
  creditNote: 'invoice',
  debitNote: 'invoice',
  supplierCreditNote: 'purchaseBill',
  supplierDebitNote: 'purchaseBill',
  salesReturn: 'invoice',
  purchaseReturn: 'purchaseBill',
};

/**
 * Why nothing of `target` can be made from `source` now, or null when it can.
 * A draft isn't final, so nothing is made from it. And a quote or order is
 * carried forward once: after an order, delivery, invoice, receipt or bill has
 * been made from it (and not cancelled), it can't be converted again, so the
 * same goods aren't delivered or billed twice. Returns are the exception:
 * several can be raised against one invoice or bill, up to what it carried.
 */
export function conversionBlock(
  source: { id: string; status: DocStatus },
  target: DocumentKind,
  made: { kind: DocumentKind; status: DocStatus; sourceDocumentId?: string | null; mergedSourceIds?: string[] | null }[],
): 'cancelled' | 'draft' | 'converted' | null {
  if (isCancelled(source.status)) return 'cancelled';
  if (!isFinalized(source.status)) return 'draft';
  if (AGAINST_SOURCE.includes(target)) return null;
  const onward = made.some((d) => madeFrom(d, source.id) && !AGAINST_SOURCE.includes(d.kind) && !isCancelled(d.status));
  return onward ? 'converted' : null;
}

/** Was `d` made from `sourceId`: its source, or one of the others it was merged from. */
export function madeFrom(d: { sourceDocumentId?: string | null; mergedSourceIds?: string[] | null }, sourceId: string): boolean {
  return d.sourceDocumentId === sourceId || !!d.mergedSourceIds?.includes(sourceId);
}

/**
 * Conversions that may take several documents of one party at once into one: sales orders into
 * one delivery challan, challans into one invoice, purchase orders into one goods receipt (GRN),
 * GRNs into one purchase bill. The others merged in must be of the same kind, party, branch,
 * currency and place of supply, each finalised and not yet carried forward. An invoice from
 * challans, or a bill from GRNs, moves no stock: the challans and GRNs did.
 */
export const MERGE_CONVERSIONS: Partial<Record<DocumentKind, DocumentKind[]>> = {
  salesOrder: ['delivery'],
  delivery: ['invoice'],
  purchaseOrder: ['goodsReceipt'],
  goodsReceipt: ['purchaseBill'],
};

export function canMerge(source: DocumentKind, target: DocumentKind): boolean {
  return !!MERGE_CONVERSIONS[source]?.includes(target);
}

/** Documents that create a receivable / payable. */
export function isPayableDocument(kind: DocumentKind): boolean {
  return PAYABLE_KINDS.includes(kind);
}

export const PAYABLE_KINDS: DocumentKind[] = ['invoice', 'purchaseBill', 'debitNote', 'supplierDebitNote', 'openingInvoice', 'openingBill'];
/** Settled by money received; the rest by money paid. */
export const RECEIVABLE_KINDS: DocumentKind[] = ['invoice', 'debitNote', 'openingInvoice'];
/** Owed from before the books started here: on the party's account, never in sales, purchases or GST (RULES 6.12). */
export const OPENING_KINDS: DocumentKind[] = ['openingInvoice', 'openingBill'];

export const SALES_KINDS: DocumentKind[] = ['quote', 'proforma', 'salesOrder', 'delivery', 'invoice', 'salesReturn', 'creditNote', 'debitNote', 'openingInvoice'];
export const PURCHASE_KINDS: DocumentKind[] = ['purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn', 'supplierCreditNote', 'supplierDebitNote', 'openingBill'];
