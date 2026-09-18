import React from 'react';
import { Stack } from 'expo-router';
import { PaymentListView } from '@/features/payments/PaymentListView';

export default function PaymentsReceived() {
  return (
    <>
      <Stack.Screen options={{ title: 'Payments received' }} />
      <PaymentListView />
    </>
  );
}
