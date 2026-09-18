import React from 'react';
import { Stack } from 'expo-router';
import { DocumentEditor } from '@/features/documents/DocumentEditor';

export default function NewPurchaseBill() {
  return (
    <>
      <Stack.Screen options={{ title: 'New purchase bill' }} />
      <DocumentEditor kind="purchaseBill" />
    </>
  );
}
