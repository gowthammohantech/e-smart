import i18n from '@esmart/i18n';
import { shownCessRate } from '@esmart/core/domain/lineCalc';
import { formatPercent } from '@esmart/core/lib/format';
import type { DocumentLine } from '@esmart/core/types';

/** A line's tax rate as it is shown on a line: "28%", or "28% + 12% cess" when cess applies. */
export function lineRateLabel(line: Pick<DocumentLine, 'taxRate' | 'gst'>): string {
  const cess = shownCessRate(line);
  const rate = formatPercent(line.taxRate);
  return cess ? i18n.t('sales:line.rateWithCess', { rate, cess: formatPercent(cess) }) : rate;
}
