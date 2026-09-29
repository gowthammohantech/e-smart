import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { AmountField, PickerField, Segmented, SwitchField, TextField , QuantityStepper } from '@/components/Field';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { DocumentLine, TaxCategory } from '@/types';
import { formatMoney, formatPercent } from '@/lib/format';
import { fromMajor, toMajor } from '@/lib/money';
import { calculateLine } from '@/domain/lineCalc';
import { validHsn } from '@/lib/validators';
import { TaxContext } from '@/domain/taxEngine';
import { unitDecimals, unitsFor } from '@/data/masters';
import { useItems } from '@/store/selectors';

type EditorProps = {
  visible: boolean;
  line: DocumentLine | null;
  currency: string;
  taxCategories: TaxCategory[];
  taxContext: TaxContext;
  onClose: () => void;
  onSave: (patch: Partial<DocumentLine>) => void;
  onRemove?: () => void;
  /** HSN/SAC is mandatory (GST-registered business). */
  hsnRequired?: boolean;
  /** Upper bound on quantity, e.g. what the source invoice carried for a return. */
  maxQuantity?: number;
};

/**
 * Edit one document line: quantity, price, discount and tax treatment.
 *
 * The form is keyed on the line id so switching lines remounts it with fresh
 * initial values, rather than syncing props into state inside an effect.
 */
export function LineEditorSheet(props: EditorProps) {
  if (!props.line) return null;
  return <LineEditorForm key={props.line.id} {...props} />;
}

