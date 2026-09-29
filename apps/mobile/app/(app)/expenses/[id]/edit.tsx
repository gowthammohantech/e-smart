import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { ExpenseForm } from '@/features/expenses/ExpenseForm';
import { EmptyState } from '@/components/EmptyState';
import { useExpense } from '@/store/selectors';

export default function EditExpense() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'nav']);
  const { id } = useLocalSearchParams<{ id: string }>();
  const expense = useExpense(id);

  if (!expense) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.editExpense') }} />
        <EmptyState illustration="not-found" icon="receipt-text-outline" title={tr('common:notFound.title')} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.editNamed', { name: expense.number }) }} />
      <ExpenseForm expense={expense} />
    </>
  );
}
