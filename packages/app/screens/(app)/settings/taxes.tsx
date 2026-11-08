import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Sheet } from '@esmart/ui/components/Sheet';
import { TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { TaxCategory } from '@esmart/core/types';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useTaxCategories } from '../../../store/selectors';
import { useCompanyUsage } from '../../../remote/queries';
import { formatPercent } from '@esmart/core/lib/format';
import { formatDate, today } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { SheetActions } from '../../../features/company/SheetActions';
import { useServerSave } from '../../../components/useServerSave';
import { validTaxRate } from '@esmart/core/lib/validators';

export default function TaxSettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['nav', 'settings', 'errors']);
  const { run: serverSave, saving } = useServerSave();

  const company = useActiveCompany();
  const categories = useTaxCategories();
  const usage = useCompanyUsage().data;
  const saveTaxCategory = useAppStore((s) => s.saveTaxCategory);
  const removeTaxCategory = useAppStore((s) => s.removeTaxCategory);

  const [editing, setEditing] = useState<TaxCategory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TaxCategory | null>(null);
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [description, setDescription] = useState('');
  const [rateError, setRateError] = useState<string | undefined>();
  // An empty name says so on the field, not by a Save that does nothing.
  const [nameError, setNameError] = useState<string | undefined>();

  const regime = company?.taxRegistration?.regime ?? 'NONE';

  const open = (c?: TaxCategory) => {
    setEditing(c ?? ({ id: '', companyId: company.id, name: '', rate: 0, type: regime === 'VAT' ? 'VAT' : 'GST', effectiveFrom: today() } as TaxCategory));
    setName(c?.name ?? '');
    setRate(c ? String(c.rate) : '');
    setEffectiveFrom(c?.effectiveFrom ?? today());
    setDescription(c?.description ?? '');
    setRateError(undefined);
    setNameError(undefined);
  };

  const usageOf = (id: string) => usage?.taxCategoryUse[id] ?? 0;

  const save = async () => {
    if (!editing) return;
    if (!name.trim()) {
      setNameError(tr('errors:validation.required', { field: tr('settings:taxes.name') }));
      return;
    }
    const error = validTaxRate(rate, editing.type);
    setRateError(error);
    if (error) return;
    const category = {
      ...editing,
      id: editing.id || uid('tax'),
      companyId: company.id,
      name: name.trim(),
      rate: Number(rate),
      effectiveFrom,
      description: description.trim() || undefined,
    };
    // The sheet stays open until the server has it, so a refusal can be fixed here.
    const res = await serverSave(
      () => saveTaxCategory(category),
      editing.id ? tr('settings:taxes.updated') : tr('settings:taxes.added'),
      { icon: 'percent-outline' },
    );
    if (res) setEditing(null);
  };

  // Ctrl+S (⌘+S) does what Save does, while the form is open.
  useSaveShortcut(save, !!editing);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.taxes') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 140 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg, gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <Badge label={regime} tone="info" />
            <Text variant="small" weight="600">
              {company?.taxRegistration?.identifier ?? tr('settings:taxes.notRegistered')}
            </Text>
          </View>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {regime === 'GST'
              ? tr('settings:taxes.introGst')
              : tr('settings:taxes.intro')}
          </Text>
        </Card>

        <Card padded={false}>
          {categories.length === 0 ? (
            <EmptyState icon="percent-outline" title={tr('settings:taxes.none')} compact />
          ) : (
            categories.map((c, i) => (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={c.description}
                meta={tr('settings:taxes.rowMeta', { date: formatDate(c.effectiveFrom), count: usageOf(c.id) })}
                icon="percent-outline"
                divider={i < categories.length - 1}
                right={<Badge label={formatPercent(c.rate)} tone={c.rate === 0 ? 'neutral' : 'info'} />}
                onPress={() => open(c)}
                chevron
              />
            ))
          )}
        </Card>

        {regime === 'GST' ? (
          <Card style={{ marginTop: t.spacing.lg, gap: t.spacing.md }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('settings:taxes.howApplied')}</Text>
            {[
              { label: tr('settings:taxes.applied.intraState'), value: tr('settings:taxes.applied.intraStateValue') },
              { label: tr('settings:taxes.applied.interState'), value: tr('settings:taxes.applied.interStateValue') },
              { label: tr('settings:taxes.applied.rounding'), value: tr('settings:taxes.applied.roundingValue') },
            ].map((r) => (
              <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.md }}>
                <Text variant="small" tone="muted" style={{ flexShrink: 0 }}>
                  {r.label}
                </Text>
                {/* A long value wraps in its own column, right-aligned, instead of under the label. */}
                <Text variant="small" weight="600" style={{ flex: 1, textAlign: 'right' }}>
                  {r.value}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>

      <PrimaryActionBar title={tr('settings:taxes.add')} icon="plus" onPress={() => open()} />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? tr('settings:taxes.editTitle') : tr('settings:taxes.add')}
        footer={
          <SheetActions
            saveLabel={tr('settings:taxes.save')}
            onSave={save}
            saving={saving}
                        deleteLabel={tr('settings:taxes.delete')}
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
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <TextField label={tr('settings:taxes.name')} value={name} onChangeText={(v) => {
            setName(v);
            setNameError(undefined);
          }}
          error={nameError} placeholder={tr('settings:taxes.namePlaceholder')} required />
          <TextField
            label={tr('settings:taxes.rate')}
            value={rate}
            onChangeText={(v) => {
              setRate(v.replace(/[^0-9.]/g, ''));
              setRateError(undefined);
            }}
            error={rateError}
            keyboardType="decimal-pad"
            placeholder="18"
            icon="percent-outline"
            required
          />
          <DateField label={tr('settings:taxes.effectiveFrom')} value={effectiveFrom} onChange={setEffectiveFrom} hint={tr('settings:taxes.effectiveHint')} />
          <TextField label={tr('settings:taxes.description')} value={description} onChangeText={setDescription} placeholder={tr('settings:taxes.descriptionPlaceholder')} multiline />
        </View>
      </Sheet>

      <ConfirmDialog
        visible={!!confirmDelete}
        title={tr('settings:taxes.deleteTitle', { name: confirmDelete?.name })}
        message={tr('settings:taxes.deleteMessage')}
        confirmLabel={tr('settings:taxes.delete')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const c = confirmDelete;
          setConfirmDelete(null);
          if (c) void serverSave(() => removeTaxCategory(c.id), tr('settings:taxes.deleted'), { icon: 'percent-outline' });
        }}
      />
    </View>
  );
}
