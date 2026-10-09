import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { PickerField, Segmented, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useToast } from '@esmart/ui/components/Toast';
import { useAppStore } from '@esmart/app/store/appStore';
import { useBranches, useItems, useStockLevels } from '@esmart/app/store/selectors';
import { formatQty } from '@esmart/core/lib/format';
import { today } from '@esmart/core/lib/date';
import { Divider, FormFooter, Note, Panel, Row, SummaryRow, TwoColumns } from './parts';

/**
 * Stock adjustment for a desktop: the form on the left, what the change does
 * to the stock on the right. Same fields and save as the phone screen
 * (`@esmart/app/screens/(app)/inventory/adjust`).
 */
export function StockAdjustDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ itemId?: string }>();

  const items = useItems().filter((i) => i.trackInventory);
  const branches = useBranches();
  const stock = useStockLevels();
  const addStockMovement = useAppStore((s) => s.addStockMovement);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);
  const activeBranchId = useAppStore((s) => s.activeBranchId);

  const [itemId, setItemId] = useState<string | null>(params.itemId ?? null);
  const [branchId, setBranchId] = useState(activeBranchId ?? branches[0]?.id ?? '');
  const [direction, setDirection] = useState<'increase' | 'decrease'>('decrease');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [itemOpen, setItemOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);

  const item = items.find((i) => i.id === itemId);
  const current = itemId ? (stock[itemId] ?? 0) : 0;
  const qty = Number(quantity) || 0;
  const delta = direction === 'increase' ? qty : -qty;
  const resulting = current + delta;

  const REASONS =
    direction === 'decrease'
      ? ['Damaged', 'Lost or stolen', 'Expired', 'Sample given', 'Stock count correction', 'Internal use']
      : ['Found stock', 'Stock count correction', 'Returned from customer', 'Production output'];

  const canSave = !!itemId && qty > 0 && !!branchId;

  const save = () => {
    if (!canSave || !item) return;
    addStockMovement({
      companyId: activeCompanyId,
      branchId,
      itemId: item.id,
      type: 'adjustment',
      quantity: delta,
      unitCost: item.purchasePrice,
      date,
      notes: reason || undefined,
    });
    toast.show(tr('inventory:adjust.done'), 'success');
    router.back();
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.stockAdjustment') }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled">
        <TwoColumns
          main={
            <Panel title="Adjustment" subtitle="Correct the stock on hand for one item" icon="tune-variant">
              <Row>
                <PickerField
                  label={tr('inventory:adjust.item')}
                  value={item ? `${item.name} (${item.sku})` : undefined}
                  onPress={() => setItemOpen(true)}
                  icon="package-variant-closed"
                  required
                />
                {branches.length > 1 ? (
                  <PickerField
                    label={tr('inventory:adjust.branch')}
                    value={branches.find((b) => b.id === branchId)?.name}
                    onPress={() => setBranchOpen(true)}
                    icon="warehouse"
                  />
                ) : null}
              </Row>

              <Segmented
                style={{ alignSelf: 'flex-start', width: 280 }}
                options={[
                  { value: 'decrease', label: 'Decrease' },
                  { value: 'increase', label: 'Increase' },
                ]}
                value={direction}
                onChange={(v) => {
                  setDirection(v as 'increase' | 'decrease');
                  setReason('');
                }}
              />

              <Row>
                <TextField
                  label={tr('inventory:adjust.quantity')}
                  value={quantity}
                  onChangeText={(v) => setQuantity(v.replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  icon="counter"
                  suffix={
                    item ? (
                      <Text variant="caption" tone="muted">
                        {item.unit}
                      </Text>
                    ) : undefined
                  }
                  required
                />
                <DateField label={tr('inventory:adjust.date')} value={date} onChange={setDate} />
              </Row>

              <PickerField
                label={tr('inventory:adjust.reason')}
                value={reason || undefined}
                placeholder={tr('inventory:adjust.reasonPlaceholder')}
                onPress={() => setReasonOpen(true)}
                icon="comment-question-outline"
              />
            </Panel>
          }
          side={
            <Panel title="Result" subtitle={item ? item.name : 'Pick an item to see its stock'} icon="clipboard-text-outline">
              {item ? (
                <>
                  <SummaryRow label="Current stock" value={`${formatQty(current)} ${item.unit}`} />
                  <SummaryRow
                    label="Adjustment"
                    value={`${delta >= 0 ? '+' : ''}${formatQty(delta)} ${item.unit}`}
                    tone={delta === 0 ? undefined : delta > 0 ? 'good' : 'bad'}
                  />
                  <Divider />
                  <SummaryRow
                    label={tr('inventory:adjust.newStock')}
                    value={`${formatQty(resulting)} ${item.unit}`}
                    tone={resulting < 0 ? 'bad' : 'good'}
                    strong
                  />
                  {resulting < 0 ? (
                    <Text variant="caption" tone="bad">
                      {tr('inventory:adjust.negativeWarning')}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Note>The stock before and after the change appears here once you choose an item.</Note>
              )}
            </Panel>
          }
        />

        <FormFooter>
          <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
          <Button title={tr('inventory:adjust.submit')} onPress={save} disabled={!canSave} />
        </FormFooter>
      </ScrollView>

      <SelectSheet
        visible={itemOpen}
        onClose={() => setItemOpen(false)}
        title={tr('inventory:adjust.selectItem')}
        options={items.map((i) => ({ value: i.id, label: i.name, description: i.sku, trailing: `${formatQty(stock[i.id] ?? 0)} ${i.unit}` }))}
        value={itemId}
        onSelect={setItemId}
      />
      <SelectSheet
        visible={branchOpen}
        onClose={() => setBranchOpen(false)}
        title={tr('inventory:adjust.branch')}
        options={branches.map((b) => ({ value: b.id, label: b.name, description: b.code }))}
        value={branchId}
        onSelect={setBranchId}
        searchable={false}
      />
      <SelectSheet
        visible={reasonOpen}
        onClose={() => setReasonOpen(false)}
        title={tr('inventory:adjust.reason')}
        options={REASONS.map((r) => ({ value: r, label: r }))}
        value={reason}
        onSelect={setReason}
        searchable={false}
      />
    </View>
  );
}
