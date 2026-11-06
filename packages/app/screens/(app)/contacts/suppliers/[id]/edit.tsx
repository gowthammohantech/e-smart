import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { PartyForm } from '../../../../../features/contacts/PartyForm';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useParty } from '../../../../../store/selectors';
import { usePartyRecord } from '../../../../../remote/queries';
import { LoadingView } from '../../../../../components/LoadingView';

export default function EditSupplier() {
  const { t: tr } = useTranslation(['common', 'nav']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const party = useParty(id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = usePartyRecord(id);

  if (!party && remote.isLoading) return <LoadingView />;
  if (!party) {
    return (
      <View style={{ flex: 1 }}>
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
