import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { Sheet } from '@/components/Sheet';
import { TextField } from '@/components/Field';
import { DateField } from '@/components/pickers/DateField';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { TaxCategory } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useDocuments, useItems, useTaxCategories } from '@/store/selectors';
import { formatPercent } from '@/lib/format';
import { formatDate, today } from '@/lib/date';
import { uid } from '@/lib/id';

export default function TaxSettings() {
  const t = useTheme();
  const { t: tr } = useTranslation(['nav']);
  const toast = useToast();

  const company = useActiveCompany();
  const categories = useTaxCategories();
  const items = useItems();
  const documents = useDocuments();
  const saveTaxCategory = useAppStore((s) => s.saveTaxCategory);
  const removeTaxCategory = useAppStore((s) => s.removeTaxCategory);

  const [editing, setEditing] = useState<TaxCategory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TaxCategory | null>(null);
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [description, setDescription] = useState('');

  const regime = company?.taxRegistration?.regime ?? 'NONE';

  const open = (c?: TaxCategory) => {
    setEditing(c ?? ({ id: '', companyId: company.id, name: '', rate: 0, type: regime === 'VAT' ? 'VAT' : 'GST', effectiveFrom: today() } as TaxCategory));
    setName(c?.name ?? '');
    setRate(c ? String(c.rate) : '');
    setEffectiveFrom(c?.effectiveFrom ?? today());
    setDescription(c?.description ?? '');
  };

  const usageOf = (id: string) =>
    items.filter((i) => i.taxCategoryId === id).length +
    documents.filter((d) => d.lines.some((l) => l.taxCategoryId === id)).length;

  const save = () => {
    if (!editing || !name.trim()) return;
    saveTaxCategory({
      ...editing,
      id: editing.id || uid('tax'),
      companyId: company.id,
      name: name.trim(),
      rate: Number(rate) || 0,
      effectiveFrom,
      description: description.trim() || undefined,
    });
    toast.show(editing.id ? 'Tax rate updated' : 'Tax rate added', 'success');
    setEditing(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.taxes') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Card variant="flat" style={{ marginBottom: t.spacing.lg, gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <Badge label={regime} tone="info" />
            <Text variant="small" weight="600">
              {company?.taxRegistration?.identifier ?? 'Not registered'}
            </Text>
          </View>
          <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
            {regime === 'GST'
              ? 'Each rate splits into CGST + SGST within your state, or a single IGST line for inter-state supplies. Rates carry an effective date so past documents keep the treatment they were issued under.'
              : 'Rates carry an effective date so past documents keep the treatment they were issued under.'}
          </Text>
        </Card>

        <Card padded={false}>
          {categories.length === 0 ? (
            <EmptyState icon="percent-outline" title="No tax rates" compact />
          ) : (
            categories.map((c, i) => (
              <ListRow
                key={c.id}
                title={c.name}
                subtitle={c.description}
                meta={`Effective from ${formatDate(c.effectiveFrom)} · used by ${usageOf(c.id)} records`}
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
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
              How a rate is applied
            </Text>
            {[
              { label: 'Within your state', value: 'CGST + SGST, split evenly' },
              { label: 'Other states', value: 'IGST at the full rate' },
              { label: 'Rounding', value: 'Half-up to the paisa, then the document total to the rupee' },
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
        }}
      >
        <Button title="Add tax rate" icon="plus" onPress={() => open()} fullWidth size="lg" />
      </View>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit tax rate' : 'Add tax rate'}
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
            <Button title="Save" onPress={save} disabled={!name.trim()} style={{ flex: 2 }} />
          </View>
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. GST 18%" required />
          <TextField
            label="Rate (%)"
            value={rate}
            onChangeText={(v) => setRate(v.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="18"
            icon="percent-outline"
            required
          />
          <DateField label="Effective from" value={effectiveFrom} onChange={setEffectiveFrom} hint="Documents dated before this keep their original rate." />
          <TextField label="Description" value={description} onChangeText={setDescription} placeholder="What this slab covers" multiline />
        </View>
      </Sheet>

      <ConfirmDialog
        visible={!!confirmDelete}
        title={`Delete ${confirmDelete?.name}?`}
        message="Existing documents keep the rate they were issued with. Items using it will need a new rate."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removeTaxCategory(confirmDelete.id);
          setConfirmDelete(null);
          toast.show('Tax rate deleted', 'success');
        }}
      />
    </View>
  );
}
