import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentListView } from '@/components/DocumentListView';
import { Fab } from '@/components/Fab';
import { useDocuments } from '@/store/selectors';

export default function PurchaseBillList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();
  const documents = useDocuments('purchaseBill');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.purchaseBills') }} />
      <DocumentListView
        documents={documents}
        kind="purchaseBill"
        routeFor={(d) => `/(app)/purchases/bills/${d.id}`}
        emptyAction={tr('nav:title.newPurchaseBill')}
        onEmptyAction={() => router.push('/(app)/purchases/bills/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/purchases/bills/new')} />
    </View>
  );
}
