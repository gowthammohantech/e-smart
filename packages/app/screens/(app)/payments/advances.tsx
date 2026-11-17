import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { PaymentListView } from '../../../features/payments/PaymentListView';

/** Advance receipts: money received for services, with the GST on it, and what is still to adjust. */
export default function AdvanceReceipts() {
  const { t: tr } = useTranslation(['nav']);
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.advanceReceipts') }} />
      <PaymentListView direction="received" advance />
    </>
  );
}
