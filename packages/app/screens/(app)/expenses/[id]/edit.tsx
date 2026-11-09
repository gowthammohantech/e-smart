import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ExpenseForm } from '../../../../features/expenses/ExpenseForm';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useExpense } from '../../../../store/selectors';
import { useExpenseRecord } from '../../../../remote/queries';
import { useAppStore } from '../../../../store/appStore';
import { LoadingView } from '../../../../components/LoadingView';

export default function EditExpense() {
  const { t: tr } = useTranslation(['common', 'nav']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const expense = useExpense(id);
  // Fetched on opening, so it shows even when the book on the device doesn't hold it.
  const remote = useExpenseRecord(id);
  const companyId = useAppStore((s) => s.activeCompanyId);

  // isPending, not isLoading: a query not yet started isn't "not found".
  if (!expense && !!id && remote.isPending) return <LoadingView variant="form" />;
  if (!expense) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: tr('nav:title.editExpense') }} />
        <EmptyState illustration="not-found" icon="receipt-text-outline" title={tr('common:notFound.title')} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.editNamed', { name: expense.number }) }} />
      <ExpenseForm key={companyId} expense={expense} />
    </>
  );
}
