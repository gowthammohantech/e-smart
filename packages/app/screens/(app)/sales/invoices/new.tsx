import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { DocumentEditor } from '../../../../features/documents/DocumentEditor';

export default function NewInvoice() {
  const { t: tr } = useTranslation(['nav']);
  // Set when a Siri / Shortcuts intent, or "Sell this item", opens this screen.
  const { partyId, itemId, quantity } = useLocalSearchParams<{
    partyId?: string;
    itemId?: string;
    quantity?: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.newInvoice') }} />
      <DocumentEditor
        kind="invoice"
        prefill={partyId || itemId ? { partyId, itemId, quantity: Number(quantity) || 1 } : undefined}
      />
    </>
  );
}
