import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { BudgetForm } from '../../../../features/books/BudgetForm';

export default function NewBudget() {
  const { t: tr } = useTranslation(['books']);
  return (
    <>
      <Stack.Screen options={{ title: tr('books:budgets.newTitle') }} />
      <BudgetForm />
    </>
  );
}
