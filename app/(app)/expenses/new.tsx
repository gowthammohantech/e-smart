import React from 'react';
import { Stack } from 'expo-router';
import { ExpenseForm } from '@/features/expenses/ExpenseForm';

export default function NewExpense() {
  return (
    <>
      <Stack.Screen options={{ title: 'Add expense' }} />
      <ExpenseForm />
    </>
  );
}
