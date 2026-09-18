import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/Field';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { Text } from '@/components/Text';
import { ExpenseCategory } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useBaseCurrency, useExpenseCategories, useExpenses } from '@/store/selectors';
import { formatMoney } from '@/lib/format';
import { money } from '@/lib/money';
import { uid } from '@/lib/id';

export default function ExpenseCategorySettings() {
  const t = useTheme();
  const toast = useToast();

  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const categories = useExpenseCategories();
  const expenses = useExpenses();
  const saveExpenseCategory = useAppStore((s) => s.saveExpenseCategory);
  const removeExpenseCategory = useAppStore((s) => s.removeExpenseCategory);

  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ExpenseCategory | null>(null);
  const [name, setName] = useState('');

  const totals = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    expenses.forEach((e) => {
      const cur = map[e.categoryId] ?? { total: 0, count: 0 };
      map[e.categoryId] = { total: cur.total + Math.round(e.amount.minor * (e.exchangeRate || 1)), count: cur.count + 1 };
    });
    return map;
  }, [expenses]);

  const open = (c?: ExpenseCategory) => {
    setEditing(c ?? ({ id: '', companyId: company.id, name: '', icon: 'shape-outline', color: '#8E98AC' } as ExpenseCategory));
    setName(c?.name ?? '');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Expense categories' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Card padded={false}>
          {categories.map((c, i) => {
            const stat = totals[c.id];
            return (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={stat ? `${stat.count} entries` : 'Not used yet'}
                icon={c.icon as never}
                iconColor={c.color}
                divider={i < categories.length - 1}
                right={
                  stat ? (
                    <Text variant="small" weight="600">
                      {formatMoney(money(stat.total, baseCurrency))}
                    </Text>
                  ) : undefined
                }
                onPress={() => open(c)}
                chevron
              />
            );
          })}
        </Card>
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
        }}
      >
        <Button title="Add category" icon="plus" onPress={() => open()} fullWidth size="lg" />
      </View>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit category' : 'Add category'}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            {editing?.id ? (
              <Button
                title="Delete"
                variant="danger"
                style={{ flex: 1 }}
                onPress={() => {
                  const c = editing;
                  setEditing(null);
                  setConfirmDelete(c);
                }}
              />
            ) : null}
            <Button
              title="Save"
              onPress={() => {
                if (!editing || !name.trim()) return;
                saveExpenseCategory({ ...editing, id: editing.id || uid('cat'), companyId: company.id, name: name.trim() });
                toast.show('Category saved', 'success');
                setEditing(null);
              }}
              disabled={!name.trim()}
              style={{ flex: 2 }}
            />
          </View>
        }
      >
        <View style={{ padding: t.spacing.lg }}>
          <TextField label="Category name" value={name} onChangeText={setName} placeholder="e.g. Fuel" icon="shape-outline" required />
        </View>
      </Sheet>

      <ConfirmDialog
        visible={!!confirmDelete}
        title={`Delete ${confirmDelete?.name}?`}
        message="Expenses already in this category keep their reference but will show as uncategorised."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeExpenseCategory(confirmDelete.id);
          setConfirmDelete(null);
          toast.show('Category deleted', 'success');
        }}
      />
    </View>
  );
}
