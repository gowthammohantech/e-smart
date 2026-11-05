import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ImportOpenings } from '../../../../features/ledger/ImportOpenings';

export default function ImportOpeningsScreen() {
  const { t: tr } = useTranslation(['books']);
  const { side } = useLocalSearchParams<{ side?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: tr('books:openings.title') }} />
      <ImportOpenings side={side === 'payable' ? 'payable' : 'receivable'} />
    </>
  );
}
