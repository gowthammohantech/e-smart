import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useItem } from '@esmart/app/store/selectors';
import { ItemFormDesktop } from './ItemFormDesktop';

/** Edit an item on a desktop: the add-item layout, filled in from the item. */
export function ItemEditDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'nav']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.editItem') }} />
        <EmptyState illustration="not-found" icon="package-variant-closed-remove" title={tr('common:notFound.title')} />
      </View>
    );
  }

  return <ItemFormDesktop item={item} />;
}
