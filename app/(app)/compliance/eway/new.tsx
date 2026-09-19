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
  const { t: tr } = useTranslation(['nav']);
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
          title="Document not found"
          message="The document this bill was to be raised against is no longer here."
        />
      )}
    </View>
  );
}
