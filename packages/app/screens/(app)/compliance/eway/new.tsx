import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { EwayBillForm } from '../../../../features/compliance/EwayBillForm';
import { useDocument } from '../../../../store/selectors';
import { useDocumentRecord } from '../../../../remote/queries';
import { LoadingView } from '../../../../components/LoadingView';

export default function NewEwayBill() {
  const { t: tr } = useTranslation(['compliance', 'nav']);
  const { documentId } = useLocalSearchParams<{ documentId?: string }>();
  const document = useDocument(documentId);
  const remote = useDocumentRecord(documentId);
  if (!document && remote.isLoading) return <LoadingView variant="form" />;

  return (
    <View style={{ flex: 1 }}>
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
