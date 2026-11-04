import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Sheet } from '@esmart/ui/components/Sheet';
import { PickerField, SwitchField, TextField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { uid } from '@esmart/core/lib/id';
import { nowISO } from '@esmart/core/lib/date';
import type { CostCentre } from '@esmart/core/types';
import { useServerSave } from '../../../../components/useServerSave';
import { useAppStore } from '../../../../store/appStore';
import { useCostCentres } from '../../../../store/books';
import { useActiveCompany } from '../../../../store/selectors';

/** Projects, departments and the like: documents, expenses and voucher lines can carry one. */
export default function CostCentres() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t: tr } = useTranslation(['books', 'common']);
  const { run: serverSave, saving, blocked } = useServerSave();
  const company = useActiveCompany();
  const centres = useCostCentres(true);
  const saveCostCentre = useAppStore((s) => s.saveCostCentre);

  const [editing, setEditing] = useState<CostCentre | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [parentId, setParentId] = useState<string | undefined>();
  const [active, setActive] = useState(true);
  const [parentOpen, setParentOpen] = useState(false);

  const nameOf = (id?: string) => centres.find((c) => c.id === id)?.name;
  // A centre can't go under itself or anything under it.
  const under = (id: string, root: string): boolean => {
    for (let at: string | undefined = id, hops = 0; at && hops <= centres.length; at = centres.find((c) => c.id === at)?.parentId, hops++) if (at === root) return true;
    return false;
  };

  const open = (c?: CostCentre) => {
    setEditing(c ?? ({ id: '', companyId: company.id, name: '', status: 'active', createdAt: nowISO() } as CostCentre));
    setName(c?.name ?? '');
    setCategory(c?.category ?? '');
    setParentId(c?.parentId);
    setActive(c?.status !== 'inactive');
  };

  const save = async () => {
    if (!editing || !name.trim()) return;
    const record: CostCentre = { ...editing, id: editing.id || uid('ccn'), name: name.trim(), category: category.trim() || undefined, parentId, status: active ? 'active' : 'inactive' };
    const res = await serverSave(() => saveCostCentre(record), tr('books:costCentres.saved'), { icon: 'sitemap-outline' });
    if (res) setEditing(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:hub.costCentres') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom, gap: t.spacing.md }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        {centres.length ? (
          <>
            <Card padded={false}>
              <ListRow title={tr('books:hub.costCentreProfit')} subtitle={tr('books:hub.costCentreProfitHint')} icon="chart-bar" chevron onPress={() => router.push('/(app)/books/cost-centres/profit' as never)} />
            </Card>
            <Card padded={false}>
              {centres.map((c, i) => (
                <ListRow
                  key={c.id}
                  title={c.name}
                  subtitle={[c.category, c.parentId ? tr('books:costCentres.under', { name: nameOf(c.parentId) }) : undefined, c.status === 'inactive' ? tr('books:accounts.inactive') : undefined].filter(Boolean).join(' · ') || undefined}
                  onPress={() => open(c)}
                  chevron
                  divider={i < centres.length - 1}
                />
              ))}
            </Card>
          </>
        ) : (
          <EmptyState icon="sitemap-outline" title={tr('books:costCentres.empty')} message={tr('books:costCentres.emptyBody')} />
        )}
      </ScrollView>

      <PrimaryActionBar title={tr('books:costCentres.add')} icon="plus" onPress={() => open()} />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? tr('books:costCentres.edit') : tr('books:costCentres.add')}
        footer={<Button title={tr('books:accounts.save')} onPress={() => void save()} loading={saving} disabled={blocked || !name.trim()} />}
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <TextField label={tr('books:costCentres.name')} value={name} onChangeText={setName} placeholder={tr('books:costCentres.namePlaceholder')} required />
          <TextField label={tr('books:costCentres.category')} value={category} onChangeText={setCategory} placeholder={tr('books:costCentres.categoryPlaceholder')} />
          <PickerField label={tr('books:costCentres.parent')} value={nameOf(parentId) ?? tr('books:costCentres.noParent')} onPress={() => setParentOpen(true)} icon="file-tree-outline" />
          <SwitchField label={tr('books:costCentres.active')} value={active} onValueChange={setActive} />
        </View>
      </Sheet>
      <SelectSheet
        visible={parentOpen}
        onClose={() => setParentOpen(false)}
        title={tr('books:costCentres.parent')}
        options={[{ value: '', label: tr('books:costCentres.noParent') }, ...centres.filter((c) => !editing?.id || !under(c.id, editing.id)).map((c) => ({ value: c.id, label: c.name }))]}
        value={parentId ?? ''}
        onSelect={(v) => setParentId(v || undefined)}
      />
    </View>
  );
}
