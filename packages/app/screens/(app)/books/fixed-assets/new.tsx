import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { FixedAssetForm, type AssetPrefill } from '../../../../features/books/FixedAssetForm';

/** A new asset; from a bill's capital-goods lines it starts filled in (`?sourceDocumentId=…&cost=…`). */
export default function NewFixedAsset() {
  const { t: tr } = useTranslation(['books']);
  const q = useLocalSearchParams<{ sourceDocumentId?: string; name?: string; cost?: string; acquiredOn?: string; branchId?: string; notes?: string }>();
  const prefill: AssetPrefill | undefined = q.sourceDocumentId
    ? { sourceDocumentId: q.sourceDocumentId, name: q.name, costMinor: Number(q.cost) || undefined, acquiredOn: q.acquiredOn, branchId: q.branchId, notes: q.notes }
    : undefined;
  return (
    <>
      <Stack.Screen options={{ title: tr('books:assets.newTitle') }} />
      <FixedAssetForm prefill={prefill} />
    </>
  );
}
