import React from 'react';
import { Stack } from 'expo-router';
import { DocumentEditor } from '@/features/documents/DocumentEditor';

export default function NewPurchaseReturn() {
  return (
    <>
      <Stack.Screen options={{ title: 'New purchase return' }} />
      <DocumentEditor kind="purchaseReturn" />
    </>
  );
}
