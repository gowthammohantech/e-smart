import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ReceiptForm } from '../../../../features/receipts/ReceiptForm';
import { useVouchers } from '../../../../store/books';
import { useVoucherRecord } from '../../../../remote/queries';
import { LoadingView } from '../../../../components/LoadingView';

export default function EditReceipt() {
  const { t: tr } = useTranslation(['books', 'common', 'nav']);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const stored = useVouchers().find((v) => v.id === id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = useVoucherRecord(id);
  const voucher = stored ?? (remote.data as typeof stored);

  if (!voucher && remote.isLoading) return <LoadingView variant="form" />;
  if (!voucher || voucher.kind !== 'receipt') {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: tr('books:receipts.edit') }} />
        <EmptyState illustration="not-found" icon="cash-remove" title={tr('common:notFound.title')} />
      </View>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.editNamed', { name: voucher.number }) }} />
      <ReceiptForm key={voucher.id} voucher={voucher} onSaved={(saved) => router.replace(`/(app)/receipts/${saved}` as never)} />
    </>
  );
}
