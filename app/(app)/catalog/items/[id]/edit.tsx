import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { ItemForm } from '@/features/catalog/ItemForm';
import { EmptyState } from '@/components/EmptyState';
import { useItem } from '@/store/selectors';

export default function EditItem() {
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

  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.editNamed', { name: item.name }) }} />
      <ItemForm item={item} />
    </>
  );
}
