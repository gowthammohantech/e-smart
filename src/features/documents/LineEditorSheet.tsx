import React, { useState } from 'react';
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
import { TaxContext } from '@/domain/taxEngine';
import { UNITS } from '@/data/masters';

type EditorProps = {
  visible: boolean;
  line: DocumentLine | null;
  currency: string;
  taxCategories: TaxCategory[];
  taxContext: TaxContext;
  onClose: () => void;
  onSave: (patch: Partial<DocumentLine>) => void;
  onRemove?: () => void;
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
}: EditorProps) {
  const t = useTheme();

  const [name, setName] = useState(line?.name ?? '');
  const [quantity, setQuantity] = useState(line?.quantity ?? 1);
  const [unit, setUnit] = useState(line?.unit ?? 'NOS');
  const [price, setPrice] = useState(line ? String(toMajor(line.unitPrice)) : '0');
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>(line?.discountMode ?? 'percent');
  const [discountValue, setDiscountValue] = useState(String(line?.discountValue ?? 0));
  const [taxCategoryId, setTaxCategoryId] = useState(line?.taxCategoryId ?? '');
  const [taxInclusive, setTaxInclusive] = useState(line?.taxInclusive ?? false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);

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
    onSave({
      name: name.trim() || line.name,
      quantity: quantity > 0 ? quantity : 1,
      unit,
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
      title="Edit line"
      subtitle={line.name || 'New line'}
      footer={
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          {onRemove ? (
            <Button
              title="Remove"
              variant="danger"
              icon="trash-can-outline"
              onPress={() => {
                onRemove();
                onClose();
              }}
              style={{ flex: 1 }}
            />
          ) : null}
          <Button title="Save line" onPress={save} style={{ flex: 2 }} />
        </View>
      }
    >
      <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
        <TextField label="Description" value={name} onChangeText={setName} placeholder="Item or service" />

        <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'flex-end' }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text variant="caption" tone="muted" weight="600">
              Quantity
            </Text>
            <QuantityStepper value={quantity} onChange={setQuantity} min={0} decimals={2} />
          </View>
          <PickerField label="Unit" value={unit} onPress={() => setUnitOpen(true)} containerStyle={{ width: 120 }} />
        </View>

        <AmountField label="Rate" value={price} onChangeValue={setPrice} currency={currency} />

        <View style={{ gap: 6 }}>
          <Text variant="caption" tone="muted" weight="600">
            Discount
          </Text>
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
          label="Tax"
          value={category ? `${category.name} (${formatPercent(category.rate)})` : 'No tax'}
          onPress={() => setTaxOpen(true)}
          icon="percent-outline"
        />

        <SwitchField
          label="Rate includes tax"
          description="Turn on when the price you quote already contains tax."
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
            { label: 'Discount', value: `− ${formatMoney(preview.discount)}` },
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
            <Text variant="small" weight="700">
              Line total
            </Text>
            <Text variant="small" weight="700">
              {formatMoney(preview.total)}
            </Text>
          </View>
        </View>
      </View>

      <SelectSheet
        visible={unitOpen}
        onClose={() => setUnitOpen(false)}
        title="Unit"
        options={UNITS.map((u) => ({ value: u.code, label: `${u.name} (${u.code})` }))}
        value={unit}
        onSelect={setUnit}
      />
      <SelectSheet
        visible={taxOpen}
        onClose={() => setTaxOpen(false)}
        title="Tax rate"
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
