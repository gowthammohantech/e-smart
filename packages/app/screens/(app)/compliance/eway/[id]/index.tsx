import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { EwayBillDetail } from '../../../../../features/compliance/EwayBillDetail';
import { useEwayBill } from '../../../../../store/selectors';
import { useEwayBillRecord } from '../../../../../remote/queries';
import { LoadingView } from '../../../../../components/LoadingView';

export default function EwayBillScreen() {
  const { t: tr } = useTranslation(['compliance', 'common']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const bill = useEwayBill(id);
  // Fetched on opening: the device keeps only the bills it has seen.
  const remote = useEwayBillRecord(id);
  if (!bill && remote.isLoading) return <LoadingView />;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: bill ? tr('compliance:einv.ewayBill') : tr('common:notFound.title') }} />
      {bill ? (
        <EwayBillDetail bill={bill} />
      ) : (
        <EmptyState
          illustration="not-found"
          title={tr('compliance:notFound.ewbTitle')}
          message={tr('compliance:notFound.ewbBody')}
        />
      )}
    </View>
  );
}
