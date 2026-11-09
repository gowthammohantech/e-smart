import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { PartyForm } from '../../../../../features/contacts/PartyForm';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useParty } from '../../../../../store/selectors';
import { usePartyRecord } from '../../../../../remote/queries';
import { LoadingView } from '../../../../../components/LoadingView';

export default function EditCustomer() {
  const { t: tr } = useTranslation(['common', 'nav']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const party = useParty(id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = usePartyRecord(id);

  // The form copies what it starts from, so wait for this visit's fetch rather than open on a stale copy it would never take in.
  if ((!party && remote.isLoading) || (remote.isFetching && !remote.isFetchedAfterMount)) return <LoadingView variant="form" />;
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
      <PartyForm kind="customer" party={party} />
    </>
  );
}
