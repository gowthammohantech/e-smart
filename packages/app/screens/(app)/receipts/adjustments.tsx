import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { AdjustmentListView } from '../../../features/payments/AdjustmentListView';

/** Advance adjustments: advances used on invoices and credit notes applied, with + to make one. */
export default function AdvanceAdjustments() {
  const { t: tr } = useTranslation(['books']);
  return (
    <>
      <Stack.Screen options={{ title: tr('books:adjustments.title') }} />
      <AdjustmentListView />
    </>
  );
}
