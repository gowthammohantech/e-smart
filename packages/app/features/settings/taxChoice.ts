import type { Translate } from '@esmart/core/labels';
import { formatDate } from '@esmart/core/lib/date';
import { taxUnavailableOn } from '@esmart/core/domain/taxEngine';
import type { TaxCategory } from '@esmart/core/types';

/**
 * A tax rate in a picker that can't be charged on `date` (made inactive, ended, or not started):
 * still listed so the person knows it is there, greyed out with a short note, and tapping it says
 * why. `keepId`, the rate a line or item already has, stays pickable. `forItem` skips the dates:
 * an item's default rate is any rate still active, as documents check the date themselves.
 */
export function taxChoice(tr: Translate, c: TaxCategory, date: string | undefined, opts: { keepId?: string; forItem?: boolean } = {}) {
  if (c.id === opts.keepId) return {};
  const why = opts.forItem ? (c.status === 'inactive' ? 'inactive' : undefined) : taxUnavailableOn(c, date);
  if (!why) return {};
  if (why === 'inactive') return { note: { text: tr('settings:taxes.inactive'), tone: 'muted' as const }, blocked: tr('settings:taxes.inactiveBlocked', { name: c.name }) };
  if (why === 'ended') return { note: { text: tr('settings:taxes.endedOn', { date: formatDate(c.effectiveTo!) }), tone: 'muted' as const }, blocked: tr('settings:taxes.endedBlocked', { name: c.name, date: formatDate(c.effectiveTo!) }) };
  return { note: { text: tr('settings:taxes.fromOn', { date: formatDate(c.effectiveFrom) }), tone: 'muted' as const }, blocked: tr('sales:editor.taxBeforeStart', { name: c.name, date: formatDate(c.effectiveFrom) }) };
}

/** The same reason as a sentence, for a line or expense that already has a rate it can't be charged on. */
export function taxProblem(tr: Translate, c: TaxCategory | undefined, date: string | undefined): string | undefined {
  if (!c) return undefined;
  return taxChoice(tr, c, date).blocked;
}
