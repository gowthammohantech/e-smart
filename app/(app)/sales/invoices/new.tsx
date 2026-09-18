import React from 'react';
import { Stack } from 'expo-router';
import { DocumentEditor } from '@/features/documents/DocumentEditor';

export default function NewInvoice() {
  return (
    <>
      <Stack.Screen options={{ title: 'New invoice' }} />
      <DocumentEditor kind="invoice" />
    </>
  );
}
