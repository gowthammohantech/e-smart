import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentDetail } from '@/features/documents/DocumentDetail';
import { EmptyState } from '@/components/EmptyState';
import { useDocument } from '@/store/selectors';

export default function SalesReturnDetail() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'nav']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const document = useDocument(id);

  if (!document) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.salesReturn') }} />
        <EmptyState illustration="not-found" icon="file-remove-outline" title={tr('common:notFound.title')} message={tr('common:notFound.document')} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: document.number }} />
      <DocumentDetail document={document} />
    </>
  );
}
