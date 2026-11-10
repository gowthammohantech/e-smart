import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cessBreakup } from '@esmart/core/domain/cessBreakup';
import { formatMoney, formatPercent } from '@esmart/core/lib/format';
import type { DocumentLine, DocumentTotals } from '@esmart/core/types';

/**
 * The cess item by item, for the totals panel: each item's name, its rate and the value it is on,
 * and its share. Undefined when nothing on the document carries cess, so the panel shows nothing.
 */
export function useCessRows(lines: DocumentLine[], totals: DocumentTotals, currency: string, reverseCharge?: boolean) {
  const { t: tr } = useTranslation(['sales']);
  return useMemo(() => {
    const rows = cessBreakup(lines, totals, currency, reverseCharge);
    if (!rows.length) return undefined;
    return {
      title: tr('sales:cess.itemWise'),
      rows: rows.map((r) => ({
        key: r.lineId,
        label: r.name,
        detail: [
          tr(r.reverseCharge ? 'sales:cess.lineReverseCharge' : 'sales:cess.line', { rate: formatPercent(r.cessRate), taxable: formatMoney(r.taxable) }),
          r.hsnCode ? `HSN ${r.hsnCode}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        amount: r.cess,
      })),
    };
  }, [lines, totals, currency, reverseCharge, tr]);
}
