import React from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentEditor } from '@/features/documents/DocumentEditor';
import { EmptyState } from '@/components/EmptyState';
import { draftFromDocument } from '@/features/documents/useDocumentDraft';
import { useDocument } from '@/store/selectors';

export default function EditPurchaseOrder() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const document = useDocument(id);

  if (!document) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: 'Edit' }} />
        <EmptyState illustration="not-found" icon="file-remove-outline" title="Not found" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `Edit ${document.number}` }} />
      <DocumentEditor
        kind="purchaseOrder"
        documentId={document.id}
        initialDraft={draftFromDocument(document)}
        onSaved={() => router.back()}
      />
    </>
  );
}
