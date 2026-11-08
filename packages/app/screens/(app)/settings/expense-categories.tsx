import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Sheet } from '@esmart/ui/components/Sheet';
import { TextField } from '@esmart/ui/components/Field';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { Text } from '@esmart/ui/components/Text';
import { ExpenseCategory } from '@esmart/core/types';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useBaseCurrency, useExpenseCategories } from '../../../store/selectors';
import { useCompanyUsage } from '../../../remote/queries';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { SheetActions } from '../../../features/company/SheetActions';
import { useServerSave } from '../../../components/useServerSave';

export default function ExpenseCategorySettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['nav', 'settings', 'errors']);
  const { run: serverSave, saving } = useServerSave();

  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const categories = useExpenseCategories();
  const usage = useCompanyUsage().data;
  const saveExpenseCategory = useAppStore((s) => s.saveExpenseCategory);
  const removeExpenseCategory = useAppStore((s) => s.removeExpenseCategory);

  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ExpenseCategory | null>(null);
  const [name, setName] = useState('');
  // An empty name says so on the field, not by a Save that does nothing.
  const [nameError, setNameError] = useState<string | undefined>();

  const totals = useMemo(
    () => Object.fromEntries(Object.entries(usage?.expenseCategories ?? {}).map(([id, v]) => [id, { total: v.total.minor, count: v.count }])) as Record<string, { total: number; count: number }>,
    [usage],
  );

  const open = (c?: ExpenseCategory) => {
    setEditing(c ?? ({ id: '', companyId: company.id, name: '', icon: 'shape-outline', color: '#8E98AC' } as ExpenseCategory));
    setName(c?.name ?? '');
    setNameError(undefined);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.expenseCategories') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card padded={false}>
          {categories.map((c, i) => {
            const stat = totals[c.id];
            return (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={stat ? tr('settings:categories.entries', { count: stat.count }) : tr('settings:categories.unused')}
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

      <PrimaryActionBar title={tr('settings:categories.add')} icon="plus" onPress={() => open()} />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? tr('settings:categories.editTitle') : tr('settings:categories.add')}
        footer={
          <SheetActions
            saveLabel={tr('settings:categories.save')}
            onSave={async () => {
                if (!editing) return;
    if (!name.trim()) {
      setNameError(tr('errors:validation.required', { field: tr('settings:categories.name') }));
      return;
    }
                const category = { ...editing, id: editing.id || uid('cat'), companyId: company.id, name: name.trim() };
                // The sheet stays open until the server has it, so a refusal can be fixed here.
                const res = await serverSave(() => saveExpenseCategory(category), tr('settings:categories.saved'), { icon: 'shape-outline' });
                if (res) setEditing(null);
              }}
            saving={saving}
                        deleteLabel={tr('settings:categories.delete')}
            onDelete={
              editing?.id
                ? () => {
                  const c = editing;
                  setEditing(null);
                  setConfirmDelete(c);
                }
                : undefined
            }
          />
        }
      >
        <View style={{ padding: t.spacing.lg }}>
          <TextField label={tr('settings:categories.name')} value={name} onChangeText={(v) => {
            setName(v);
            setNameError(undefined);
          }}
          error={nameError} placeholder={tr('settings:categories.namePlaceholder')} icon="shape-outline" required />
        </View>
      </Sheet>

      <ConfirmDialog
        visible={!!confirmDelete}
        title={tr('settings:categories.deleteTitle', { name: confirmDelete?.name })}
        message={tr('settings:categories.deleteMessage')}
        confirmLabel={tr('settings:categories.delete')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const c = confirmDelete;
          setConfirmDelete(null);
          if (c) void serverSave(() => removeExpenseCategory(c.id), tr('settings:categories.deleted'), { icon: 'shape-outline' });
        }}
      />
    </View>
  );
}
