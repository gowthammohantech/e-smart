import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { PartyForm } from '@/features/contacts/PartyForm';
import { EmptyState } from '@/components/EmptyState';
import { useParty } from '@/store/selectors';

export default function EditSupplier() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'nav']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const party = useParty(id);

  if (!party) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.edit') }} />
        <EmptyState illustration="not-found" icon="account-off-outline" title={tr('common:notFound.title')} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.editNamed', { name: party.name }) }} />
      <PartyForm kind="supplier" party={party} />
    </>
  );
}
