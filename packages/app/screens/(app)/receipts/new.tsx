import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter } from 'expo-router';
import { ReceiptForm } from '../../../features/receipts/ReceiptForm';
import { LoadingView } from '../../../components/LoadingView';
import { useServerBook } from '../../../remote/queries';
import { useAppStore } from '../../../store/appStore';

export default function NewReceipt() {
  const { t: tr } = useTranslation(['books']);
  const router = useRouter();
  const companyId = useAppStore((s) => s.activeCompanyId);
  // The pickers name accounts from the chart: until it's in they'd read "Pick account".
  const { loaded } = useServerBook();
  if (!loaded) return <LoadingView variant="form" title={tr('books:receipts.new')} />;
  return (
    <>
      <Stack.Screen options={{ title: tr('books:receipts.new') }} />
      {/* Keyed by business: on web the page stays open across a switch, and the form holds accounts from the last one. */}
      <ReceiptForm key={companyId} onSaved={(id) => router.replace(`/(app)/receipts/${id}` as never)} />
    </>
  );
}
