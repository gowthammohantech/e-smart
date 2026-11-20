import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { EwayBillForm } from '../../../../features/compliance/EwayBillForm';
import { useDocument } from '../../../../store/selectors';
import { useDocumentRecord } from '../../../../remote/queries';
import { useComplianceSettings } from '../../../../store/selectors';
import { LoadingView } from '../../../../components/LoadingView';

export default function NewEwayBill() {
  const { t: tr } = useTranslation(['compliance', 'nav']);
  const { documentId } = useLocalSearchParams<{ documentId?: string }>();
  const document = useDocument(documentId);
  const remote = useDocumentRecord(documentId);
  const router = useRouter();
  const settings = useComplianceSettings();
  // The form fills from the document's party, so it waits for the fresh copy (which brings the party):
  // filled from a half-loaded one it would raise the bill to a blank consignee.
  if (remote.isLoading) return <LoadingView variant="form" title={tr('nav:title.newEWayBill')} />;

  // Opened some way other than the buttons that check the e-way bill login: the same answer, before the form.
  if (!settings.ewbUsername) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: tr('nav:title.newEWayBill') }} />
        <EmptyState
          illustration="not-found"
          title={tr('compliance:ewb.loginMissingTitle')}
          message={tr('compliance:ewb.loginMissingBody')}
          actionLabel={tr('compliance:ewb.loginMissingConfirm')}
          onAction={() => router.replace({ pathname: '/(app)/settings/e-invoicing', params: { portal: 'ewaybill' } } as never)}
        />
      </View>
    );
  }

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
