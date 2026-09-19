import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { PartyDetail } from '@/features/contacts/PartyDetail';
import { EmptyState } from '@/components/EmptyState';
import { useParty } from '@/store/selectors';

export default function SupplierDetail() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'nav']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const party = useParty(id);

  if (!party) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.supplier') }} />
        <EmptyState illustration="not-found" icon="account-off-outline" title={tr('common:notFound.title')} message={tr('common:notFound.contact')} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: party.name }} />
      <PartyDetail party={party} />
    </>
  );
}
