import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DocumentEwayStatus, EInvoiceStatus, EwayBillStatus } from '@/types';
import { StatusTone } from '@/domain/documentStates';

type Meta = { label: string; tone: StatusTone; icon: keyof typeof MaterialCommunityIcons.glyphMap };

/** Presentation for the e-invoice states, mirroring STATUS_META for documents. */
export const E_INVOICE_STATUS_META: Record<EInvoiceStatus, Meta> = {
  notApplicable: { label: 'Not applicable', tone: 'neutral', icon: 'minus-circle-outline' },
  pending: { label: 'Not reported', tone: 'warning', icon: 'clock-outline' },
  generated: { label: 'IRN generated', tone: 'success', icon: 'shield-check-outline' },
  cancelled: { label: 'IRN cancelled', tone: 'danger', icon: 'shield-off-outline' },
  failed: { label: 'Rejected', tone: 'danger', icon: 'alert-circle-outline' },
};

export const EWAY_STATUS_META: Record<EwayBillStatus, Meta> = {
  active: { label: 'Active', tone: 'success', icon: 'truck-fast-outline' },
  expired: { label: 'Expired', tone: 'warning', icon: 'clock-alert-outline' },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: 'close-octagon-outline' },
};

export const DOCUMENT_EWAY_STATUS_META: Record<DocumentEwayStatus, Meta> = {
  notApplicable: { label: 'Not applicable', tone: 'neutral', icon: 'minus-circle-outline' },
  notRequired: { label: 'Not required', tone: 'neutral', icon: 'minus-circle-outline' },
  pending: { label: 'Not raised', tone: 'warning', icon: 'clock-outline' },
  generated: { label: 'Raised', tone: 'success', icon: 'truck-fast-outline' },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: 'close-octagon-outline' },
  expired: { label: 'Expired', tone: 'warning', icon: 'clock-alert-outline' },
};

/** "in 6 hours", "3 days left", "expired 2 days ago". */
export function expiryPhrase(hours: number): string {
  if (hours < 0) {
    const past = Math.abs(hours);
    if (past < 24) return `expired ${Math.max(1, Math.round(past))} h ago`;
    const days = Math.round(past / 24);
    return `expired ${days} ${days === 1 ? 'day' : 'days'} ago`;
  }
  if (hours < 1) return 'expires within the hour';
  if (hours < 24) return `${Math.round(hours)} h left`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}
