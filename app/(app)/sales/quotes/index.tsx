import React from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentListView } from '@/components/DocumentListView';
import { Fab } from '@/components/Fab';
import { useDocuments } from '@/store/selectors';

export default function QuoteList() {
  const t = useTheme();
  const router = useRouter();
  const documents = useDocuments('quote');

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Quotations' }} />
      <DocumentListView
        documents={documents}
        kind="quote"
        routeFor={(d) => `/(app)/sales/quotes/${d.id}`}
        emptyAction="New quotation"
        onEmptyAction={() => router.push('/(app)/sales/quotes/new')}
      />
      <Fab icon="plus" onPress={() => router.push('/(app)/sales/quotes/new')} />
    </View>
  );
}
