import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useItem } from '@esmart/app/store/selectors';
import { useItemRecord } from '@esmart/app/remote/queries';
import { LoadingView } from '@esmart/app/components/LoadingView';
import { ItemFormDesktop } from './ItemFormDesktop';

/** Edit an item on a desktop: the add-item layout, filled in from the item. */
export function ItemEditDesktop() {
  const { t: tr } = useTranslation(['common', 'nav']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = useItemRecord(id);

  // The form copies what it starts from, so wait for this visit's fetch rather than open on a stale copy it would never take in.
  if ((!item && remote.isLoading) || (remote.isFetching && !remote.isFetchedAfterMount)) return <LoadingView variant="form" />;
  if (!item) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: tr('nav:title.editItem') }} />
        <EmptyState illustration="not-found" icon="package-variant-closed-remove" title={tr('common:notFound.title')} />
      </View>
    );
  }

  return <ItemFormDesktop item={item} />;
}
