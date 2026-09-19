import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentListView } from '@/components/DocumentListView';
import { Fab } from '@/components/Fab';
import { useDocuments } from '@/store/selectors';

export default function PurchaseOrderList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();
  const documents = useDocuments('purchaseOrder');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.purchaseOrders') }} />
      <DocumentListView
        documents={documents}
        kind="purchaseOrder"
        routeFor={(d) => `/(app)/purchases/orders/${d.id}`}
        emptyAction="New purchase order"
        onEmptyAction={() => router.push('/(app)/purchases/orders/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/purchases/orders/new')} />
    </View>
  );
}
