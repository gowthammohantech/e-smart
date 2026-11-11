import React, { useState } from 'react';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { DRAWER_WIDTH, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { FieldRow } from '@esmart/ui/components/Layout';
import { Sheet } from '@esmart/ui/components/Sheet';
import { useSaveShortcut } from '../../components/useSaveShortcut';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { AmountField, PickerField, Segmented, SwitchField, TextField , QuantityStepper } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { DocumentLine, GstFlags, TaxCategory } from '@esmart/core/types';
import { formatMoney, formatPercent } from '@esmart/core/lib/format';
import { fromMajor, subtract, toMajor } from '@esmart/core/lib/money';
import { calculateLine } from '@esmart/core/domain/lineCalc';
import { validHsn } from '@esmart/core/lib/validators';
import { TaxContext } from '@esmart/core/domain/taxEngine';
import { unitDecimals, unitShortName, unitsFor } from '@esmart/core/data/masters';
import { useItems } from '../../store/selectors';
import { PurchaseLineGstFields } from '../catalog/GstTreatmentFields';
import { CostCentreField } from '../books/CostCentreField';

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
  /** A purchase line: it also says reverse charge, capital goods and whether its credit can be claimed. */
  purchase?: boolean;
};

/**
 * Edit one document line: quantity, price, discount and tax treatment.
 *
 * The form is keyed on the line id so switching lines remounts it with fresh
 * initial values, rather than syncing props into state inside an effect.
 */
