import React from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentListView } from '@/components/DocumentListView';
import { Fab } from '@/components/Fab';
import { useDocuments } from '@/store/selectors';

export default function DeliveryList() {
  const t = useTheme();
  const router = useRouter();
  const documents = useDocuments('delivery');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Delivery notes' }} />
      <DocumentListView
        documents={documents}
        kind="delivery"
        routeFor={(d) => `/(app)/sales/deliveries/${d.id}`}
        emptyAction="New delivery note"
        onEmptyAction={() => router.push('/(app)/sales/deliveries/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/sales/deliveries/new')} />
    </View>
  );
}
