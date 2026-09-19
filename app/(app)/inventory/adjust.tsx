import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { PickerField, Segmented, TextField } from '@/components/Field';
import { DateField } from '@/components/pickers/DateField';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useBranches, useItems, useStockLevels } from '@/store/selectors';
import { formatQty } from '@/lib/format';
import { today } from '@/lib/date';

export default function StockAdjust() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: tr('nav:title.stockAdjustment') }} />

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PickerField
          label={tr('inventory:adjust.item')}
          value={item ? `${item.name} (${item.sku})` : undefined}
          onPress={() => setItemOpen(true)}
          icon="package-variant-closed"
          required
        />

        {branches.length > 1 ? (
          <PickerField label={tr('inventory:adjust.branch')} value={branches.find((b) => b.id === branchId)?.name} onPress={() => setBranchOpen(true)} icon="warehouse" />
        ) : null}

        <Segmented
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

        <PickerField label={tr('inventory:adjust.reason')} value={reason || undefined} placeholder={tr('inventory:adjust.reasonPlaceholder')} onPress={() => setReasonOpen(true)} icon="comment-question-outline" />

        <DateField label={tr('inventory:adjust.date')} value={date} onChange={setDate} />

        {item ? (
          <Card variant="flat" style={{ gap: t.spacing.sm }}>
            {[
              { label: 'Current stock', value: `${formatQty(current)} ${item.unit}` },
              { label: 'Adjustment', value: `${delta >= 0 ? '+' : ''}${formatQty(delta)} ${item.unit}` },
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
              <Text variant="body" weight="700">{tr('inventory:adjust.newStock')}</Text>
              <Text variant="body" weight="700" tone={resulting < 0 ? 'bad' : 'good'}>
                {formatQty(resulting)} {item.unit}
              </Text>
            </View>
            {resulting < 0 ? (
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
        <Button title={tr('inventory:adjust.submit')} onPress={save} disabled={!canSave} fullWidth size="lg" />
      </View>

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
    </KeyboardAvoidingView>
  );
}
