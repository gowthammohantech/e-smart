import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentListView } from '@/components/DocumentListView';
import { Fab } from '@/components/Fab';
import { useDocuments } from '@/store/selectors';

export default function InvoiceList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();
  const documents = useDocuments('invoice');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.invoices') }} />
      <DocumentListView
        documents={documents}
        kind="invoice"
        routeFor={(d) => `/(app)/sales/invoices/${d.id}`}
        emptyAction="New invoice"
        onEmptyAction={() => router.push('/(app)/sales/invoices/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/sales/invoices/new')} />
    </View>
  );
}
