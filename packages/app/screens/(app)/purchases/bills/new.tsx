import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { DocumentEditor } from '../../../../features/documents/DocumentEditor';
import { useOcrStore } from '../../../../features/ocr/ocrStore';
import { isoOrUndefined } from '../../../../features/ocr/matchParty';
import { useScannedParty } from '../../../../features/ocr/useScannedParty';
import { LoadingView } from '../../../../components/LoadingView';

export default function NewPurchaseBill() {
  const { t: tr } = useTranslation(['nav']);
  // Set by "Buy this item" on an item, by a scanned bill, or by a GSTR-2B line not in the books.
  const { partyId, itemId, quantity, fromScan, supplierDocNumber, date } = useLocalSearchParams<{
    partyId?: string;
    itemId?: string;
    quantity?: string;
    fromScan?: string;
    supplierDocNumber?: string;
    date?: string;
  }>();
  const scan = useOcrStore((s) => s.result);
  const field = (key: string) => scan?.fields.find((f) => f.key === key)?.value || undefined;
  const fromBill = !!fromScan && scan?.kind === 'purchaseBill';
  // The supplier is looked up on the server before the editor opens with it.
  const supplier = useScannedParty('supplier', { gstin: field('gstin'), name: field('vendor') }, fromBill);
  const scanned =
    fromBill && scan
      ? {
          partyId: supplier.id,
          date: isoOrUndefined(field('date')),
          supplierDocNumber: field('reference'),
          lines: scan.lines,
          attachmentIds: scan.attachmentId ? [scan.attachmentId] : undefined,
        }
      : undefined;
  if (supplier.loading) return <LoadingView />;
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.newPurchaseBill') }} />
      <DocumentEditor
        kind="purchaseBill"
        prefill={scanned ?? (partyId || itemId || supplierDocNumber ? { partyId, itemId, quantity: Number(quantity) || 1, supplierDocNumber, date } : undefined)}
      />
    </>
  );
}
