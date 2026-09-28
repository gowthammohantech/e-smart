import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { DocumentEditor } from '@/features/documents/DocumentEditor';

export default function NewPurchaseBill() {
  const { t: tr } = useTranslation(['nav']);
  // Set by "Buy this item" on an item, or by a scanned bill.
  const { partyId, itemId, quantity } = useLocalSearchParams<{
    partyId?: string;
    itemId?: string;
    quantity?: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.newPurchaseBill') }} />
      <DocumentEditor
        kind="purchaseBill"
        prefill={partyId || itemId ? { partyId, itemId, quantity: Number(quantity) || 1 } : undefined}
      />
    </>
  );
}
