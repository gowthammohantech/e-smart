import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function GoodsReceiptList() {
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.goodsReceipts') }} />
      <DocumentListView
        kind="goodsReceipt"
        routeFor={(d) => `/(app)/purchases/receipts/${d.id}`}
        emptyAction={tr('nav:title.newGoodsReceipt')}
        onEmptyAction={() => router.push('/(app)/purchases/receipts/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/purchases/receipts/new')} />
    </View>
  );
}
