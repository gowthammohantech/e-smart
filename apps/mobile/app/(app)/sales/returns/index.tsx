import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentListView } from '@/components/DocumentListView';
import { Fab } from '@/components/Fab';
import { useDocuments } from '@/store/selectors';

export default function SalesReturnList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const router = useRouter();
  const documents = useDocuments('salesReturn');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.salesReturns') }} />
      <DocumentListView
        documents={documents}
        kind="salesReturn"
        routeFor={(d) => `/(app)/sales/returns/${d.id}`}
        emptyAction={tr('nav:title.newSalesReturn')}
        onEmptyAction={() => router.push('/(app)/sales/returns/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/sales/returns/new')} />
    </View>
  );
}
