import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { DocumentEditor } from '@/features/documents/DocumentEditor';
import { EmptyState } from '@/components/EmptyState';
import { draftFromDocument } from '@/features/documents/useDocumentDraft';
import { useDocument } from '@/store/selectors';

export default function EditPurchaseBill() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'nav']);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const document = useDocument(id);

  if (!document) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.edit') }} />
        <EmptyState illustration="not-found" icon="file-remove-outline" title={tr('common:notFound.title')} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.editNamed', { name: document.number }) }} />
      <DocumentEditor
        kind="purchaseBill"
        documentId={document.id}
        initialDraft={draftFromDocument(document)}
        onSaved={() => router.back()}
      />
    </>
  );
}
