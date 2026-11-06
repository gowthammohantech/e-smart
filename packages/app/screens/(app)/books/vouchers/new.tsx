import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { VoucherForm, voucherKindParam } from '../../../../features/books/VoucherForm';

/** `?kind=journal|contra|gstJournal|tdsChallan` opens the form on that kind, as a menu entry does. */
export default function NewVoucher() {
  const { t: tr } = useTranslation(['books']);
  const router = useRouter();
  const kind = voucherKindParam(useLocalSearchParams<{ kind?: string }>().kind);
  return (
    <>
      <Stack.Screen options={{ title: kind ? `${tr('books:vouchers.new')} · ${tr(`books:vouchers.kind.${kind}`)}` : tr('books:vouchers.new') }} />
      <VoucherForm onSaved={(id) => router.replace(`/(app)/books/vouchers/${id}` as never)} />
    </>
  );
}
