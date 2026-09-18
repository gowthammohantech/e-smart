import React from 'react';
import { Stack } from 'expo-router';
import { PaymentListView } from '@/features/payments/PaymentListView';

export default function PaymentsMade() {
  return (
    <>
      <Stack.Screen options={{ title: 'Payments made' }} />
      <PaymentListView direction="paid" />
    </>
  );
}
