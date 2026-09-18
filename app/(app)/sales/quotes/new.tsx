import React from 'react';
import { Stack } from 'expo-router';
import { DocumentEditor } from '@/features/documents/DocumentEditor';

export default function NewQuote() {
  return (
    <>
      <Stack.Screen options={{ title: 'New quotation' }} />
      <DocumentEditor kind="quote" />
    </>
  );
}
