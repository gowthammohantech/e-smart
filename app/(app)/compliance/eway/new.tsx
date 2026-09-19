import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { EmptyState } from '@/components/EmptyState';
import { EwayBillForm } from '@/features/compliance/EwayBillForm';
import { useDocument } from '@/store/selectors';

export default function NewEwayBill() {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance', 'nav']);
  const { documentId } = useLocalSearchParams<{ documentId?: string }>();
  const document = useDocument(documentId);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.newEWayBill') }} />
      {document ? (
        <EwayBillForm document={document} />
      ) : (
        <EmptyState
          illustration="not-found"
          title={tr('compliance:notFound.docTitle')}
          message={tr('compliance:notFound.docBody')}
        />
      )}
    </View>
  );
}
