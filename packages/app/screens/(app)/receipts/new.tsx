import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter } from 'expo-router';
import { ReceiptForm } from '../../../features/receipts/ReceiptForm';

export default function NewReceipt() {
  const { t: tr } = useTranslation(['books']);
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: tr('books:receipts.new') }} />
      <ReceiptForm onSaved={(id) => router.replace(`/(app)/receipts/${id}` as never)} />
    </>
  );
}
