import React from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { PartyForm } from '@/features/contacts/PartyForm';
import { EmptyState } from '@/components/EmptyState';
import { useParty } from '@/store/selectors';

export default function EditSupplier() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const party = useParty(id);

  if (!party) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: 'Edit' }} />
        <EmptyState illustration="not-found" icon="account-off-outline" title="Not found" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `Edit ${party.name}` }} />
      <PartyForm kind="supplier" party={party} />
    </>
  );
}
