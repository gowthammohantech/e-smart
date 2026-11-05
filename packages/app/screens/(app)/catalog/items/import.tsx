import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { ImportItems } from '../../../../features/catalog/ImportItems';

export default function ImportItemsScreen() {
  const { t: tr } = useTranslation(['inventory']);
  return (
    <>
      <Stack.Screen options={{ title: tr('inventory:import.title') }} />
      <ImportItems />
    </>
  );
}
