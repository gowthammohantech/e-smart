import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { DocumentListView } from '../../../../components/DocumentListView';
import { Fab } from '@esmart/ui/components/Fab';

export default function QuoteList() {
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.quotations') }} />
      <DocumentListView
        kind="quote"
        routeFor={(d) => `/(app)/sales/quotes/${d.id}`}
        emptyAction={tr('nav:title.newQuotation')}
        onEmptyAction={() => router.push('/(app)/sales/quotes/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/sales/quotes/new')} />
    </View>
  );
}
