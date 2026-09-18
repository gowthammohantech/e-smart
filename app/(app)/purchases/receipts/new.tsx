import React from 'react';
import { Stack } from 'expo-router';
import { DocumentEditor } from '@/features/documents/DocumentEditor';

export default function NewGoodsReceipt() {
  return (
    <>
      <Stack.Screen options={{ title: 'New goods receipt' }} />
      <DocumentEditor kind="goodsReceipt" />
    </>
  );
}
