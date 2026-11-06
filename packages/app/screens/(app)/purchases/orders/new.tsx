import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { DocumentEditor } from '../../../../features/documents/DocumentEditor';

export default function NewPurchaseOrder() {
  const { t: tr } = useTranslation(['nav']);
  // Set by a contact's details, or kept in the URL once a party is picked.
  // `items` (id:qty,id:qty) comes from Low stock: what to reorder.
  const { partyId, items } = useLocalSearchParams<{ partyId?: string; items?: string }>();
  const lines = (items ?? '')
    .split(',')
    .map((pair) => pair.split(':'))
    .filter(([itemId, qty]) => itemId && Number(qty) > 0)
    .map(([itemId, qty]) => ({ itemId, quantity: Number(qty) }));
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.newPurchaseOrder') }} />
      <DocumentEditor kind="purchaseOrder" prefill={partyId || lines.length ? { partyId, items: lines } : undefined} />
    </>
  );
}
