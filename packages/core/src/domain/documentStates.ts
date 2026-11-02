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
  if (RETURN_KINDS.includes(target)) return null;
  const onward = made.some((d) => d.sourceDocumentId === source.id && !RETURN_KINDS.includes(d.kind) && !isCancelled(d.status));
  return onward ? 'converted' : null;
}

/** Documents that create a receivable / payable. */
export function isPayableDocument(kind: DocumentKind): boolean {
  return kind === 'invoice' || kind === 'purchaseBill';
}

export const SALES_KINDS: DocumentKind[] = ['quote', 'salesOrder', 'delivery', 'invoice', 'salesReturn'];
export const PURCHASE_KINDS: DocumentKind[] = ['purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn'];
