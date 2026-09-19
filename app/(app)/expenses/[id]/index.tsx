import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useExpense, useExpenseCategories, useParty, usePaymentAccounts, useTaxCategories } from '@/store/selectors';
import { paymentMethodLabel } from '@/i18n/labels';
import { formatMoney, formatPercent } from '@/lib/format';
import { formatDate, formatDateTime } from '@/lib/date';
import { subtract } from '@/lib/money';

export default function ExpenseDetail() {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain']);
  const router = useRouter();
  const toast = useToast();

  const { id } = useLocalSearchParams<{ id: string }>();
  const expense = useExpense(id);
  const categories = useExpenseCategories();
  const accounts = usePaymentAccounts();
  const taxCategories = useTaxCategories();
  const supplier = useParty(expense?.supplierId);
  const removeExpense = useAppStore((s) => s.removeExpense);

  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!expense) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: 'Expense' }} />
        <EmptyState illustration="not-found" icon="receipt-text-outline" title="Not found" message="This expense may have been deleted." />
      </View>
    );
  }

  const category = categories.find((c) => c.id === expense.categoryId);
  const account = accounts.find((a) => a.id === expense.accountId);
  const taxCategory = taxCategories.find((c) => c.id === expense.taxCategoryId);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: expense.number || 'Expense' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <Card style={{ alignItems: 'center', gap: t.spacing.sm, paddingVertical: t.spacing.xxl }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: `${category?.color ?? t.c.muted}22`,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons
              name={(category?.icon ?? 'cash') as keyof typeof MaterialCommunityIcons.glyphMap}
              size={27}
              color={category?.color ?? t.c.muted}
            />
          </View>
          <Text variant="h1" weight="700">
            {formatMoney(expense.amount)}
          </Text>
          <Text variant="small" tone="muted">
            {category?.name ?? 'Uncategorised'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Badge label={expense.number} tone="neutral" />
            {expense.recurrence !== 'none' ? <Badge label={expense.recurrence} tone="info" /> : null}
            {expense.billable ? <Badge label="Billable" tone="warning" /> : null}
          </View>
        </Card>

        <Card style={{ marginTop: t.spacing.md, gap: t.spacing.md }}>
          {[
            { label: 'Date', value: formatDate(expense.date) },
            { label: 'Paid by', value: paymentMethodLabel(tr, expense.method) },
            { label: 'Paid from', value: account?.name ?? '—' },
            ...(supplier ? [{ label: 'Supplier', value: supplier.name }] : []),
            ...(expense.reference ? [{ label: 'Reference', value: expense.reference }] : []),
            ...(taxCategory
              ? [
                  { label: 'Net amount', value: formatMoney(subtract(expense.amount, expense.taxAmount)) },
                  { label: `Input tax (${formatPercent(taxCategory.rate)})`, value: formatMoney(expense.taxAmount) },
                ]
              : []),
            ...(expense.nextRecurrenceDate ? [{ label: 'Next due', value: formatDate(expense.nextRecurrenceDate) }] : []),
            { label: 'Recorded', value: formatDateTime(expense.createdAt) },
          ].map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.md }}>
              <Text variant="small" tone="muted">
                {r.label}
              </Text>
              <Text variant="small" weight="600" style={{ flexShrink: 1, textAlign: 'right' }}>
                {r.value}
              </Text>
            </View>
          ))}
        </Card>

        {expense.notes ? (
          <Card style={{ marginTop: t.spacing.md, gap: 4 }}>
            <Text variant="caption" tone="muted" weight="600">
              Notes
            </Text>
            <Text variant="small" style={{ lineHeight: 20 }}>
              {expense.notes}
            </Text>
          </Card>
        ) : null}

        {expense.attachmentIds.length > 0 ? (
          <Card variant="flat" style={{ marginTop: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <MaterialCommunityIcons name="paperclip" size={19} color={t.c.primary} />
            <Text variant="small" style={{ flex: 1 }}>
              {expense.attachmentIds.length} attachment{expense.attachmentIds.length === 1 ? '' : 's'}
            </Text>
          </Card>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: t.spacing.lg,
          paddingBottom: t.spacing.xl,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
          flexDirection: 'row',
          gap: t.spacing.md,
        }}
      >
        <Button title="Edit" icon="pencil-outline" onPress={() => router.push(`/(app)/expenses/${expense.id}/edit`)} style={{ flex: 1 }} />
        <Button title="Delete" variant="danger" icon="trash-can-outline" onPress={() => setConfirmDelete(true)} style={{ flex: 1 }} />
      </View>

      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this expense?"
        message="It will be removed from your reports and tax summary. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          removeExpense(expense.id);
          setConfirmDelete(false);
          toast.show('Expense deleted', 'success');
          router.back();
        }}
      />
    </View>
  );
}
