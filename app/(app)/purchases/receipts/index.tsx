import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentListView } from '@/components/DocumentListView';
import { Fab } from '@/components/Fab';
import { useDocuments } from '@/store/selectors';

export default function GoodsReceiptList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();
  const documents = useDocuments('goodsReceipt');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.goodsReceipts') }} />
      <DocumentListView
        documents={documents}
        kind="goodsReceipt"
        routeFor={(d) => `/(app)/purchases/receipts/${d.id}`}
        emptyAction="New goods receipt"
        onEmptyAction={() => router.push('/(app)/purchases/receipts/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/purchases/receipts/new')} />
    </View>
  );
}
