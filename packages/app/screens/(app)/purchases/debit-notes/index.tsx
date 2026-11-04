import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';
import { useDocuments } from '../../../../store/selectors';

export default function SupplierDebitNoteList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();
  const documents = useDocuments('supplierDebitNote');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.supplierDebitNotes') }} />
      <DocumentListView
        documents={documents}
        kind="supplierDebitNote"
        routeFor={(d) => `/(app)/purchases/debit-notes/${d.id}`}
        emptyAction={tr('nav:title.newSupplierDebitNote')}
        onEmptyAction={() => router.push('/(app)/purchases/debit-notes/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/purchases/debit-notes/new')} />
    </View>
  );
}
