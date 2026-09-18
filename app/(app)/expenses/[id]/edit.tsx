import React from 'react';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { ExpenseForm } from '@/features/expenses/ExpenseForm';
import { EmptyState } from '@/components/EmptyState';
import { useExpense } from '@/store/selectors';

export default function EditExpense() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const expense = useExpense(id);

  if (!expense) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: 'Edit expense' }} />
        <EmptyState illustration="not-found" icon="receipt-text-outline" title="Not found" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `Edit ${expense.number}` }} />
      <ExpenseForm expense={expense} />
    </>
  );
}