export function LineEditorSheet(props: EditorProps) {
  if (!props.line) return null;
  return <LineEditorForm key={props.line.id} {...props} line={props.line} />;
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
  purchase = false,
}: EditorProps & { line: DocumentLine }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['sales', 'common', 'inventory']);

  const [name, setName] = useState(line?.name ?? '');
  // The line's own description, filled from the item's when it was added.
  const [description, setDescription] = useState(line?.description ?? '');
  const [quantity, setQuantity] = useState(line?.quantity ?? 1);
  const [unit, setUnit] = useState(line?.unit ?? 'NOS');
  // A zero rate or discount starts as an empty box showing "0" as a placeholder, not as typed text.
  // Empty reads as zero everywhere below (`price || '0'`, `Number(discountValue) || 0`).
  const [price, setPrice] = useState(line && line.unitPrice.minor !== 0 ? String(toMajor(line.unitPrice)) : '');
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>(line?.discountMode ?? 'amount');
  const [discountValue, setDiscountValue] = useState(line?.discountValue ? String(line.discountValue) : '');
  const [taxCategoryId, setTaxCategoryId] = useState(line?.taxCategoryId ?? '');
  const [taxInclusive, setTaxInclusive] = useState(line?.taxInclusive ?? false);
  // A pure-agent reimbursement (Rule 33): recovered at cost, with no tax and outside the taxable value.
  const [reimbursement, setReimbursement] = useState(!!line?.gst?.reimbursement);
  // The rest of the line's GST treatment: from the item when it was added, changed here on a purchase.
  const [flags, setFlags] = useState<GstFlags | undefined>(line?.gst);
  // Cleared on a line that had some, it is sent as {} (plain), so the server doesn't take the item's back.
  const gst = flags || reimbursement ? { ...flags, reimbursement: reimbursement || undefined } : line?.gst ? {} : undefined;
  const [hsnCode, setHsnCode] = useState(line?.hsnCode ?? '');
  const [unitOpen, setUnitOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; hsn?: string; quantity?: string; rate?: string; discount?: string }>({});
  const item = useItems().find((i) => i.id === line?.itemId);
  // A purchase line that isn't stock may carry its own cost centre; stock takes the bill's (RULES 6.20).
  const [costCentreId, setCostCentreId] = useState<string | undefined>(line?.costCentreId);
  const ownCentre = purchase && !item?.trackInventory;
  // Services bill in 'Nos' only; one-off lines are treated as goods.
  const itemType = item?.type ?? 'goods';
  // A catalogue line keeps the unit and HSN from the item master; only one-off lines choose their own.
  const fromCatalogue = !!line?.itemId;
  const decimals = unitDecimals(unit);

  const category = taxCategories.find((c) => c.id === taxCategoryId);
  // A rate the list doesn't have (yet) stays the line's own: never saved over as no tax.
  const keptRate = !category && taxCategoryId && taxCategoryId === line?.taxCategoryId ? line.taxRate : undefined;
  const rate = category?.rate ?? keptRate ?? 0;
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
      taxRate: rate,
      taxInclusive,
      gst,
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
      // No line is worth nothing: the rate, and what's left after the discount, must be above 0.
      rate: fromMajor(price || '0', currency).minor > 0 ? undefined : tr('sales:line.rateRequired'),
      discount:
        fromMajor(price || '0', currency).minor > 0 && preview.taxable.minor <= 0 ? tr('sales:line.discountTooHigh') : undefined,
    };
    setErrors(next);
    if (next.name || next.hsn || next.quantity || next.rate || next.discount) return;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      quantity: quantity > 0 ? quantity : 1,
      unit: fromCatalogue && item ? item.unit : unit,
      hsnCode: hsnCode.trim() || undefined,
      unitPrice: fromMajor(price || '0', currency),
      discountMode,
      discountValue: Number(discountValue) || 0,
      taxCategoryId,
      taxRate: reimbursement ? 0 : rate,
      taxInclusive: reimbursement ? false : taxInclusive,
      gst,
      costCentreId: ownCentre ? costCentreId : undefined,
    });
    onClose();
  };

  // Ctrl+S (⌘+S) saves the line while this sheet is up, not over its pickers.
  useSaveShortcut(save, visible && !unitOpen && !taxOpen);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('sales:line.editLine')}
      subtitle={line.name || tr('sales:line.newLine')}
      // A desktop edits the line in a drawer beside the grid, not a narrow dialog over it.
      desktopAs="drawer"
      desktopWidth={DRAWER_WIDTH.lg}
      footer={
        // A desktop keeps Remove at the left, apart from Save line at the right, both at their own width.
        <View style={desktop ? { flex: 1, flexDirection: 'row', justifyContent: onRemove ? 'space-between' : 'flex-end' } : { flexDirection: 'row', gap: t.spacing.md }}>
          {onRemove ? (
            <Button
              title={tr('sales:line.remove')}
              icon="trash-can-outline"
              // Asks first, and kept apart from Save line so a slip doesn't lose the line.
              onPress={() => setConfirmRemove(true)}
              variant="danger"
              style={desktop ? undefined : { flex: 1 }}
            />
          ) : null}
          <Button shortcut="S" title={tr('sales:line.saveLine')} onPress={save} style={desktop ? undefined : { flex: 2, marginLeft: onRemove ? t.spacing.md : 0 }} />
        </View>
      }
    >
      <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
        {/* A catalogue line takes its name from the item (shown in the title); only a one-off line types one. */}
        {fromCatalogue ? null : (
          <TextField
            label={tr('sales:line.itemOrService')}
            value={name}
            onChangeText={setName}
            placeholder={tr('sales:line.itemOrService')}
            error={errors.name}
            required
          />
        )}
        <TextField
          label={tr('sales:line.description')}
          value={description}
          onChangeText={setDescription}
          placeholder={tr('sales:line.descriptionPlaceholder')}
          multiline
        />

        <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'flex-end' }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text variant="caption" tone="muted" weight="600">{tr('sales:line.quantity')}</Text>
            <QuantityStepper key={unit} value={quantity} onChange={setQuantity} min={0} decimals={decimals} />
          </View>
          <PickerField
            label={tr('sales:line.unit')}
            value={unitShortName(unit)}
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

        <FieldRow>
        <TextField
          label={itemType === 'service' ? tr('sales:line.sacCode') : tr('sales:line.hsnCode')}
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

        <AmountField label={tr('sales:line.rate')} value={price} onChangeValue={setPrice} currency={currency} placeholder="0" error={errors.rate} required />
        </FieldRow>

        <View style={{ gap: 6 }}>
          <Text nativeID="line-discount-label" variant="caption" tone="muted" weight="600">{tr('sales:line.discount')}</Text>
          <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'stretch' }}>
            <Segmented
              options={[
                { value: 'percent', label: '%' },
                { value: 'amount', label: currency },
              ]}
              value={discountMode}
              onChange={(v) => setDiscountMode(v as 'percent' | 'amount')}
              // Full size, as tall as the amount box beside it.
              style={{ width: 130, justifyContent: 'center' }}
            />
            <TextField
              value={discountValue}
              onChangeText={(v) => setDiscountValue(v.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0"
              accessibilityLabel={tr('sales:line.discountValue', { unit: discountMode === 'percent' ? '%' : currency })}
              containerStyle={{ flex: 1 }}
            />
          </View>
          {errors.discount ? (
            <Text variant="caption" tone="bad">
              {errors.discount}
            </Text>
          ) : null}
        </View>

        <PickerField
          label={tr('sales:line.tax')}
          value={category ? `${category.name} (${formatPercent(category.rate)})` : keptRate !== undefined ? formatPercent(keptRate) : tr('common:totals.noTax')}
          onPress={() => setTaxOpen(true)}
          icon="percent-outline"
        />

        {reimbursement ? null : (
          <SwitchField
            label={tr('sales:line.rateIncludesTax')}
            description={tr('sales:line.inclusiveHint')}
            value={taxInclusive}
            onValueChange={setTaxInclusive}
          />
        )}

        <SwitchField
          label={tr('inventory:gst.reimbursement')}
          description={tr('inventory:gst.reimbursementHint')}
          value={reimbursement}
          onValueChange={setReimbursement}
        />

        {purchase && !reimbursement ? <PurchaseLineGstFields value={flags} onChange={setFlags} type={itemType} /> : null}
        {ownCentre ? <CostCentreField value={costCentreId} onChange={setCostCentreId} /> : null}

        <View
          style={{
            backgroundColor: t.c.card2,
            borderRadius: t.radius.md,
            padding: t.spacing.lg,
            gap: t.spacing.sm,
          }}
        >
          {[
            { label: tr('sales:line.grossAmount'), value: formatMoney(preview.gross) },
            { label: tr('sales:line.discount'), value: `− ${formatMoney(preview.discount)}` },
            { label: tr('common:totals.taxableValue'), value: formatMoney(preview.taxable) },
            ...(preview.cessAmount.minor
              ? [
                  { label: tr('sales:line.gstWithRate', { rate: formatPercent(rate) }), value: formatMoney(subtract(preview.taxAmount, preview.cessAmount)) },
                  { label: tr('sales:line.cessWithRate', { rate: formatPercent(preview.cessRate) }), value: formatMoney(preview.cessAmount) },
                ]
              : [{ label: tr('sales:line.taxWithRate', { rate: formatPercent(category?.rate ?? 0) }), value: formatMoney(preview.taxAmount) }]),
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
            {/* With tax: the grid's "Line total" is before tax, so this says which it is. */}
            <Text variant="small" weight="700">{tr('sales:line.totalWithTax')}</Text>
            <Text variant="small" weight="700">
              {formatMoney(preview.total)}
            </Text>
          </View>
        </View>
      </View>

      <ConfirmDialog
        visible={confirmRemove}
        title={tr('sales:line.removeTitle')}
        message={tr('sales:line.removeMessage', { name: line.name || tr('sales:editor.untitledLine') })}
        confirmLabel={tr('sales:line.remove')}
        destructive
        icon="trash-can-outline"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          onRemove?.();
          onClose();
        }}
      />
      <SelectSheet
        visible={unitOpen}
        onClose={() => setUnitOpen(false)}
        title={tr('sales:line.unit')}
        options={unitsFor(itemType).map((u) => ({ value: u.code, label: `${u.name} (${u.shortName ?? u.code})` }))}
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
