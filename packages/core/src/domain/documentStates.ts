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

/** Legal transitions per FRD 9. */
const TRANSITIONS: Record<DocumentKind, Partial<Record<DocStatus, DocStatus[]>>> = {
  quote: {
    draft: ['sent', 'cancelled'],
    sent: ['accepted', 'rejected', 'expired'],
    accepted: [],
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
    overdue: ['partiallyPaid', 'paid'],
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
    overdue: ['partiallyPaid', 'paid'],
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
    overdue: ['partiallyPaid', 'paid'],
    paid: [],
  },
  supplierDebitNote: {
    draft: ['issued', 'cancelled'],
    issued: ['partiallyPaid', 'paid', 'overdue', 'cancelled'],
    partiallyPaid: ['paid', 'overdue'],
    overdue: ['partiallyPaid', 'paid'],
    paid: [],
  },
};

export function nextStatuses(kind: DocumentKind, status: DocStatus): DocStatus[] {
  return TRANSITIONS[kind]?.[status] ?? [];
}

export function canTransition(kind: DocumentKind, from: DocStatus, to: DocStatus): boolean {
  return nextStatuses(kind, from).includes(to);
}

export function initialStatus(kind: DocumentKind): DocStatus {
  if (kind === 'salesReturn' || kind === 'purchaseReturn') return 'requested';
  return 'draft';
}

/** A finalized document is locked from editing and its number is permanent. */
export function isFinalized(status: DocStatus): boolean {
  return !['draft', 'requested'].includes(status);
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
  made: { kind: DocumentKind; status: DocStatus; sourceDocumentId?: string | null }[],
): 'cancelled' | 'draft' | 'converted' | null {
  if (isCancelled(source.status)) return 'cancelled';
  if (!isFinalized(source.status)) return 'draft';
  if (AGAINST_SOURCE.includes(target)) return null;
  const onward = made.some((d) => d.sourceDocumentId === source.id && !AGAINST_SOURCE.includes(d.kind) && !isCancelled(d.status));
  return onward ? 'converted' : null;
}

/** Documents that create a receivable / payable. */
export function isPayableDocument(kind: DocumentKind): boolean {
  return PAYABLE_KINDS.includes(kind);
}

export const PAYABLE_KINDS: DocumentKind[] = ['invoice', 'purchaseBill', 'debitNote', 'supplierDebitNote'];
/** Settled by money received; the rest by money paid. */
export const RECEIVABLE_KINDS: DocumentKind[] = ['invoice', 'debitNote'];

export const SALES_KINDS: DocumentKind[] = ['quote', 'salesOrder', 'delivery', 'invoice', 'salesReturn', 'creditNote', 'debitNote'];
export const PURCHASE_KINDS: DocumentKind[] = ['purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn', 'supplierCreditNote', 'supplierDebitNote'];
