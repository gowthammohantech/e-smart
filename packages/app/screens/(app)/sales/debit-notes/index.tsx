import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function DebitNoteList() {
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.debitNotes') }} />
      <DocumentListView
        kind="debitNote"
        routeFor={(d) => `/(app)/sales/debit-notes/${d.id}`}
        emptyAction={tr('nav:title.newDebitNote')}
        onEmptyAction={() => router.push('/(app)/sales/debit-notes/new')}
      />
      <Fab icon="plus" label={tr('nav:title.newDebitNote')} onPress={() => router.push('/(app)/sales/debit-notes/new')} />
    </View>
  );
}
