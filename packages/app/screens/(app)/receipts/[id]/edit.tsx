import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ReceiptForm } from '../../../../features/receipts/ReceiptForm';
import { useVouchers } from '../../../../store/books';
import { useParties } from '../../../../store/selectors';
import { usePartyRecord, useServerBook, useVoucherRecord } from '../../../../remote/queries';
import { LoadingView } from '../../../../components/LoadingView';

export default function EditReceipt() {
  const { t: tr } = useTranslation(['books', 'common', 'nav']);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const stored = useVouchers().find((v) => v.id === id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = useVoucherRecord(id);
  const voucher = stored ?? (remote.data as typeof stored);
  // The form names its accounts from the chart and its party from the record: until both are in,
  // it would read "Pick account" and an empty party, and could be saved that way.
  const { loaded } = useServerBook();
  const partyQuery = usePartyRecord(voucher?.partyId);
  const party = useParties().find((p) => p.id === voucher?.partyId);
  const partyPending = !!voucher?.partyId && !party && partyQuery.isLoading;

  if ((!voucher && remote.isLoading) || (voucher && (!loaded || partyPending))) return <LoadingView variant="form" />;
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
