import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { PickerField, TextField } from '@/components/Field';
import { DateField } from '@/components/pickers/DateField';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/components/Toast';
import { useAppStore } from '@/store/appStore';
import { useBranches, useItems, useStockMovements } from '@/store/selectors';
import { stockOnHand } from '@/domain/stockLedger';
import { formatQty } from '@/lib/format';
import { today } from '@/lib/date';

export default function StockTransfer() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ itemId?: string }>();

  const items = useItems().filter((i) => i.trackInventory);
  const branches = useBranches();
  const movements = useStockMovements();
  const transferStock = useAppStore((s) => s.transferStock);

  const [itemId, setItemId] = useState<string | null>(params.itemId ?? null);
  const [fromBranchId, setFromBranchId] = useState(branches[0]?.id ?? '');
  const [toBranchId, setToBranchId] = useState(branches[1]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');

  const [itemOpen, setItemOpen] = useState(false);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const item = items.find((i) => i.id === itemId);
  const available = item ? stockOnHand(item.id, movements, fromBranchId) : 0;
  const qty = Number(quantity) || 0;
  const exceeds = qty > available;
  const canSave = !!itemId && qty > 0 && fromBranchId !== toBranchId && !!toBranchId && !exceeds;

  if (branches.length < 2) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.branchTransfer') }} />
        <EmptyState
          illustration="single-location"
              icon="warehouse"
          title={tr('inventory:transfer.oneLocation')}
          message={tr('inventory:transfer.oneLocationBody')}
          actionLabel={tr('inventory:transfer.addBranch')}
          onAction={() => router.push('/(app)/settings/branches')}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: tr('nav:title.branchTransfer') }} />

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PickerField
          label={tr('inventory:transfer.item')}
          value={item ? `${item.name} (${item.sku})` : undefined}
          onPress={() => setItemOpen(true)}
          icon="package-variant-closed"
          required
        />

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.md }}>
          <PickerField
            label={tr('inventory:transfer.from')}
            value={branches.find((b) => b.id === fromBranchId)?.name}
            onPress={() => setFromOpen(true)}
            containerStyle={{ flex: 1 }}
            icon="warehouse"
          />
          <View style={{ height: 48, justifyContent: 'center' }}>
            <MaterialCommunityIcons name="arrow-right" size={20} color={t.c.muted} />
          </View>
          <PickerField
            label={tr('inventory:transfer.to')}
            value={branches.find((b) => b.id === toBranchId)?.name}
            onPress={() => setToOpen(true)}
            containerStyle={{ flex: 1 }}
            icon="warehouse"
          />
        </View>

        <TextField
          label={tr('inventory:transfer.quantity')}
          value={quantity}
          onChangeText={(v) => setQuantity(v.replace(/[^0-9.]/g, ''))}
          placeholder="0"
          keyboardType="decimal-pad"
          icon="counter"
          error={exceeds ? `Only ${formatQty(available)} ${item?.unit ?? ''} available at the source branch` : undefined}
          hint={item ? `${formatQty(available)} ${item.unit} available` : undefined}
          required
        />

        <DateField label={tr('inventory:transfer.date')} value={date} onChange={setDate} />
        <TextField label={tr('inventory:transfer.notes')} value={notes} onChangeText={setNotes} placeholder={tr('inventory:transfer.notesPlaceholder')} multiline />

        {item ? (
          <Card variant="flat" style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone="muted">
              Transfers post two movements — one out of the source branch and one into the destination — so total stock stays
              unchanged.
            </Text>
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
        <Button
          title={tr('inventory:transfer.submit')}
          onPress={() => {
            if (!canSave || !itemId) return;
            transferStock({ itemId, fromBranchId, toBranchId, quantity: qty, date, notes: notes || undefined });
            toast.show(tr('inventory:transfer.done'), 'success');
            router.back();
          }}
          disabled={!canSave}
          fullWidth
          size="lg"
        />
      </View>

      <SelectSheet
        visible={itemOpen}
        onClose={() => setItemOpen(false)}
        title={tr('inventory:transfer.selectItem')}
        options={items.map((i) => ({ value: i.id, label: i.name, description: i.sku }))}
        value={itemId}
        onSelect={setItemId}
      />
      <SelectSheet
        visible={fromOpen}
        onClose={() => setFromOpen(false)}
        title={tr('inventory:transfer.fromBranch')}
        options={branches.map((b) => ({ value: b.id, label: b.name, description: b.code }))}
        value={fromBranchId}
        onSelect={setFromBranchId}
        searchable={false}
      />
      <SelectSheet
        visible={toOpen}
        onClose={() => setToOpen(false)}
        title={tr('inventory:transfer.toBranch')}
        options={branches.filter((b) => b.id !== fromBranchId).map((b) => ({ value: b.id, label: b.name, description: b.code }))}
        value={toBranchId}
        onSelect={setToBranchId}
        searchable={false}
      />
    </KeyboardAvoidingView>
  );
}
