import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { PickerField, Segmented, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Skeleton, SkeletonFormField, SkeletonGroup } from '@esmart/ui/components/Skeleton';
import { useServerSave } from '../../../components/useServerSave';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { useAppStore } from '../../../store/appStore';
import { useBranches, useDefaultBranchId } from '../../../store/selectors';
import { useServerStockLevels, useTrackedItems } from '../../../remote/queries';
import { unitShortName } from '@esmart/core/data/masters';
import { formatQty } from '@esmart/core/lib/format';
import { today } from '@esmart/core/lib/date';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { useGoBack } from '../../../navigation/useGoBack';

type AdjustReason = 'damaged' | 'lost' | 'found' | 'recount' | 'expired' | 'other';
/** The screen's reasons in the server's words; the rest are "other" (with the words kept in the note). */
const SERVER_REASON: Record<string, AdjustReason> = { damaged: 'damaged', lost: 'lost', expired: 'expired', found: 'found', countCorrection: 'recount' };

export default function StockAdjust() {
  // On web the screen can stay mounted across a business switch; the branch copied into state must start again.
  const companyId = useAppStore((s) => s.activeCompanyId);
  return <StockAdjustForm key={companyId} />;
}

function StockAdjustForm() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const goBack = useGoBack();
  const { run: serverSave, saving, blocked } = useServerSave();
  const insets = useSafeAreaInsets();
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
  // And as the server's reason, so stock reports can group by it.
  const reasonKey = REASON_KEYS[REASONS.indexOf(reason) as number] as string | undefined;
  const serverReason = reasonKey ? (SERVER_REASON[reasonKey] ?? 'other') : undefined;

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
        reason: serverReason,
      } as Parameters<typeof addStockMovement>[0] & { reason?: AdjustReason });
    }, tr('inventory:adjust.done'), { icon: 'package-variant', detail: item.name }).then((res) => {
      if (res) goBack(`/(app)/catalog/items/${item.id}`);
    });
  };
  useSaveShortcut(() => void save(), !saving && canSave);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: tr('nav:title.stockAdjustment') }} />

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
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
          <PickerField label={tr('inventory:adjust.branch')} value={branches.find((b) => b.id === branchId)?.name} onPress={() => setBranchOpen(true)} icon="warehouse" />
        ) : null}

        <Segmented
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

        <PickerField label={tr('inventory:adjust.reason')} value={reason || undefined} placeholder={tr('inventory:adjust.reasonPlaceholder')} onPress={() => setReasonOpen(true)} icon="comment-question-outline" />

        <DateField label={tr('inventory:adjust.date')} value={date} onChange={setDate} />

        {item ? (
          <Card variant="flat" style={{ gap: t.spacing.sm }}>
            {[
              { label: tr('inventory:adjust.currentStock'), value: `${formatQty(current)} ${unit}`, known: levelsKnown },
              { label: tr('inventory:adjust.adjustment'), value: `${delta >= 0 ? '+' : ''}${formatQty(delta)} ${unit}`, known: true },
            ].map((r) => (
              <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="caption" tone="muted">
                  {r.label}
                </Text>
                {r.known ? (
                  <Text variant="caption" weight="600">
                    {r.value}
                  </Text>
                ) : (
                  <Skeleton height={12} width={64} radius={4} />
                )}
              </View>
            ))}
            <View style={{ height: 1, backgroundColor: t.c.line, marginVertical: 2 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="body" weight="700">{tr('inventory:adjust.newStock')}</Text>
              {levelsKnown ? (
                <Text variant="body" weight="700" tone={resulting < 0 ? 'bad' : 'good'}>
                  {formatQty(resulting)} {unit}
                </Text>
              ) : (
                <Skeleton height={16} width={72} radius={4} />
              )}
            </View>
            {levelsKnown && resulting < 0 ? (
              <Text variant="caption" tone="bad">{tr('inventory:adjust.negativeWarning')}</Text>
            ) : null}
          </Card>
        ) : null}
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
        <Button shortcut="S" title={tr('inventory:adjust.submit')} onPress={() => void save()} loading={saving} disabled={blocked || !canSave} fullWidth size="lg" />
      </View>

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
    </KeyboardAvoidingView>
  );
}
