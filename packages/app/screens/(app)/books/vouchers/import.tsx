import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { ImportJournals } from '../../../../features/books/ImportJournals';

export default function ImportJournalsScreen() {
  const { t: tr } = useTranslation(['books']);
  return (
    <>
      <Stack.Screen options={{ title: tr('books:journalImport.title') }} />
      <ImportJournals />
    </>
  );
}
