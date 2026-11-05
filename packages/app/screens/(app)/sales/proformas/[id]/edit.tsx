import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { DocumentEditor } from '../../../../../features/documents/DocumentEditor';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { draftFromDocument } from '../../../../../features/documents/useDocumentDraft';
import { useDocument } from '../../../../../store/selectors';
import { useDocumentRecord } from '../../../../../remote/queries';
import { LoadingView } from '../../../../../components/LoadingView';
import { useGoBack } from '../../../../../navigation/useGoBack';

export default function EditProforma() {
  const { t: tr } = useTranslation(['common', 'nav']);
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const document = useDocument(id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = useDocumentRecord(id);

  if (!document && remote.isLoading) return <LoadingView />;
  if (!document) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: tr('nav:title.edit') }} />
        <EmptyState illustration="not-found" icon="file-remove-outline" title={tr('common:notFound.title')} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.editNamed', { name: document.number }) }} />
      <DocumentEditor
        kind="proforma"
        documentId={document.id}
        initialDraft={draftFromDocument(document)}
        onSaved={() => goBack(`/(app)/sales/proformas/${document.id}`)}
      />
    </>
  );
}
