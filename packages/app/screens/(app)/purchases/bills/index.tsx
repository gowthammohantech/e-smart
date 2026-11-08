import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function PurchaseBillList() {
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.purchaseBills') }} />
      <DocumentListView
        kind="purchaseBill"
        routeFor={(d) => `/(app)/purchases/bills/${d.id}`}
        emptyAction={tr('nav:title.newPurchaseBill')}
        onEmptyAction={() => router.push('/(app)/purchases/bills/new')}
      />
      <Fab icon="plus" label={tr('nav:title.newPurchaseBill')} onPress={() => router.push('/(app)/purchases/bills/new')} />
    </View>
  );
}
