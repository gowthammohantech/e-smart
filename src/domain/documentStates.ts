import { DocStatus, DocumentKind } from '@/types';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const STATUS_META: Record<DocStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  expired: { label: 'Expired', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  fulfilled: { label: 'Fulfilled', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  delivered: { label: 'Delivered', tone: 'success' },
  issued: { label: 'Issued', tone: 'info' },
  partiallyPaid: { label: 'Partly paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  overdue: { label: 'Overdue', tone: 'danger' },
  requested: { label: 'Requested', tone: 'neutral' },
  approved: { label: 'Approved', tone: 'info' },
  processed: { label: 'Processed', tone: 'success' },
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
    approved: ['processed'],
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
  return kind === 'salesReturn' ? 'requested' : 'draft';
}

/** A finalized document is locked from editing and its number is permanent. */
export function isFinalized(status: DocStatus): boolean {
  return !['draft', 'requested'].includes(status);
}

export function isCancelled(status: DocStatus): boolean {
  return status === 'cancelled' || status === 'rejected';
}

/** Documents that create a receivable. */
export function isPayableDocument(kind: DocumentKind): boolean {
  return kind === 'invoice';
}

export const DOCUMENT_LABELS: Record<DocumentKind, { singular: string; plural: string }> = {
  quote: { singular: 'Quotation', plural: 'Quotations' },
  salesOrder: { singular: 'Sales order', plural: 'Sales orders' },
  delivery: { singular: 'Delivery note', plural: 'Delivery notes' },
  invoice: { singular: 'Tax invoice', plural: 'Invoices' },
  salesReturn: { singular: 'Credit note', plural: 'Credit notes' },
};

export const SALES_KINDS: DocumentKind[] = ['quote', 'salesOrder', 'delivery', 'invoice', 'salesReturn'];

/** Document kinds that move goods, and so may need an e-way bill. */
export const MOVEMENT_KINDS: DocumentKind[] = ['delivery', 'invoice', 'salesReturn'];
