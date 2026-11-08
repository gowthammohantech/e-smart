import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { PartyStatementView } from '../../../../../features/contacts/PartyStatementView';
import { useParty } from '../../../../../store/selectors';
import { usePartyRecord } from '../../../../../remote/queries';
import { LoadingView } from '../../../../../components/LoadingView';

export default function SupplierStatement() {
  const { t: tr } = useTranslation(['common', 'contacts']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const party = useParty(id);
  const remote = usePartyRecord(id);
  if (!party && remote.isLoading) return <LoadingView variant="report" />;
  if (!party) {
    return (
      <View style={{ flex: 1 }}>
        <EmptyState illustration="not-found" icon="account-off-outline" title={tr('common:notFound.title')} message={tr('common:notFound.contact')} />
      </View>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: tr('contacts:statement.title', { name: party.name }) }} />
      <PartyStatementView party={party} />
    </>
  );
}
