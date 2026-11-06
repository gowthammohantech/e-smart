import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@esmart/ui/components/Toast';
import { deliverFile } from '../reports/exportFiles';
import { exportName, toCsv, type ReportTable } from '../reports/reportTable';

/**
 * A dashboard card's figures as a CSV file, named for the card and the period, through the same
 * delivery the reports use (a download in a browser, the share sheet on a phone).
 */
export function useCardExport() {
  const { t: tr } = useTranslation(['reports']);
  const toast = useToast();
  return useCallback(
    async (title: string, period: { from: string; to: string } | undefined, table: ReportTable) => {
      const name = exportName(title, period?.from ?? '', period?.to ?? '');
      try {
        await deliverFile(`${name}.csv`, new TextEncoder().encode(toCsv(table)), 'text/csv');
      } catch {
        toast.show(tr('reports:dash.export.cancelled'), 'info', { icon: 'file-cancel-outline' });
      }
    },
    [toast, tr],
  );
}

/** Money as a plain number of rupees for a spreadsheet: no symbol or grouping, so it can be summed. */
export const major = (m: { minor: number } | undefined) => (m ? m.minor / 100 : 0);
