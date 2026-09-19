import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { ExpenseForm } from '@/features/expenses/ExpenseForm';

export default function NewExpense() {
  const { t: tr } = useTranslation(['nav']);
  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.addExpense') }} />
      <ExpenseForm />
    </>
  );
}
