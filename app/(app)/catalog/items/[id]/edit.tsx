import React from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { ItemForm } from '@/features/catalog/ItemForm';
import { EmptyState } from '@/components/EmptyState';
import { useItem } from '@/store/selectors';

export default function EditItem() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: 'Edit item' }} />
        <EmptyState icon="package-variant-closed-remove" title="Not found" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `Edit ${item.name}` }} />
      <ItemForm item={item} />
    </>
  );
}
