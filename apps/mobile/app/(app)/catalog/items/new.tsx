import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { ItemForm } from '@/features/catalog/ItemForm';

export default function NewItem() {
  const { t: tr } = useTranslation(['nav']);
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.newItem') }} />
      <ItemForm />
    </>
  );
}
