import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { AmountField, FieldShell, focusFirstInvalid, PickerField, Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useServerSave } from '@esmart/app/components/useServerSave';
import { useSaveShortcut } from '@esmart/app/components/useSaveShortcut';
import { Item, ItemType } from '@esmart/core/types';
import { unitLabel, unitsFor } from '@esmart/core/data/masters';
import { fromMajor, money, toMajor, zero } from '@esmart/core/lib/money';
import { formatMoney, formatPercent } from '@esmart/core/lib/format';
import { uid } from '@esmart/core/lib/id';
import { formatDate, nowISO, today } from '@esmart/core/lib/date';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { Errors, hasErrors, hsnMandatory, required, validHsn } from '@esmart/core/lib/validators';
import { useAppStore } from '@esmart/app/store/appStore';
import { useActiveCompany, useBaseCurrency, useBrands, useHasModule, useItemCategories, useItems, useTaxCategories } from '@esmart/app/store/selectors';
import { Divider, Panel, Row, SummaryRow, TwoColumns } from './parts';
import { useGoBack } from '@esmart/app/navigation/useGoBack';
import { FROM_DOCUMENT, handBack } from '@esmart/app/navigation/handBack';
import { CustomFieldsSection } from '@esmart/app/features/customFields/CustomFieldsSection';
import type { CustomValues } from '@esmart/core/domain/customFields';
import { GstTreatmentFields } from '@esmart/app/features/catalog/GstTreatmentFields';

/**
 * Add an item, laid out for a desktop: the item's identity and prices in the
 * main column, its unit, stock and status in a side column with a live
 * summary. The fields, validation and save are those of the phone form
 * (`@esmart/app/features/catalog/ItemForm`).
 */
