import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { DocumentEditor } from '@/features/documents/DocumentEditor';

export default function NewSalesReturn() {
  const { t: tr } = useTranslation(['nav']);
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.newSalesReturn') }} />
      <DocumentEditor kind="salesReturn" />
    </>
  );
}
