import React from 'react';
import { Stack } from 'expo-router';
import { AgingScreen } from '@/features/ledger/AgingScreen';

export default function Payables() {
  return (
    <>
      <Stack.Screen options={{ title: 'Payables' }} />
      <AgingScreen kind="payable" />
    </>
  );
}
