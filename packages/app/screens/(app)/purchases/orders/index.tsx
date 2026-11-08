import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function PurchaseOrderList() {
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.purchaseOrders') }} />
      <DocumentListView
        kind="purchaseOrder"
        routeFor={(d) => `/(app)/purchases/orders/${d.id}`}
        emptyAction={tr('nav:title.newPurchaseOrder')}
        onEmptyAction={() => router.push('/(app)/purchases/orders/new')}
      />
      <Fab icon="plus" label={tr('nav:title.newPurchaseOrder')} onPress={() => router.push('/(app)/purchases/orders/new')} />
    </View>
  );
}
