import React from 'react';
import { Stack } from 'expo-router';
import { DocumentEditor } from '@/features/documents/DocumentEditor';

export default function NewSalesOrder() {
  return (
    <>
      <Stack.Screen options={{ title: 'New sales order' }} />
      <DocumentEditor kind="salesOrder" />
    </>
  );
}
