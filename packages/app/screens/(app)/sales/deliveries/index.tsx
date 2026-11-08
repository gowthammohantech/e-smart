import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function DeliveryList() {
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.deliveryNotes') }} />
      <DocumentListView
        kind="delivery"
        routeFor={(d) => `/(app)/sales/deliveries/${d.id}`}
        emptyAction={tr('nav:title.newDeliveryNote')}
        onEmptyAction={() => router.push('/(app)/sales/deliveries/new')}
      />
      <Fab icon="plus" label={tr('nav:title.newDeliveryNote')} onPress={() => router.push('/(app)/sales/deliveries/new')} />
    </View>
  );
}
