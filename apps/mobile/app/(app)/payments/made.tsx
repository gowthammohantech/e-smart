import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { PaymentListView } from '@/features/payments/PaymentListView';

export default function PaymentsMade() {
  const { t: tr } = useTranslation(['nav']);
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.paymentsMade') }} />
      <PaymentListView direction="paid" />
    </>
  );
}
