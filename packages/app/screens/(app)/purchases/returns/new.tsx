import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { ReturnSourcePicker } from '../../../../features/documents/ReturnSourcePicker';

export default function NewPurchaseReturn() {
  const { t: tr } = useTranslation(['nav']);
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.newPurchaseReturn') }} />
      <ReturnSourcePicker kind="purchaseReturn" />
    </>
  );
}
