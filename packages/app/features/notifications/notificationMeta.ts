import type { IconName } from '@esmart/ui/components/Icon';
import type { DocumentKind, NotificationKind } from '@esmart/core/types';
import { detailRouteFor } from '../documents/DocumentEditor';

/** How each kind of notification is drawn. */
export const NOTIFICATION_META: Record<NotificationKind, { icon: IconName; tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  invoiceSent: { icon: 'send-outline', tone: 'info' },
  paymentReceived: { icon: 'cash-check', tone: 'success' },
  invoiceOverdue: { icon: 'alert-circle-outline', tone: 'danger' },
  lowStock: { icon: 'package-variant', tone: 'warning' },
  compliance: { icon: 'shield-check-outline', tone: 'info' },
  syncFailure: { icon: 'cloud-alert', tone: 'danger' },
  system: { icon: 'information-outline', tone: 'neutral' },
};

/**
 * The screen a notification opens, if it points at a record. The server names
 * records by table (`document`, `eway_bill`, `payment_request`…); older and
 * demo notifications use the document kind (`invoice`) or camel case.
 * A notification with nothing to point at opens nothing.
 */
export function notificationRoute(entityType?: string, entityId?: string): string | null {
  if (!entityType) return null;
  if (DOCUMENT_KINDS.has(entityType) && entityId) return detailRouteFor(entityType as DocumentKind, entityId);
  switch (entityType) {
    // The server doesn't say which kind; the document page shows any of them.
    case 'document':
      return entityId ? `/(app)/documents/${entityId}` : null;
    case 'payment':
      return entityId ? `/(app)/payments/${entityId}` : null;
    case 'payment_request':
      return '/(app)/sales/approvals';
    case 'expense':
      return entityId ? `/(app)/expenses/${entityId}` : '/(app)/expenses';
    case 'item':
      return entityId ? `/(app)/catalog/items/${entityId}` : null;
    case 'inventory':
      return '/(app)/inventory/low-stock';
    case 'ewayBill':
    case 'eway_bill':
      return entityId ? `/(app)/compliance/eway/${entityId}` : '/(app)/compliance';
    case 'compliance':
      return '/(app)/compliance';
    // A GSTR-2B arrival is about the company's purchases in that period.
    case 'company':
      return '/(app)/gst/gstr2b-reconciliation';
    case 'export_job':
      return '/(app)/settings/backup';
    default:
      return null;
  }
}

const DOCUMENT_KINDS = new Set<string>([
  'quote', 'proforma', 'salesOrder', 'delivery', 'invoice', 'salesReturn', 'purchaseOrder', 'goodsReceipt',
  'purchaseBill', 'purchaseReturn', 'creditNote', 'debitNote', 'supplierCreditNote', 'supplierDebitNote',
  'openingInvoice', 'openingBill',
] satisfies DocumentKind[]);
