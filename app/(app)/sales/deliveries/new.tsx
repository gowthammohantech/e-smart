import React from 'react';
import { Stack } from 'expo-router';
import { DocumentEditor } from '@/features/documents/DocumentEditor';

export default function NewDelivery() {
  return (
    <>
      <Stack.Screen options={{ title: 'New delivery note' }} />
      <DocumentEditor kind="delivery" />
    </>
  );
}