export function ItemFormDesktop({ item }: { item?: Item }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav', 'common']);
  const router = useRouter();
  const goBack = useGoBack();
  const { run: serverSave, saving } = useServerSave();

  const baseCurrency = useBaseCurrency();
  const taxCategories = useTaxCategories();
  const itemCategories = useItemCategories();
  const brands = useBrands();
  const existing = useItems();
  const taxRegistration = useActiveCompany()?.taxRegistration;
  const hsnRequired = hsnMandatory(taxRegistration);
  const gstRegistered = taxRegistration?.regime === 'GST' && !!taxRegistration.registered;
  const saveItem = useAppStore((s) => s.saveItem);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);
  const hasInventory = useHasModule('inventory');
  // SKU, barcode, category and brand are retail fields a business can switch off; the server still gives a SKU.
  const hasPos = useHasModule('pos');

  // A new one starts as goods or a service from ?type= (Items & services passes its open tab).
  const params = useLocalSearchParams<{ type?: string; from?: string }>();
  const startType: ItemType = item?.type ?? (params.type === 'service' ? 'service' : 'goods');
  const [type, setType] = useState<ItemType>(startType);
  const [name, setName] = useState(item?.name ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [unit, setUnit] = useState(item?.unit ?? (startType === 'service' ? 'NOS' : 'PCS'));
  const [salePrice, setSalePrice] = useState(item ? String(toMajor(item.salePrice)) : '');
  const [purchasePrice, setPurchasePrice] = useState(item ? String(toMajor(item.purchasePrice)) : '');
  const [taxCategoryId, setTaxCategoryId] = useState(item?.taxCategoryId ?? taxCategories.find((c) => c.rate === 18)?.id ?? taxCategories[0]?.id ?? '');
  const [hsnCode, setHsnCode] = useState(item?.hsnCode ?? '');
  const [barcode, setBarcode] = useState(item?.barcode ?? '');
  const [trackInventory, setTrackInventory] = useState(item?.trackInventory ?? (startType === 'goods' && hasInventory));
  const [openingStock, setOpeningStock] = useState(item ? String(item.openingStock) : '');
  const [openingStockDate, setOpeningStockDate] = useState(item?.openingStockDate ?? today());
  const [reorderLevel, setReorderLevel] = useState(item ? String(item.reorderLevel) : '');
  const [active, setActive] = useState((item?.status ?? 'active') === 'active');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? '');
  const [brandId, setBrandId] = useState(item?.brandId ?? '');
  const [customFields, setCustomFields] = useState<CustomValues>(item?.customFields ?? {});
  // The item's GST treatment (supply type, reverse charge, cess, ITC): kept, and editable, as on the phone.
  const [gst, setGst] = useState(item?.gst);

  const [unitOpen, setUnitOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [brandOpen, setBrandOpen] = useState(false);
  const [errors, setErrors] = useState<Errors<'name' | 'sku' | 'hsn' | 'openingStockDate'>>({});
  // Only a new tracked item takes an opening stock, and so its date.
  const takesOpeningStock = !item && type === 'goods' && trackInventory && hasInventory;

  const category = taxCategories.find((c) => c.id === taxCategoryId);
  const sale = Number(salePrice) || 0;
  const cost = Number(purchasePrice) || 0;
  const margin = sale > 0 && cost > 0 ? ((sale - cost) / sale) * 100 : null;

  /**
   * After "Save & add another": a clean form for the next item, keeping what tends to
   * repeat in a run of them (goods or service, unit, tax rate, category, brand).
   */
  const resetForAnother = () => {
    setName('');
    setSku('');
    setDescription('');
    setSalePrice('');
    setPurchasePrice('');
    setHsnCode('');
    setBarcode('');
    setOpeningStock('');
    setReorderLevel('');
    setErrors({});
    // Straight back into the name, for the next one.
    requestAnimationFrame(() => (globalThis.document?.getElementById('item-form-name') as HTMLElement | null)?.focus());
  };

  const save = async (another = false) => {
    const next: Errors<'name' | 'sku' | 'hsn' | 'openingStockDate'> = {
      name: required(name, tr('inventory:form.itemName')),
      hsn: validHsn(hsnCode, { required: hsnRequired }),
      openingStockDate: takesOpeningStock && openingStockDate > today() ? tr('inventory:form.openingStockDateFuture') : undefined,
    };
    // Left blank, a new item gets the next free SKU from the server when it is created.
    const skuValue = sku.trim().toUpperCase() || (item?.sku ?? '');
    if (skuValue && existing.some((i) => i.sku === skuValue && i.id !== item?.id)) {
      next.sku = tr('inventory:form.skuTaken');
    }
    setErrors(next);
    if (hasErrors(next)) {
      focusFirstInvalid();
      return;
    }

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
      openingStockDate: takesOpeningStock ? openingStockDate : item?.openingStockDate,
      reorderLevel: Number(reorderLevel) || 0,
      imageUri: item?.imageUri,
      categoryId: categoryId || undefined,
      brandId: brandId || undefined,
      customFields,
      gst: gst && type === 'service' && gst.capitalGoods ? { ...gst, capitalGoods: undefined } : gst,
      status: active ? 'active' : 'inactive',
      createdAt: item?.createdAt ?? nowISO(),
    };

    const res = await serverSave(() => saveItem(record), item ? tr('inventory:form.updated') : tr('inventory:form.added'), { icon: 'tag-check-outline', detail: record.name });
    if (!res) return;
    const id = res.id ?? record.id;
    if (item) goBack(`/(app)/catalog/items/${item.id}`);
    else if (another) resetForAnother();
    else if (params.from === FROM_DOCUMENT && router.canGoBack()) {
      // Back to the document it was made from, which adds it as a line.
      handBack({ kind: 'item', record: { ...record, id } });
      router.back();
    } else router.replace(`/(app)/catalog/items/${id}`);
  };
  useSaveShortcut(() => void save(), !saving, item ? undefined : () => void save(true));

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: item ? tr('nav:title.editNamed', { name: item.name }) : tr('nav:title.newItem'),
          // The page's actions sit in the header, right of the title.
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              <Button title={tr('common:action.cancel')} variant="ghost" onPress={() => goBack(item ? `/(app)/catalog/items/${item.id}` : '/(app)/catalog/items')} />
              {item ? null : (
                <Button
                  title={tr('common:action.saveAndAddAnother')}
                  tooltip={tr('common:action.saveAndAddAnotherShortcut', { keys: 'Shift+Ctrl+S' })}
                  variant="secondary"
                  onPress={() => void save(true)}
                  loading={saving}
                />
              )}
              <Button shortcut="S" title={item ? tr('inventory:form.saveChanges') : tr('common:quickAction.addItem')} onPress={() => void save()} loading={saving} />
            </View>
          ),
        }}
      />
      {/* Inset to line up with the page title and the header buttons. */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 48, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled">
        <TwoColumns
          fill
          main={
            <>
              <Panel title={tr('inventory:form.section.details')} subtitle={tr('inventory:form.section.detailsHint')} icon="tag-outline">
                {/* What it is on the left, and whether it is offered on new documents on the right. */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: t.spacing.lg }}>
                  {/* A saved item stays a product or a service: its documents and stock were made as one. */}
                  <FieldShell label={tr('inventory:form.type')} hint={item ? tr('inventory:form.typeLocked') : undefined}>
                    <Segmented
                      style={{ width: 280 }}
                      options={[
                        { value: 'goods', label: tr('inventory:type.goods') },
                        { value: 'service', label: tr('inventory:type.service') },
                      ]}
                      value={type}
                      disabled={!!item}
                      onChange={(v) => {
                        setType(v as ItemType);
                        if (v === 'service') {
                          setTrackInventory(false);
                          setUnit('NOS');
                        }
                      }}
                    />
                  </FieldShell>
                  <FieldShell label={tr('inventory:form.status')} hint={tr('inventory:form.activeHint')} style={{ width: 240 }}>
                    <SwitchField label={tr('inventory:form.active')} value={active} onValueChange={setActive} />
                  </FieldShell>
                </View>
                <TextField id="item-form-name" label={tr('inventory:form.name')} value={name} onChangeText={setName} placeholder={tr('inventory:form.namePlaceholderFull')} error={errors.name} required icon="tag-outline" />
                {hasPos ? (
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
                ) : null}
                <TextField label={tr('inventory:form.description')} value={description} onChangeText={setDescription} placeholder={tr('inventory:form.descriptionHint')} multiline />
                {hasPos ? (
                  <Row>
                    <PickerField
                      label={tr('inventory:form.category')}
                      value={itemCategories.find((c) => c.id === categoryId)?.name ?? tr('inventory:form.none')}
                      onPress={() => setCategoryOpen(true)}
                      icon="tag-outline"
                    />
                    <PickerField
                      label={tr('inventory:form.brand')}
                      value={brands.find((b) => b.id === brandId)?.name ?? tr('inventory:form.none')}
                      onPress={() => setBrandOpen(true)}
                      icon="star-circle-outline"
                    />
                  </Row>
                ) : null}
                <CustomFieldsSection entity="item" values={customFields} onChange={setCustomFields} />
              </Panel>

              <Panel title={tr('inventory:form.section.pricing')} subtitle={tr('inventory:form.section.pricingHint')} icon="currency-inr">
                <Row>
                  <AmountField label={tr('inventory:form.salePrice')} value={salePrice} onChangeValue={setSalePrice} currency={baseCurrency} />
                  <AmountField label={tr('inventory:form.purchasePrice')} value={purchasePrice} onChangeValue={setPurchasePrice} currency={baseCurrency} />
                </Row>
                <Row>
                  <PickerField
                    label={tr('inventory:form.taxRate')}
                    value={category ? `${category.name} (${formatPercent(category.rate)})` : tr('inventory:form.select')}
                    onPress={() => setTaxOpen(true)}
                    icon="percent-outline"
                  />
                  <TextField
                    label={type === 'goods' ? tr('inventory:form.hsnCode') : tr('inventory:form.sacCode')}
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
                {gstRegistered || gst ? <GstTreatmentFields value={gst} onChange={setGst} type={type} /> : null}
              </Panel>
            </>
          }
          side={
            <>
              <Panel title={tr('inventory:form.section.summary')} icon="clipboard-text-outline">
                <Text variant="title" weight="700" numberOfLines={2}>
                  {name.trim() || tr('nav:title.newItem')}
                </Text>
                <Divider />
                <SummaryRow label={tr('inventory:form.type')} value={type === 'goods' ? tr('inventory:type.goods') : tr('inventory:type.service')} />
                <SummaryRow label={tr('inventory:form.salePrice')} value={formatMoney(money(Math.round(sale * 100), baseCurrency))} />
                <SummaryRow label={tr('inventory:form.purchasePrice')} value={formatMoney(money(Math.round(cost * 100), baseCurrency))} />
                <SummaryRow
                  label={tr('inventory:detail.margin')}
                  value={margin === null ? '—' : `${margin.toFixed(1)}%`}
                  tone={margin === null ? undefined : margin >= 0 ? 'good' : 'bad'}
                />
                <SummaryRow label={tr('common:table.tax')} value={category ? formatPercent(category.rate) : '—'} />
              </Panel>

              <Panel title={tr('inventory:form.section.unitStock')} icon="package-variant-closed">
                <PickerField
                  label={tr('inventory:form.unit')}
                  value={unitLabel(unit)}
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
                          hint={item ? tr('inventory:form.openingLocked') : undefined}
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
                    {takesOpeningStock ? (
                      <DateField
                        label={tr('inventory:form.openingStockDate')}
                        value={openingStockDate}
                        onChange={setOpeningStockDate}
                        maximumDate={new Date()}
                        error={errors.openingStockDate}
                        hint={tr('inventory:form.openingStockDateHint')}
                      />
                    ) : item?.openingStockDate && trackInventory ? (
                      <TextField label={tr('inventory:form.openingStockDate')} value={formatDate(item.openingStockDate)} editable={false} icon="calendar" />
                    ) : null}
                  </>
                ) : null}
              </Panel>
            </>
          }
        />
      </ScrollView>

      <SelectSheet
        visible={unitOpen}
        onClose={() => setUnitOpen(false)}
        title={tr('inventory:form.unit')}
        options={unitsFor(type).map((u) => ({ value: u.code, label: u.name, trailing: u.shortName ?? u.code }))}
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
      <SelectSheet
        visible={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title={tr('inventory:form.category')}
        options={[{ value: '', label: tr('inventory:form.none') }, ...itemCategories.map((c) => ({ value: c.id, label: c.name }))]}
        value={categoryId}
        onSelect={setCategoryId}
      />
      <SelectSheet
        visible={brandOpen}
        onClose={() => setBrandOpen(false)}
        title={tr('inventory:form.brand')}
        options={[{ value: '', label: tr('inventory:form.none') }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
        value={brandId}
        onSelect={setBrandId}
      />
    </View>
  );
}
