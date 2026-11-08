import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { DocumentDetail } from '../../../../../features/documents/DocumentDetail';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useDocument } from '../../../../../store/selectors';
import { useDocumentRecord } from '../../../../../remote/queries';
import { LoadingView } from '../../../../../components/LoadingView';

export default function SalesOrderDetail() {
  const { t: tr } = useTranslation(['common', 'nav']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const document = useDocument(id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = useDocumentRecord(id);

  if (!document && remote.isLoading) return <LoadingView />;
  if (!document) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: tr('nav:title.salesOrder') }} />
        <EmptyState illustration="not-found" icon="file-remove-outline" title={tr('common:notFound.title')} message={tr('common:notFound.document')} />
      </View>
    );
  }

  return (
    <>
      {/* A draft's placeholder number (INVOICE-DRAFT) reads as "Draft". */}
      <Stack.Screen options={{ title: document.status === 'draft' && document.number.endsWith('-DRAFT') ? tr('common:documentList.draftNumber') : document.number }} />
      <DocumentDetail document={document} />
    </>
  );
}
