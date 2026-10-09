import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { AmountField, PickerField, Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useToast } from '@esmart/ui/components/Toast';
import { Item, ItemType } from '@esmart/core/types';
import { UNITS, unitsFor } from '@esmart/core/data/masters';
import { fromMajor, money, toMajor, zero } from '@esmart/core/lib/money';
import { formatMoney, formatPercent } from '@esmart/core/lib/format';
import { uid } from '@esmart/core/lib/id';
import { nowISO } from '@esmart/core/lib/date';
import { Errors, hasErrors, hsnMandatory, required, validHsn } from '@esmart/core/lib/validators';
import { useAppStore } from '@esmart/app/store/appStore';
import { useActiveCompany, useBaseCurrency, useHasModule, useItems, useTaxCategories } from '@esmart/app/store/selectors';
import { Divider, FormFooter, Panel, Row, SummaryRow, TwoColumns } from './parts';

/**
 * Add an item, laid out for a desktop: the item's identity and prices in the
 * main column, its unit, stock and status in a side column with a live
 * summary. The fields, validation and save are those of the phone form
 * (`@esmart/app/features/catalog/ItemForm`).
 */
export function ItemFormDesktop({ item }: { item?: Item }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();
  const toast = useToast();

  const baseCurrency = useBaseCurrency();
  const taxCategories = useTaxCategories();
  const existing = useItems();
  const hsnRequired = hsnMandatory(useActiveCompany()?.taxRegistration);
  const saveItem = useAppStore((s) => s.saveItem);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);
  const hasInventory = useHasModule('inventory');

  const [type, setType] = useState<ItemType>(item?.type ?? 'goods');
  const [name, setName] = useState(item?.name ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [unit, setUnit] = useState(item?.unit ?? (item?.type === 'service' ? 'NOS' : 'PCS'));
  const [salePrice, setSalePrice] = useState(item ? String(toMajor(item.salePrice)) : '');
  const [purchasePrice, setPurchasePrice] = useState(item ? String(toMajor(item.purchasePrice)) : '');
  const [taxCategoryId, setTaxCategoryId] = useState(item?.taxCategoryId ?? taxCategories.find((c) => c.rate === 18)?.id ?? taxCategories[0]?.id ?? '');
  const [hsnCode, setHsnCode] = useState(item?.hsnCode ?? '');
  const [barcode, setBarcode] = useState(item?.barcode ?? '');
  const [trackInventory, setTrackInventory] = useState(item?.trackInventory ?? hasInventory);
  const [openingStock, setOpeningStock] = useState(item ? String(item.openingStock) : '');
  const [reorderLevel, setReorderLevel] = useState(item ? String(item.reorderLevel) : '');
  const [active, setActive] = useState((item?.status ?? 'active') === 'active');

  const [unitOpen, setUnitOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'sku' | 'hsn'>>({});

  const category = taxCategories.find((c) => c.id === taxCategoryId);
  const sale = Number(salePrice) || 0;
  const cost = Number(purchasePrice) || 0;
  const margin = sale > 0 && cost > 0 ? ((sale - cost) / sale) * 100 : null;

  const save = () => {
    const next: Errors<'name' | 'sku' | 'hsn'> = {
      name: required(name, 'Item name'),
      hsn: validHsn(hsnCode, { required: hsnRequired }),
    };
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
      unit: type === 'service' ? 'NOS' : unit,
      salePrice: salePrice ? fromMajor(salePrice, baseCurrency) : zero(baseCurrency),
      purchasePrice: purchasePrice ? fromMajor(purchasePrice, baseCurrency) : zero(baseCurrency),
      taxCategoryId,
      hsnCode: hsnCode.trim() || undefined,
      barcode: barcode.trim() || undefined,
      trackInventory: type === 'goods' ? trackInventory : false,
      openingStock: Number(openingStock) || 0,
      reorderLevel: Number(reorderLevel) || 0,
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
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.newItem') }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled">
        <TwoColumns
          main={
            <>
              <Panel title="Item details" subtitle="What you sell and how it is identified" icon="tag-outline">
                <Segmented
                  style={{ alignSelf: 'flex-start', width: 280 }}
                  options={[
                    { value: 'goods', label: 'Product' },
                    { value: 'service', label: 'Service' },
                  ]}
                  value={type}
                  onChange={(v) => {
                    setType(v as ItemType);
                    if (v === 'service') {
                      setTrackInventory(false);
                      setUnit('NOS');
                    }
                  }}
                />
                <TextField label={tr('inventory:form.name')} value={name} onChangeText={setName} placeholder={tr('inventory:form.namePlaceholderFull')} error={errors.name} required icon="tag-outline" />
                <Row>
                  <TextField
                    label={tr('inventory:form.sku')}
                    value={sku}
                    onChangeText={(v) => setSku(v.toUpperCase())}
                    placeholder={tr('inventory:form.skuHint')}
                    autoCapitalize="characters"
                    icon="barcode"
                    error={errors.sku}
                  />
                  {type === 'goods' ? (
                    <TextField label={tr('inventory:form.barcode')} value={barcode} onChangeText={setBarcode} placeholder={tr('inventory:form.barcodePlaceholder')} icon="barcode-scan" />
                  ) : null}
                </Row>
                <TextField label={tr('inventory:form.description')} value={description} onChangeText={setDescription} placeholder={tr('inventory:form.descriptionHint')} multiline />
              </Panel>

              <Panel title="Pricing and tax" subtitle="What you charge and what it costs you" icon="currency-inr">
                <Row>
                  <AmountField label={tr('inventory:form.salePrice')} value={salePrice} onChangeValue={setSalePrice} currency={baseCurrency} />
                  <AmountField label={tr('inventory:form.purchasePrice')} value={purchasePrice} onChangeValue={setPurchasePrice} currency={baseCurrency} />
                </Row>
                <Row>
                  <PickerField
                    label={tr('inventory:form.taxRate')}
                    value={category ? `${category.name} (${formatPercent(category.rate)})` : 'Select'}
                    onPress={() => setTaxOpen(true)}
                    icon="percent-outline"
                  />
                  <TextField
                    label={type === 'goods' ? 'HSN code' : 'SAC code'}
                    value={hsnCode}
                    onChangeText={(v) => setHsnCode(v.replace(/[^0-9]/g, '').slice(0, 8))}
                    placeholder={type === 'goods' ? '84821011' : '998719'}
                    keyboardType="number-pad"
                    icon="numeric"
                    hint={tr('inventory:form.hsnHint')}
                    error={errors.hsn}
                    required={hsnRequired}
                  />
                </Row>
              </Panel>
            </>
          }
          side={
            <>
              <Panel title="Summary" icon="clipboard-text-outline">
                <Text variant="title" weight="700" numberOfLines={2}>
                  {name.trim() || 'New item'}
                </Text>
                <Divider />
                <SummaryRow label="Type" value={type === 'goods' ? 'Product' : 'Service'} />
                <SummaryRow label="Sale price" value={formatMoney(money(Math.round(sale * 100), baseCurrency))} />
                <SummaryRow label="Purchase price" value={formatMoney(money(Math.round(cost * 100), baseCurrency))} />
                <SummaryRow
                  label="Margin"
                  value={margin === null ? '—' : `${margin.toFixed(1)}%`}
                  tone={margin === null ? undefined : margin >= 0 ? 'good' : 'bad'}
                />
                <SummaryRow label="Tax" value={category ? formatPercent(category.rate) : '—'} />
              </Panel>

              <Panel title="Unit and stock" icon="package-variant-closed">
                <PickerField
                  label={tr('inventory:form.unit')}
                  value={UNITS.find((u) => u.code === unit)?.name ?? unit}
                  onPress={() => setUnitOpen(true)}
                  icon="ruler"
                  disabled={type === 'service'}
                  hint={type === 'service' ? tr('inventory:form.serviceUnitHint') : undefined}
                />
                {type === 'goods' && hasInventory ? (
                  <>
                    <SwitchField
                      label={tr('inventory:form.trackStock')}
                      description={tr('inventory:form.trackStockHintFull')}
                      value={trackInventory}
                      onValueChange={setTrackInventory}
                    />
                    {trackInventory ? (
                      <Row>
                        <TextField
                          label={tr('inventory:form.openingStock')}
                          value={openingStock}
                          onChangeText={(v) => setOpeningStock(v.replace(/[^0-9.]/g, ''))}
                          placeholder="0"
                          keyboardType="decimal-pad"
                          editable={!item}
                          hint={item ? 'Use a stock adjustment to change this.' : undefined}
                        />
                        <TextField
                          label={tr('inventory:form.reorderLevel')}
                          value={reorderLevel}
                          onChangeText={(v) => setReorderLevel(v.replace(/[^0-9.]/g, ''))}
                          placeholder="0"
                          keyboardType="decimal-pad"
                          hint={tr('inventory:form.reorderHint')}
                        />
                      </Row>
                    ) : null}
                  </>
                ) : null}
              </Panel>

              <Panel title="Status" icon="toggle-switch-outline">
                <SwitchField label={tr('inventory:form.active')} description={tr('inventory:form.activeHint')} value={active} onValueChange={setActive} />
              </Panel>
            </>
          }
        />

        <FormFooter>
          <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
          <Button title={item ? 'Save changes' : 'Add item'} onPress={save} />
        </FormFooter>
      </ScrollView>

      <SelectSheet
        visible={unitOpen}
        onClose={() => setUnitOpen(false)}
        title={tr('inventory:form.unit')}
        options={unitsFor(type).map((u) => ({ value: u.code, label: u.name, trailing: u.code }))}
        value={unit}
        onSelect={setUnit}
      />
      <SelectSheet
        visible={taxOpen}
        onClose={() => setTaxOpen(false)}
        title={tr('inventory:form.taxRate')}
        options={taxCategories.map((c) => ({ value: c.id, label: c.name, description: c.description, trailing: formatPercent(c.rate) }))}
        value={taxCategoryId}
        onSelect={setTaxCategoryId}
        searchable={false}
      />
    </View>
  );
}
