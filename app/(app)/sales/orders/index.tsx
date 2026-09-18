import React from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentListView } from '@/components/DocumentListView';
import { Fab } from '@/components/Fab';
import { useDocuments } from '@/store/selectors';

export default function SalesOrderList() {
  const t = useTheme();
  const router = useRouter();
  const documents = useDocuments('salesOrder');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Sales orders' }} />
      <DocumentListView
        documents={documents}
        kind="salesOrder"
        routeFor={(d) => `/(app)/sales/orders/${d.id}`}
        emptyAction="New sales order"
        onEmptyAction={() => router.push('/(app)/sales/orders/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/sales/orders/new')} />
    </View>
  );
}
