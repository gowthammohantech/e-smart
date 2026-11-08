import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function InvoiceList() {
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.invoices') }} />
      <DocumentListView
        kind="invoice"
        routeFor={(d) => `/(app)/sales/invoices/${d.id}`}
        emptyAction={tr('nav:title.newInvoice')}
        onEmptyAction={() => router.push('/(app)/sales/invoices/new')}
      />
      <Fab icon="plus" label={tr('nav:title.newInvoice')} onPress={() => router.push('/(app)/sales/invoices/new')} />
    </View>
  );
}
