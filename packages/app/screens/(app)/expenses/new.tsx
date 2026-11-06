import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ExpenseForm, ExpenseInitial } from '../../../features/expenses/ExpenseForm';
import { useOcrStore } from '../../../features/ocr/ocrStore';
import { isoOrUndefined } from '../../../features/ocr/matchParty';
import { useScannedParty } from '../../../features/ocr/useScannedParty';
import { useExpenseCategories } from '../../../store/selectors';
import { LoadingView } from '../../../components/LoadingView';

export default function NewExpense() {
  const { t: tr } = useTranslation(['nav']);
  // Set by "Create expense" on a scanned receipt.
  const { fromScan } = useLocalSearchParams<{ fromScan?: string }>();
  const scan = useOcrStore((s) => s.result);
  const categories = useExpenseCategories();
  const fromReceipt = !!fromScan && scan?.kind === 'expense';
  const scanField = (key: string) => scan?.fields.find((f) => f.key === key)?.value || undefined;
  // The supplier is looked up on the server before the form opens with it.
  const supplier = useScannedParty('supplier', { gstin: scanField('gstin'), name: scanField('vendor') }, fromReceipt);

  let initial: ExpenseInitial | undefined;
  if (fromReceipt && scan) {
    const field = (key: string) => scan.fields.find((f) => f.key === key)?.value || undefined;
    const vendor = field('vendor');
    const category = field('category')?.toLowerCase();
    initial = {
      // The review screen lets these be retyped, so keep only well-formed values.
      amount: field('amount')?.replace(/[^0-9.]/g, '') || undefined,
      date: isoOrUndefined(field('date')),
      reference: field('reference'),
      notes: vendor,
      supplierId: supplier.id,
      categoryId: category ? categories.find((c) => c.name.toLowerCase() === category)?.id : undefined,
      receiptUri: scan.imageUri,
      receiptAttachmentId: scan.attachmentId,
    };
  }

  if (supplier.loading) return <LoadingView />;
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.addExpense') }} />
      <ExpenseForm initial={initial} />
    </>
  );
}
