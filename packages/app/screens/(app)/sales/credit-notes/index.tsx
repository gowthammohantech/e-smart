import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';
import { useDocuments } from '../../../../store/selectors';

export default function CreditNoteList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();
  const documents = useDocuments('creditNote');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.creditNotes') }} />
      <DocumentListView
        documents={documents}
        kind="creditNote"
        routeFor={(d) => `/(app)/sales/credit-notes/${d.id}`}
        emptyAction={tr('nav:title.newCreditNote')}
        onEmptyAction={() => router.push('/(app)/sales/credit-notes/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/sales/credit-notes/new')} />
    </View>
  );
}
