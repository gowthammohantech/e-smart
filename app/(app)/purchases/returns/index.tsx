import React from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentListView } from '@/components/DocumentListView';
import { Fab } from '@/components/Fab';
import { useDocuments } from '@/store/selectors';

export default function PurchaseReturnList() {
  const t = useTheme();
  const router = useRouter();
  const documents = useDocuments('purchaseReturn');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Purchase returns' }} />
      <DocumentListView
        documents={documents}
        kind="purchaseReturn"
        routeFor={(d) => `/(app)/purchases/returns/${d.id}`}
        emptyAction="New purchase return"
        onEmptyAction={() => router.push('/(app)/purchases/returns/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/purchases/returns/new')} />
    </View>
  );
}
