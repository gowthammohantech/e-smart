import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function SupplierDebitNoteList() {
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.supplierDebitNotes') }} />
      <DocumentListView
        kind="supplierDebitNote"
        routeFor={(d) => `/(app)/purchases/debit-notes/${d.id}`}
        emptyAction={tr('nav:title.newSupplierDebitNote')}
        onEmptyAction={() => router.push('/(app)/purchases/debit-notes/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/purchases/debit-notes/new')} />
    </View>
  );
}
