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
  received: { label: 'Received', tone: 'success' },
  billed: { label: 'Billed', tone: 'success' },
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

/** Documents that create a receivable / payable. */
export function isPayableDocument(kind: DocumentKind): boolean {
  return kind === 'invoice' || kind === 'purchaseBill';
}

export const DOCUMENT_LABELS: Record<DocumentKind, { singular: string; plural: string }> = {
  quote: { singular: 'Quotation', plural: 'Quotations' },
  salesOrder: { singular: 'Sales order', plural: 'Sales orders' },
  delivery: { singular: 'Delivery note', plural: 'Delivery notes' },
  invoice: { singular: 'Invoice', plural: 'Invoices' },
  salesReturn: { singular: 'Sales return', plural: 'Sales returns' },
  purchaseOrder: { singular: 'Purchase order', plural: 'Purchase orders' },
  goodsReceipt: { singular: 'Goods receipt', plural: 'Goods receipts' },
  purchaseBill: { singular: 'Purchase bill', plural: 'Purchase bills' },
  purchaseReturn: { singular: 'Purchase return', plural: 'Purchase returns' },
};

export const SALES_KINDS: DocumentKind[] = ['quote', 'salesOrder', 'delivery', 'invoice', 'salesReturn'];
export const PURCHASE_KINDS: DocumentKind[] = ['purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn'];
