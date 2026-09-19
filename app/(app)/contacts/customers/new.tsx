import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { PartyForm } from '@/features/contacts/PartyForm';

export default function NewCustomer() {
  const { t: tr } = useTranslation(['nav']);
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.newCustomer') }} />
      <PartyForm kind="customer" />
    </>
  );
}
