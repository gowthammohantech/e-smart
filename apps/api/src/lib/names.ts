import { humanize } from '../http/friendlyValidation';

/**
 * The words people use for the codes the API works in, for messages a person reads. Anything not
 * listed is spelled out from its code ("salesOrder" becomes "Sales order"), never shown as a key.
 */
const MODULES: Record<string, string> = {
  purchases: 'Purchases',
  inventory: 'Stock',
  expenses: 'Expenses',
  ocr: 'Bill capture',
  fx: 'Multi-currency',
  branches: 'Branches',
  payables: 'Payables',
  books: 'Books',
  pos: 'Retail item fields',
};

const KINDS: Record<string, string> = {
  quote: 'quotation',
  salesOrder: 'sales order',
  delivery: 'delivery challan',
  invoice: 'invoice',
  salesReturn: 'sales return',
  purchaseOrder: 'purchase order',
  goodsReceipt: 'goods receipt',
  purchaseBill: 'purchase bill',
  purchaseReturn: 'purchase return',
  creditNote: 'credit note',
  debitNote: 'debit note',
  supplierCreditNote: 'supplier credit note',
  supplierDebitNote: 'supplier debit note',
  proforma: 'proforma invoice',
  openingInvoice: 'opening invoice',
  openingBill: 'opening bill',
};

const STATUSES: Record<string, string> = {
  draft: 'draft',
  sent: 'sent',
  accepted: 'accepted',
  rejected: 'rejected',
  expired: 'expired',
  confirmed: 'confirmed',
  fulfilled: 'fulfilled',
  cancelled: 'cancelled',
  delivered: 'delivered',
  issued: 'issued',
  partiallyPaid: 'partly paid',
  paid: 'paid',
  overdue: 'overdue',
  requested: 'requested',
  approved: 'approved',
  processed: 'processed',
  received: 'received',
  billed: 'billed',
};

export const moduleName = (key: string): string => MODULES[key] ?? humanize(key);
/** A document type in running text: "invoice", "sales order". */
export const kindName = (key: string): string => KINDS[key] ?? humanize(key).toLowerCase();
/** A document status in running text: "partly paid". */
export const statusName = (key: string): string => STATUSES[key] ?? humanize(key).toLowerCase();

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-09" or "2026-09-14" as "September 2026". */
export function monthName(isoDate: string): string {
  const [year, month] = isoDate.split('-');
  const name = MONTHS[Number(month) - 1];
  return name && year ? `${name} ${year}` : isoDate;
}
