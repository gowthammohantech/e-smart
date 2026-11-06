import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter } from 'expo-router';
import { VoucherForm } from '../../../features/books/VoucherForm';

/** The GST journal entry from the GST menu: a voucher that adjusts a GST ledger (a credit reversed, interest, a correction). */
export default function GstJournalScreen() {
  const { t: tr } = useTranslation(['books']);
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: `${tr('books:vouchers.new')} · ${tr('books:vouchers.kind.gstJournal')}` }} />
      <VoucherForm initialKind="gstJournal" onSaved={(id) => router.replace(`/(app)/books/vouchers/${id}` as never)} />
    </>
  );
}
