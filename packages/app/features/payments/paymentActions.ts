import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';
import { useToast } from '@esmart/ui/components/Toast';
import { formatMoney } from '@esmart/core/lib/format';
import type { Payment } from '@esmart/core/types';
import { api } from '../../remote/api';
import { RemoteError, describeError } from '../../remote/errors';
import { adjustAdvancesFor } from '../../remote/queries';
import { deliverFile } from '../reports/exportFiles';
import { useSingleFlight } from '../../components/useSingleFlight';

const fileName = (number: string) => `${(number || 'payment').replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;

/** The server's receipt (money in) or payment voucher (money out) for one payment, as bytes. */
export async function paymentPdf(companyId: string, id: string): Promise<Uint8Array> {
  const { data } = await api.GET('/companies/{companyId}/payments/{id}/receipt', {
    params: { path: { companyId, id } },
    parseAs: 'arrayBuffer',
  });
  if (!data) throw new RemoteError('noPdf', 'The server returned no PDF');
  return new Uint8Array(data as unknown as ArrayBuffer);
}

/**
 * The actions a payment's page offers besides edit and delete: its PDF (downloaded in a browser,
 * handed to the share sheet on a phone) and adjusting the advance it left. Each runs one at a time, so a
 * second tap (a second adjustment posted) does nothing while the first runs.
 */
export function usePaymentActions(payment: Payment | undefined) {
  const { t: tr } = useTranslation(['sales', 'common']);
  const toast = useToast();
  const pdf = useSingleFlight();
  const adjust = useSingleFlight();

  const sharePdf = () =>
    payment &&
    pdf.run(async () => {
      try {
        await toast.promise(
          (async () => {
            const bytes = await paymentPdf(payment.companyId, payment.id);
            await deliverFile(fileName(payment.number), bytes, 'application/pdf');
          })(),
          {
            loading: tr('sales:detail.pdfPreparing'),
            success: { text: tr(Platform.OS === 'web' ? 'sales:detail.pdfDownloaded' : 'sales:detail.pdfReady'), detail: fileName(payment.number) },
            error: (err) => `${tr('sales:detail.pdfFailed')} ${describeError(err, tr)}`,
            icon: 'file-pdf-box',
          },
        );
      } catch {
        // The toast has said what went wrong.
      }
    });

  const adjustAdvance = () =>
    payment &&
    adjust.run(async () => {
      // On the server: notes too, and a service advance's GST.
      try {
        const applied = await adjustAdvancesFor(payment.partyId, payment.direction, undefined);
        toast.show(
          applied.length ? tr('sales:payment.advanceAdjusted', { amount: applied.map((m) => formatMoney(m)).join(', ') }) : tr('sales:payment.advanceNothingToAdjust'),
          applied.length ? 'success' : 'info',
        );
      } catch (err) {
        toast.show(describeError(err, tr), 'error');
      }
    });

  return { sharePdf, adjustAdvance, pdfBusy: pdf.busy, adjusting: adjust.busy };
}
