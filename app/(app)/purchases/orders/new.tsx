import React from 'react';
import { Stack } from 'expo-router';
import { DocumentEditor } from '@/features/documents/DocumentEditor';

export default function NewPurchaseOrder() {
  return (
    <>
      <Stack.Screen options={{ title: 'New purchase order' }} />
      <DocumentEditor kind="purchaseOrder" />
    </>
  );
}
