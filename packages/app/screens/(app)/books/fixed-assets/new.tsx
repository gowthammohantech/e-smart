import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { FixedAssetForm } from '../../../../features/books/FixedAssetForm';

export default function NewFixedAsset() {
  const { t: tr } = useTranslation(['books']);
  return (
    <>
      <Stack.Screen options={{ title: tr('books:assets.newTitle') }} />
      <FixedAssetForm />
    </>
  );
}
