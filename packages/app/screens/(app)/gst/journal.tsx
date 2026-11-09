import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter } from 'expo-router';
import { VoucherForm } from '../../../features/books/VoucherForm';
import { useAppStore } from '../../../store/appStore';

/** The GST journal entry from the GST menu: a voucher that adjusts a GST ledger (a credit reversed, interest, a correction). */
export default function GstJournalScreen() {
  const { t: tr } = useTranslation(['books']);
  const router = useRouter();
  // Its lines hold this business's accounts: a switch starts the form again.
  const companyId = useAppStore((s) => s.activeCompanyId);
  return (
    <>
      <Stack.Screen options={{ title: `${tr('books:vouchers.new')} · ${tr('books:vouchers.kind.gstJournal')}` }} />
      <VoucherForm key={companyId} initialKind="gstJournal" onSaved={(id) => router.replace(`/(app)/books/vouchers/${id}` as never)} />
    </>
  );
}
