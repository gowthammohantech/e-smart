import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentDetail } from '@/features/documents/DocumentDetail';
import { EmptyState } from '@/components/EmptyState';
import { useDocument } from '@/store/selectors';

export default function InvoiceDetail() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const document = useDocument(id);

  if (!document) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.invoice') }} />
        <EmptyState illustration="not-found" icon="file-remove-outline" title="Not found" message="This document may have been deleted." />
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
