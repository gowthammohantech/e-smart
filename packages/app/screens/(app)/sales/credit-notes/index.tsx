import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function CreditNoteList() {
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.creditNotes') }} />
      <DocumentListView
        kind="creditNote"
        routeFor={(d) => `/(app)/sales/credit-notes/${d.id}`}
        emptyAction={tr('nav:title.newCreditNote')}
        onEmptyAction={() => router.push('/(app)/sales/credit-notes/new')}
      />
      <Fab icon="plus" label={tr('nav:title.newCreditNote')} onPress={() => router.push('/(app)/sales/credit-notes/new')} />
    </View>
  );
}
