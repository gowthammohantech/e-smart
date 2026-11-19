import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { ImportContacts } from '../../../features/contacts/ImportContacts';

export default function ImportContactsScreen() {
  const { t: tr } = useTranslation(['contacts']);
  return (
    <>
      <Stack.Screen options={{ title: tr('contacts:import.title') }} />
      <ImportContacts />
    </>
  );
}
