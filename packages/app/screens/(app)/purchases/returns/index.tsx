import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function PurchaseReturnList() {
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.purchaseReturns') }} />
      <DocumentListView
        kind="purchaseReturn"
        routeFor={(d) => `/(app)/purchases/returns/${d.id}`}
        emptyAction={tr('nav:title.newPurchaseReturn')}
        onEmptyAction={() => router.push('/(app)/purchases/returns/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/purchases/returns/new')} />
    </View>
  );
}
