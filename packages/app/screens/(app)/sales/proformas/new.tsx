import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { DocumentEditor } from '../../../../features/documents/DocumentEditor';

export default function NewProforma() {
  const { t: tr } = useTranslation(['nav']);
  // Set by a contact's details, or kept in the URL once a party is picked.
  const { partyId } = useLocalSearchParams<{ partyId?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.newProforma') }} />
      <DocumentEditor kind="proforma" prefill={partyId ? { partyId } : undefined} />
    </>
  );
}
