import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter } from 'expo-router';
import { VoucherForm } from '../../../../features/books/VoucherForm';

export default function NewVoucher() {
  const { t: tr } = useTranslation(['books']);
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: tr('books:vouchers.new') }} />
      <VoucherForm onSaved={(id) => router.replace(`/(app)/books/vouchers/${id}` as never)} />
    </>
  );
}