function LineEditorForm({
  visible,
  line,
  currency,
  taxCategories,
  taxContext,
  onClose,
  onSave,
  onRemove,
  hsnRequired = false,
  maxQuantity,
}: EditorProps) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales']);

  const [name, setName] = useState(line?.name ?? '');
  const [quantity, setQuantity] = useState(line?.quantity ?? 1);
  const [unit, setUnit] = useState(line?.unit ?? 'NOS');
  const [price, setPrice] = useState(line ? String(toMajor(line.unitPrice)) : '0');
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>(line?.discountMode ?? 'percent');
  const [discountValue, setDiscountValue] = useState(String(line?.discountValue ?? 0));
  const [taxCategoryId, setTaxCategoryId] = useState(line?.taxCategoryId ?? '');
  const [taxInclusive, setTaxInclusive] = useState(line?.taxInclusive ?? false);
  const [hsnCode, setHsnCode] = useState(line?.hsnCode ?? '');
  const [unitOpen, setUnitOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; hsn?: string; quantity?: string }>({});
  const item = useItems().find((i) => i.id === line?.itemId);
  // Services bill in 'Nos' only; one-off lines are treated as goods.
  const itemType = item?.type ?? 'goods';
  // A catalogue line keeps the unit and HSN from the item master; only one-off lines choose their own.
  const fromCatalogue = !!line?.itemId;
  const decimals = unitDecimals(unit);

  if (!line) return null;

  const category = taxCategories.find((c) => c.id === taxCategoryId);
  const preview = calculateLine(
    {
      ...line,
      name,
      quantity,
      unit,
      unitPrice: fromMajor(price || '0', currency),
      discountMode,
      discountValue: Number(discountValue) || 0,
      taxCategoryId,
      taxRate: category?.rate ?? 0,
      taxInclusive,
    },
    currency,
    taxContext,
  );

  const save = () => {
    const next = {
      name: name.trim() ? undefined : tr('sales:line.nameRequired'),
      // A catalogue item's HSN is enforced on the item master; check it here too so an
      // item created before GST registration cannot slip onto an invoice without one.
      hsn: validHsn(hsnCode, { required: hsnRequired }),
      quantity:
        maxQuantity !== undefined && quantity > maxQuantity
          ? tr('sales:line.quantityTooHigh', { max: maxQuantity })
          : undefined,
    };
    setErrors(next);
    if (next.name || next.hsn || next.quantity) return;
    onSave({
      name: name.trim(),
      quantity: quantity > 0 ? quantity : 1,
      unit: fromCatalogue && item ? item.unit : unit,
      hsnCode: hsnCode.trim() || undefined,
      unitPrice: fromMajor(price || '0', currency),
      discountMode,
      discountValue: Number(discountValue) || 0,
      taxCategoryId,
      taxRate: category?.rate ?? 0,
      taxInclusive,
    });
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('sales:line.editLine')}
      subtitle={line.name || 'New line'}
      footer={
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          {onRemove ? (
            <Button
              title={tr('sales:line.remove')}
              variant="danger"
              icon="trash-can-outline"
              onPress={() => {
                onRemove();
                onClose();
              }}
              style={{ flex: 1 }}
            />
          ) : null}
          <Button title={tr('sales:line.saveLine')} onPress={save} style={{ flex: 2 }} />
        </View>
      }
    >
      <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
        <TextField
          label={tr('sales:line.description')}
          value={name}
          onChangeText={setName}
          placeholder={tr('sales:line.itemOrService')}
          error={errors.name}
          required
        />

        <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'flex-end' }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text variant="caption" tone="muted" weight="600">{tr('sales:line.quantity')}</Text>
            <QuantityStepper key={unit} value={quantity} onChange={setQuantity} min={0} decimals={decimals} />
          </View>
          <PickerField
            label={tr('sales:line.unit')}
            value={unit}
            onPress={() => setUnitOpen(true)}
            containerStyle={{ width: 120 }}
            disabled={fromCatalogue}
          />
        </View>
        {errors.quantity ? (
          <Text variant="caption" tone="bad">
            {errors.quantity}
          </Text>
        ) : maxQuantity !== undefined ? (
          <Text variant="caption" tone="muted">
            {tr('sales:line.quantityMaxHint', { max: maxQuantity })}
          </Text>
        ) : null}

        <TextField
          label={itemType === 'service' ? 'SAC code' : 'HSN code'}
          value={hsnCode}
          onChangeText={(v) => setHsnCode(v.replace(/[^0-9]/g, '').slice(0, 8))}
          placeholder={itemType === 'service' ? '998719' : '84821011'}
          keyboardType="number-pad"
          icon="numeric"
          editable={!fromCatalogue || !item?.hsnCode}
          hint={fromCatalogue && item?.hsnCode ? tr('sales:line.hsnFromItem') : undefined}
          error={errors.hsn}
          required={hsnRequired}
        />

        <AmountField label={tr('sales:line.rate')} value={price} onChangeValue={setPrice} currency={currency} />

        <View style={{ gap: 6 }}>
          <Text variant="caption" tone="muted" weight="600">{tr('sales:line.discount')}</Text>
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <Segmented
              options={[
                { value: 'percent', label: '%' },
                { value: 'amount', label: currency },
              ]}
              value={discountMode}
              onChange={(v) => setDiscountMode(v as 'percent' | 'amount')}
              style={{ width: 130 }}
              size="sm"
            />
            <TextField
              value={discountValue}
              onChangeText={(v) => setDiscountValue(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0"
              containerStyle={{ flex: 1 }}
            />
          </View>
        </View>

        <PickerField
          label={tr('sales:line.tax')}
          value={category ? `${category.name} (${formatPercent(category.rate)})` : 'No tax'}
          onPress={() => setTaxOpen(true)}
          icon="percent-outline"
        />

        <SwitchField
          label={tr('sales:line.rateIncludesTax')}
          description={tr('sales:line.inclusiveHint')}
          value={taxInclusive}
          onValueChange={setTaxInclusive}
        />

        <View
          style={{
            backgroundColor: t.c.card2,
            borderRadius: t.radius.md,
            padding: t.spacing.lg,
            gap: t.spacing.sm,
          }}
        >
          {[
            { label: 'Amount', value: formatMoney(preview.gross) },
            { label: tr('sales:line.discount'), value: `− ${formatMoney(preview.discount)}` },
            { label: 'Taxable', value: formatMoney(preview.taxable) },
            { label: `Tax (${formatPercent(category?.rate ?? 0)})`, value: formatMoney(preview.taxAmount) },
          ].map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="caption" tone="muted">
                {r.label}
              </Text>
              <Text variant="caption" weight="600">
                {r.value}
              </Text>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: t.c.line, marginVertical: 2 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="small" weight="700">{tr('sales:line.lineTotal')}</Text>
            <Text variant="small" weight="700">
              {formatMoney(preview.total)}
            </Text>
          </View>
        </View>
      </View>

      <SelectSheet
        visible={unitOpen}
        onClose={() => setUnitOpen(false)}
        title={tr('sales:line.unit')}
        options={unitsFor(itemType).map((u) => ({ value: u.code, label: `${u.name} (${u.code})` }))}
        value={unit}
        onSelect={(code) => {
          setUnit(code);
          // Drop decimals the new unit cannot carry (e.g. 1.5 -> 2 for NOS).
          const d = unitDecimals(code);
          setQuantity((q) => Number(q.toFixed(d)) || 1);
        }}
      />
      <SelectSheet
        visible={taxOpen}
        onClose={() => setTaxOpen(false)}
        title={tr('sales:line.taxRate')}
        options={taxCategories.map((c) => ({
          value: c.id,
          label: c.name,
          description: c.description,
          trailing: formatPercent(c.rate),
        }))}
        value={taxCategoryId}
        onSelect={setTaxCategoryId}
        searchable={false}
      />
    </Sheet>
  );
}
