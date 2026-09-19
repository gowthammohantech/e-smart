import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DocumentEwayStatus, EInvoiceStatus, EwayBillStatus } from '@/types';
import { StatusTone } from '@/domain/documentStates';
import type { Translate } from '@/i18n/labels';

/**
 * How a compliance state is presented. The tone and the icon are fixed; the
 * word is a catalogue key, resolved where it is rendered.
 */
type Meta = { labelKey: string; tone: StatusTone; icon: keyof typeof MaterialCommunityIcons.glyphMap };

/** Presentation for the e-invoice states, mirroring STATUS_TONE for documents. */
export const E_INVOICE_STATUS_META: Record<EInvoiceStatus, Meta> = {
  notApplicable: { labelKey: 'compliance:status.eInvoice.notApplicable', tone: 'neutral', icon: 'minus-circle-outline' },
  pending: { labelKey: 'compliance:status.eInvoice.pending', tone: 'warning', icon: 'clock-outline' },
  generated: { labelKey: 'compliance:status.eInvoice.generated', tone: 'success', icon: 'shield-check-outline' },
  cancelled: { labelKey: 'compliance:status.eInvoice.cancelled', tone: 'danger', icon: 'shield-off-outline' },
  failed: { labelKey: 'compliance:status.eInvoice.failed', tone: 'danger', icon: 'alert-circle-outline' },
};

export const EWAY_STATUS_META: Record<EwayBillStatus, Meta> = {
  active: { labelKey: 'compliance:status.eway.active', tone: 'success', icon: 'truck-fast-outline' },
  expired: { labelKey: 'compliance:status.eway.expired', tone: 'warning', icon: 'clock-alert-outline' },
  cancelled: { labelKey: 'compliance:status.eway.cancelled', tone: 'neutral', icon: 'close-octagon-outline' },
};

export const DOCUMENT_EWAY_STATUS_META: Record<DocumentEwayStatus, Meta> = {
  notApplicable: { labelKey: 'compliance:status.docEway.notApplicable', tone: 'neutral', icon: 'minus-circle-outline' },
  notRequired: { labelKey: 'compliance:status.docEway.notRequired', tone: 'neutral', icon: 'minus-circle-outline' },
  pending: { labelKey: 'compliance:status.docEway.pending', tone: 'warning', icon: 'clock-outline' },
  generated: { labelKey: 'compliance:status.docEway.generated', tone: 'success', icon: 'truck-fast-outline' },
  cancelled: { labelKey: 'compliance:status.docEway.cancelled', tone: 'neutral', icon: 'close-octagon-outline' },
  expired: { labelKey: 'compliance:status.docEway.expired', tone: 'warning', icon: 'clock-alert-outline' },
};

/**
 * "expires within the hour", "3 days left", "expired 2 days ago".
 *
 * The branching stays here and stays pure — a test can pass a translator that
 * echoes its key and assert which branch ran, without asserting on prose.
 */
export function expiryPhrase(t: Translate, hours: number): string {
  if (hours < 0) {
    const past = Math.abs(hours);
    if (past < 24) return t('compliance:expiry.expiredHours', { count: Math.max(1, Math.round(past)) });
    return t('compliance:expiry.expiredDays', { count: Math.round(past / 24) });
  }
  if (hours < 1) return t('compliance:expiry.withinHour');
  if (hours < 24) return t('compliance:expiry.hoursLeft', { count: Math.round(hours) });
  return t('compliance:expiry.daysLeft', { count: Math.floor(hours / 24) });
}
