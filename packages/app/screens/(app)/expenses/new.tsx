import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ExpenseForm, ExpenseInitial } from '../../../features/expenses/ExpenseForm';
import { useOcrStore } from '../../../features/ocr/ocrStore';
import { isoOrUndefined, matchParty } from '../../../features/ocr/matchParty';
import { useExpenseCategories, useParties } from '../../../store/selectors';

export default function NewExpense() {
  const { t: tr } = useTranslation(['nav']);
  // Set by "Create expense" on a scanned receipt.
  const { fromScan } = useLocalSearchParams<{ fromScan?: string }>();
  const scan = useOcrStore((s) => s.result);
  const suppliers = useParties('supplier');
  const categories = useExpenseCategories();

  let initial: ExpenseInitial | undefined;
  if (fromScan && scan?.kind === 'expense') {
    const field = (key: string) => scan.fields.find((f) => f.key === key)?.value || undefined;
    const vendor = field('vendor');
    const category = field('category')?.toLowerCase();
    initial = {
      // The review screen lets these be retyped, so keep only well-formed values.
      amount: field('amount')?.replace(/[^0-9.]/g, '') || undefined,
      date: isoOrUndefined(field('date')),
      reference: field('reference'),
      notes: vendor,
      supplierId: matchParty(suppliers, { gstin: field('gstin'), name: vendor }),
      categoryId: category ? categories.find((c) => c.name.toLowerCase() === category)?.id : undefined,
      receiptUri: scan.imageUri,
    };
  }

  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.addExpense') }} />
      <ExpenseForm initial={initial} />
    </>
  );
}
