import React from 'react';
import { Stack } from 'expo-router';
import { DocumentEditor } from '@/features/documents/DocumentEditor';

export default function NewSalesReturn() {
  return (
    <>
      <Stack.Screen options={{ title: 'New sales return' }} />
      <DocumentEditor kind="salesReturn" />
    </>
  );
}
