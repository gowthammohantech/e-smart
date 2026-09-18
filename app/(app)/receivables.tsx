import React from 'react';
import { Stack } from 'expo-router';
import { AgingScreen } from '@/features/ledger/AgingScreen';

export default function Receivables() {
  return (
    <>
      <Stack.Screen options={{ title: 'Receivables' }} />
      <AgingScreen kind="receivable" />
    </>
  );
}
