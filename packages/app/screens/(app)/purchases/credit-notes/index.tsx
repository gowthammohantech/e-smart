import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function SupplierCreditNoteList() {
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.supplierCreditNotes') }} />
      <DocumentListView
        kind="supplierCreditNote"
        routeFor={(d) => `/(app)/purchases/credit-notes/${d.id}`}
        emptyAction={tr('nav:title.newSupplierCreditNote')}
        onEmptyAction={() => router.push('/(app)/purchases/credit-notes/new')}
      />
      <Fab icon="plus" label={tr('nav:title.newSupplierCreditNote')} onPress={() => router.push('/(app)/purchases/credit-notes/new')} />
    </View>
  );
}
