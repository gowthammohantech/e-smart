import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { PickerField, Segmented, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { SkeletonFormField, SkeletonGroup } from '@esmart/ui/components/Skeleton';
import { useServerSave } from '@esmart/app/components/useServerSave';
import { useSaveShortcut } from '@esmart/app/components/useSaveShortcut';
import { useAppStore } from '@esmart/app/store/appStore';
import { useBranches, useDefaultBranchId } from '@esmart/app/store/selectors';
import { useServerStockLevels, useTrackedItems } from '@esmart/app/remote/queries';
import { unitShortName } from '@esmart/core/data/masters';
import { formatQty } from '@esmart/core/lib/format';
import { today } from '@esmart/core/lib/date';
import { Divider, FormFooter, Note, Panel, Row, SummaryRow, TwoColumns } from './parts';
import { useGoBack } from '@esmart/app/navigation/useGoBack';

/**
 * Stock adjustment for a desktop: the form on the left, what the change does
 * to the stock on the right. Same fields and save as the phone screen
 * (`@esmart/app/screens/(app)/inventory/adjust`).
 */
export function StockAdjustDesktop() {
  // The page stays mounted across a business switch; the branch copied into state must start again.
  const companyId = useAppStore((s) => s.activeCompanyId);
  return <StockAdjustForm key={companyId} />;
}

function StockAdjustForm() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav', 'common']);
  const goBack = useGoBack();
  const { run: serverSave, saving } = useServerSave();
  const params = useLocalSearchParams<{ itemId?: string }>();

  // Every tracked item and what's on hand at the active branch, from the server.
  const { items, stock, isPending: itemsPending } = useTrackedItems();
  const branches = useBranches();
  const addStockMovement = useAppStore((s) => s.addStockMovement);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);
  const defaultBranchId = useDefaultBranchId();

  const [itemId, setItemId] = useState<string | null>(params.itemId ?? null);
  const [branchId, setBranchId] = useState(defaultBranchId ?? branches[0]?.id ?? '');
  const [direction, setDirection] = useState<'increase' | 'decrease'>('decrease');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const [itemOpen, setItemOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);

  const item = items.find((i) => i.id === itemId);
  // On hand at the branch being adjusted, not the one picked in the switcher.
  const levels = useServerStockLevels(branchId, !!branchId).data;
  const activeBranchId = useAppStore((s) => s.activeBranchId);
  const fallback = branchId === activeBranchId ? stock : {};
  const current = itemId ? (levels ? (levels[itemId] ?? 0) : (fallback[itemId] ?? 0)) : 0;
  // Neither the branch's levels nor the active branch's tracked list back yet: no "0 in stock".
  const levelsKnown = levels !== undefined || (branchId === activeBranchId && !itemsPending);
  const unit = item ? unitShortName(item.unit) || item.unit : '';
  const qty = Number(quantity) || 0;
  const delta = direction === 'increase' ? qty : -qty;
  const resulting = current + delta;

  // The chosen reason is saved as the movement's note, in the words the user picked it in.
  const REASON_KEYS =
    direction === 'decrease'
      ? (['damaged', 'lost', 'expired', 'sample', 'countCorrection', 'internalUse'] as const)
      : (['found', 'countCorrection', 'customerReturn', 'production'] as const);
  const REASONS = REASON_KEYS.map((k) => tr(`inventory:adjust.reasons.${k}`));

  const canSave = !!itemId && qty > 0 && !!branchId;

  const save = () => {
    if (!canSave || !item) return;
    void serverSave(() => {
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
    }, tr('inventory:adjust.done'), { icon: 'package-variant', detail: item.name }).then((res) => {
      if (res) goBack(`/(app)/catalog/items/${item.id}`);
    });
  };
  useSaveShortcut(() => void save(), !saving && canSave);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.stockAdjustment') }} />
      {/* Inset to line up with the page title, as the item form is. */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 48, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled">
        <TwoColumns
          main={
            <Panel title={tr('inventory:adjust.adjustment')} subtitle={tr('inventory:adjust.panelHint')} icon="tune-variant">
              <Row>
                {/* Opened for an item that hasn't arrived yet: a placeholder, not an empty picker. */}
                {itemId && !item && itemsPending ? (
                  <SkeletonGroup>
                    <SkeletonFormField />
                  </SkeletonGroup>
                ) : (
                  <PickerField
                    label={tr('inventory:adjust.item')}
                    value={item ? `${item.name} (${item.sku})` : undefined}
                    onPress={() => setItemOpen(true)}
                    icon="package-variant-closed"
                    required
                  />
                )}
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
                  { value: 'decrease', label: tr('inventory:adjust.decrease') },
                  { value: 'increase', label: tr('inventory:adjust.increase') },
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
                        {unit}
                      </Text>
                    ) : undefined
                  }
                  required
                />
                <DateField label={tr('inventory:adjust.date')} value={date} onChange={setDate} />
              </Row>

              {/* Half the row, under the quantity. */}
              <Row>
                <PickerField
                  label={tr('inventory:adjust.reason')}
                  value={reason || undefined}
                  placeholder={tr('inventory:adjust.reasonPlaceholder')}
                  onPress={() => setReasonOpen(true)}
                  icon="comment-question-outline"
                />
                {null}
              </Row>
            </Panel>
          }
          side={
            <Panel title={tr('inventory:adjust.result')} subtitle={item ? item.name : tr('inventory:adjust.pickItemHint')} icon="clipboard-text-outline">
              {item ? (
                <>
                  <SummaryRow label={tr('inventory:adjust.currentStock')} value={`${formatQty(current)} ${unit}`} loading={!levelsKnown} />
                  <SummaryRow
                    label={tr('inventory:adjust.adjustment')}
                    value={`${delta >= 0 ? '+' : ''}${formatQty(delta)} ${unit}`}
                    tone={delta === 0 ? undefined : delta > 0 ? 'good' : 'bad'}
                  />
                  <Divider />
                  <SummaryRow
                    label={tr('inventory:adjust.newStock')}
                    value={`${formatQty(resulting)} ${unit}`}
                    tone={resulting < 0 ? 'bad' : 'good'}
                    strong
                    loading={!levelsKnown}
                  />
                  {levelsKnown && resulting < 0 ? (
                    <Text variant="caption" tone="bad">
                      {tr('inventory:adjust.negativeWarning')}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Note>{tr('inventory:adjust.resultEmpty')}</Note>
              )}
            </Panel>
          }
        />

        <FormFooter>
          <Button title={tr('common:action.cancel')} variant="ghost" onPress={() => goBack(item ? `/(app)/catalog/items/${item.id}` : '/(app)/(tabs)/inventory')} />
          <Button shortcut="S" title={tr('inventory:adjust.submit')} onPress={() => void save()} loading={saving} disabled={!canSave} />
        </FormFooter>
      </ScrollView>

      <SelectSheet
        visible={itemOpen}
        onClose={() => setItemOpen(false)}
        title={tr('inventory:adjust.selectItem')}
        options={items.map((i) => ({ value: i.id, label: i.name, description: i.sku, trailing: levelsKnown ? `${formatQty(levels ? (levels[i.id] ?? 0) : (fallback[i.id] ?? 0))} ${unitShortName(i.unit) || i.unit}` : undefined }))}
        loading={itemsPending}
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
