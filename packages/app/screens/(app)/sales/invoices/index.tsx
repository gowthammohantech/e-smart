import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function InvoiceList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.invoices') }} />
      <DocumentListView
        kind="invoice"
        routeFor={(d) => `/(app)/sales/invoices/${d.id}`}
        emptyAction={tr('nav:title.newInvoice')}
        onEmptyAction={() => router.push('/(app)/sales/invoices/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/sales/invoices/new')} />
    </View>
  );
}
