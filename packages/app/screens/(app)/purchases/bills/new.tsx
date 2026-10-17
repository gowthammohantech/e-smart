import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { DocumentEditor } from '../../../../features/documents/DocumentEditor';
import { useOcrStore } from '../../../../features/ocr/ocrStore';
import { isoOrUndefined, matchParty } from '../../../../features/ocr/matchParty';
import { useParties } from '../../../../store/selectors';

export default function NewPurchaseBill() {
  const { t: tr } = useTranslation(['nav']);
  // Set by "Buy this item" on an item, or by a scanned bill.
  const { partyId, itemId, quantity, fromScan } = useLocalSearchParams<{
    partyId?: string;
    itemId?: string;
    quantity?: string;
    fromScan?: string;
  }>();
  const scan = useOcrStore((s) => s.result);
  const suppliers = useParties('supplier');
  const field = (key: string) => scan?.fields.find((f) => f.key === key)?.value || undefined;
  const scanned =
    fromScan && scan?.kind === 'purchaseBill'
      ? {
          partyId: matchParty(suppliers, { gstin: field('gstin'), name: field('vendor') }),
          date: isoOrUndefined(field('date')),
          supplierDocNumber: field('reference'),
          lines: scan.lines,
        }
      : undefined;
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.newPurchaseBill') }} />
      <DocumentEditor
        kind="purchaseBill"
        prefill={scanned ?? (partyId || itemId ? { partyId, itemId, quantity: Number(quantity) || 1 } : undefined)}
      />
    </>
  );
}
