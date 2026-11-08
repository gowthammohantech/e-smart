import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { PartyForm } from '../../../../features/contacts/PartyForm';

export default function NewCustomer() {
  const { t: tr } = useTranslation(['nav', 'contacts']);
  // The Contacts tab's "Other" list adds a contact with no account (a landlord, the auditor).
  const general = useLocalSearchParams<{ kind?: string }>().kind === 'general';
  return (
    <>
      <Stack.Screen options={{ title: general ? tr('contacts:hub.newContact') : tr('nav:title.newCustomer') }} />
      <PartyForm kind={general ? 'general' : 'customer'} />
    </>
  );
}
