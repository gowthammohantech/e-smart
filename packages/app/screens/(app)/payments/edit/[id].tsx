import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useParty, usePayment } from '../../../../store/selectors';
import { usePaymentRecord } from '../../../../remote/queries';
import { LoadingView } from '../../../../components/LoadingView';
import { PaymentEditForm } from '../../../../features/payments/PaymentEditForm';

export default function EditPayment() {
  const { t: tr } = useTranslation(['common', 'nav']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const payment = usePayment(id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = usePaymentRecord(id);
  // The record brings its party with it: until then the summary would read "Received from Unknown".
  const party = useParty(payment?.partyId);
  const partyPending = !!payment?.partyId && !party && remote.isFetching;

  if ((!payment && remote.isLoading) || partyPending) return <LoadingView variant="form" />;
  if (!payment) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: tr('nav:title.payment') }} />
        <EmptyState illustration="not-found" icon="cash-remove" title={tr('common:notFound.title')} message={tr('common:notFound.payment')} />
      </View>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.editNamed', { name: payment.number }) }} />
      <PaymentEditForm key={payment.id} payment={payment} />
    </>
  );
}
