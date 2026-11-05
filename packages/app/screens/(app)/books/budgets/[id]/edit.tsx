import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { LoadingView } from '../../../../../components/LoadingView';
import { BudgetForm } from '../../../../../features/books/BudgetForm';
import { useBudget } from '../../../../../remote/budgets';

export default function EditBudget() {
  const { t: tr } = useTranslation(['books']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const budget = useBudget(id).data;
  return (
    <>
      <Stack.Screen options={{ title: tr('books:budgets.editTitle') }} />
      {budget ? <BudgetForm key={`${budget.id}:${budget.version}`} budget={budget} /> : <LoadingView />}
    </>
  );
}
