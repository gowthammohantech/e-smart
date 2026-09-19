import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { AgingScreen } from '@/features/ledger/AgingScreen';

export default function Payables() {
  const { t: tr } = useTranslation(['nav']);
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.payables') }} />
      <AgingScreen kind="payable" />
    </>
  );
}
