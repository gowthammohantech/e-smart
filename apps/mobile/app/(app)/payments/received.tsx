import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { PaymentListView } from '@/features/payments/PaymentListView';

export default function PaymentsReceived() {
  const { t: tr } = useTranslation(['nav']);
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.paymentsReceived') }} />
      <PaymentListView direction="received" />
    </>
  );
}
