import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { LoadingView } from '../../../../../components/LoadingView';
import { FixedAssetForm } from '../../../../../features/books/FixedAssetForm';
import { useFixedAsset } from '../../../../../remote/fixedAssets';

export default function EditFixedAsset() {
  const { t: tr } = useTranslation(['books']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const asset = useFixedAsset(id).data;
  return (
    <>
      <Stack.Screen options={{ title: tr('books:assets.editTitle') }} />
      {asset ? <FixedAssetForm key={`${asset.id}:${asset.version}`} asset={asset} /> : <LoadingView />}
    </>
  );
}
