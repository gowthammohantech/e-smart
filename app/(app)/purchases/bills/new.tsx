import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { DocumentEditor } from '@/features/documents/DocumentEditor';

export default function NewPurchaseBill() {
  const { t: tr } = useTranslation(['nav']);
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.newPurchaseBill') }} />
      <DocumentEditor kind="purchaseBill" />
    </>
  );
}
