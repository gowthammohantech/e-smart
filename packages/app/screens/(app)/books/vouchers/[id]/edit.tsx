import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { VoucherForm } from '../../../../../features/books/VoucherForm';
import { useVouchers } from '../../../../../store/books';
import { useVoucherRecord } from '../../../../../remote/queries';
import { LoadingView } from '../../../../../components/LoadingView';
import { useGoBack } from '../../../../../navigation/useGoBack';

export default function EditVoucher() {
  const { t: tr } = useTranslation(['books', 'common']);
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const voucher = useVouchers().find((v) => v.id === id);
  const remote = useVoucherRecord(id);
  if (!voucher && remote.isLoading) return <LoadingView />;
  if (!voucher) return <EmptyState illustration="not-found" icon="file-remove-outline" title={tr('common:notFound.title')} />;
  return (
    <>
      <Stack.Screen options={{ title: voucher.number }} />
      <VoucherForm voucher={voucher} onSaved={() => goBack(`/(app)/books/vouchers/${voucher.id}`)} />
    </>
  );
}
