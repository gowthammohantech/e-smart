import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/components/Button';
import { AmountField, PickerField, Segmented, SwitchField, TextField } from '@/components/Field';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { useToast } from '@/components/Toast';
import { Item, ItemType } from '@/types';
import { UNITS } from '@/data/masters';
import { fromMajor, toMajor, zero } from '@/lib/money';
import { formatPercent } from '@/lib/format';
import { uid } from '@/lib/id';
import { nowISO } from '@/lib/date';
import { Errors, hasErrors, required } from '@/lib/validators';
import { useAppStore } from '@/store/appStore';
import { useBaseCurrency, useItems, useTaxCategories } from '@/store/selectors';

export function ItemForm({ item }: { item?: Item }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const baseCurrency = useBaseCurrency();
  const taxCategories = useTaxCategories();
  const existing = useItems();
  const saveItem = useAppStore((s) => s.saveItem);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);

  const [type, setType] = useState<ItemType>(item?.type ?? 'goods');
  const [name, setName] = useState(item?.name ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'PCS');
  const [salePrice, setSalePrice] = useState(item ? String(toMajor(item.salePrice)) : '');
  const [taxCategoryId, setTaxCategoryId] = useState(item?.taxCategoryId ?? taxCategories.find((c) => c.rate === 18)?.id ?? taxCategories[0]?.id ?? '');
  const [hsnCode, setHsnCode] = useState(item?.hsnCode ?? '');
  const [active, setActive] = useState((item?.status ?? 'active') === 'active');

  const [unitOpen, setUnitOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'sku'>>({});

  const category = taxCategories.find((c) => c.id === taxCategoryId);

  // The portal's rule, surfaced while typing rather than at submission.
  const hsnError =
    hsnCode.trim() && !/^\d{4}$|^\d{6}$|^\d{8}$/.test(hsnCode.trim())
      ? 'HSN must be 4, 6 or 8 digits'
      : undefined;

  const save = () => {
    const next: Errors<'name' | 'sku'> = { name: required(name, 'Item name') };
    const skuValue = sku.trim().toUpperCase() || `SKU-${String(existing.length + 1).padStart(4, '0')}`;
    if (existing.some((i) => i.sku === skuValue && i.id !== item?.id)) {
      next.sku = 'Another item already uses this SKU';
    }
    setErrors(next);
    if (hasErrors(next)) return;

    const record: Item = {
      id: item?.id ?? uid('itm'),
      companyId: item?.companyId ?? activeCompanyId,
      sku: skuValue,
      name: name.trim(),
      description: description.trim() || undefined,
      type,
      unit,
      salePrice: salePrice ? fromMajor(salePrice, baseCurrency) : zero(baseCurrency),
      taxCategoryId,
      hsnCode: hsnCode.trim() || undefined,
      imageUri: item?.imageUri,
      status: active ? 'active' : 'inactive',
      createdAt: item?.createdAt ?? nowISO(),
    };

    saveItem(record);
    toast.show(item ? 'Item updated' : 'Item added', 'success');
    if (item) router.back();
    else router.replace(`/(app)/catalog/items/${record.id}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Segmented
          options={[
            { value: 'goods', label: 'Product' },
            { value: 'service', label: 'Service' },
          ]}
          value={type}
          onChange={(v) => setType(v as ItemType)}
        />

        <TextField label="Name" value={name} onChangeText={setName} placeholder="What you're selling" error={errors.name} required icon="tag-outline" />
        <TextField
          label="SKU / item code"
          value={sku}
          onChangeText={(v) => setSku(v.toUpperCase())}
          placeholder="Auto-generated if left blank"
          autoCapitalize="characters"
          icon="barcode"
          error={errors.sku}
        />
        <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Shown on documents" multiline />

        <AmountField label="Sale price" value={salePrice} onChangeValue={setSalePrice} currency={baseCurrency} />

        <PickerField label="Unit" value={UNITS.find((u) => u.code === unit)?.name ?? unit} onPress={() => setUnitOpen(true)} icon="ruler" />
        <PickerField
          label="Tax rate"
          value={category ? `${category.name} (${formatPercent(category.rate)})` : 'Select'}
          onPress={() => setTaxOpen(true)}
          icon="percent-outline"
        />
        <TextField
          label={type === 'goods' ? 'HSN code' : 'SAC code'}
          value={hsnCode}
          onChangeText={setHsnCode}
          placeholder={type === 'goods' ? '84821011' : '998719'}
          keyboardType="number-pad"
          icon="numeric"
          hint={
            type === 'goods'
              ? 'Four, six or eight digits. The IRP rejects an invoice without it.'
              : 'Six-digit SAC. The IRP rejects an invoice without it.'
          }
          error={hsnError}
        />

        <SwitchField label="Active" description="Inactive items are hidden when creating documents." value={active} onValueChange={setActive} />
      </ScrollView>

      <View
        style={{
          padding: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.md,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
        }}
      >
        <Button title={item ? 'Save changes' : 'Add item'} onPress={save} fullWidth size="lg" />
      </View>

      <SelectSheet
        visible={unitOpen}
        onClose={() => setUnitOpen(false)}
        title="Unit"
        options={UNITS.map((u) => ({ value: u.code, label: u.name, trailing: u.code }))}
        value={unit}
        onSelect={setUnit}
      />
      <SelectSheet
        visible={taxOpen}
        onClose={() => setTaxOpen(false)}
        title="Tax rate"
        options={taxCategories.map((c) => ({ value: c.id, label: c.name, description: c.description, trailing: formatPercent(c.rate) }))}
        value={taxCategoryId}
        onSelect={setTaxCategoryId}
        searchable={false}
      />
    </KeyboardAvoidingView>
  );
}
