import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../../../store/appStore';
import { Stack } from 'expo-router';
import { BudgetForm } from '../../../../features/books/BudgetForm';

export default function NewBudget() {
  const { t: tr } = useTranslation(['books']);
  // The lines name this business's accounts; a switch (the page stays on web) starts afresh.
  const companyId = useAppStore((st) => st.activeCompanyId);
  return (
    <>
      <Stack.Screen options={{ title: tr('books:budgets.newTitle') }} />
      <BudgetForm key={companyId} />
    </>
  );
}
