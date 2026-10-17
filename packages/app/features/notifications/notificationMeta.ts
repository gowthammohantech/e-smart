import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NotificationKind } from '@esmart/core/types';

/** How each kind of notification is drawn. */
export const NOTIFICATION_META: Record<NotificationKind, { icon: keyof typeof MaterialCommunityIcons.glyphMap; tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  invoiceSent: { icon: 'send-outline', tone: 'info' },
  paymentReceived: { icon: 'cash-check', tone: 'success' },
  invoiceOverdue: { icon: 'alert-circle-outline', tone: 'danger' },
  lowStock: { icon: 'package-variant', tone: 'warning' },
  compliance: { icon: 'shield-check-outline', tone: 'info' },
  syncFailure: { icon: 'cloud-alert', tone: 'danger' },
  system: { icon: 'information-outline', tone: 'neutral' },
};

/** The screen a notification opens, if it points at a record. */
export function notificationRoute(entityType?: string, entityId?: string): string | null {
  if (!entityType) return null;
  if (entityType === 'invoice' && entityId) return `/(app)/sales/invoices/${entityId}`;
  if (entityType === 'payment' && entityId) return `/(app)/payments/${entityId}`;
  if (entityType === 'inventory') return '/(app)/inventory/low-stock';
  if (entityType === 'ewayBill') return entityId ? `/(app)/compliance/eway/${entityId}` : '/(app)/compliance';
  if (entityType === 'compliance') return '/(app)/compliance';
  if (entityType === 'system') return '/(app)/reports/tax-summary';
  return null;
}
