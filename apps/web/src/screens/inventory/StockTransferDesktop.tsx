import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { PickerField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useToast } from '@esmart/ui/components/Toast';
import { useAppStore } from '@esmart/app/store/appStore';
import { useBranches, useItems, useStockMovements } from '@esmart/app/store/selectors';
import { stockOnHand } from '@esmart/core/domain/stockLedger';
import { formatQty } from '@esmart/core/lib/format';
import { today } from '@esmart/core/lib/date';
import { Divider, FormFooter, Note, Panel, Row, SummaryRow, TwoColumns } from './parts';

/**
 * Branch transfer for a desktop: source and destination side by side with an
 * arrow between, and a summary of what each branch ends up with. Same fields
 * and save as the phone screen (`@esmart/app/screens/(app)/inventory/transfer`).
 */
export function StockTransferDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();
  const toast = useToast();
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
  const atDestination = item && toBranchId ? stockOnHand(item.id, movements, toBranchId) : 0;
  const qty = Number(quantity) || 0;
  const exceeds = qty > available;
  const canSave = !!itemId && qty > 0 && fromBranchId !== toBranchId && !!toBranchId && !exceeds;
  const nameOf = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';

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
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.branchTransfer') }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled">
        <TwoColumns
          main={
            <>
              <Panel title="What to move" subtitle="The item and how much of it" icon="package-variant-closed">
                <PickerField
                  label={tr('inventory:transfer.item')}
                  value={item ? `${item.name} (${item.sku})` : undefined}
                  onPress={() => setItemOpen(true)}
                  icon="package-variant-closed"
                  required
                />
                <Row>
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
                </Row>
              </Panel>

              <Panel title="Where" subtitle="From one branch to another" icon="swap-horizontal">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.md }}>
                  <View style={{ flexGrow: 1, flexBasis: 200 }}>
                    <PickerField
                      label={tr('inventory:transfer.from')}
                      value={branches.find((b) => b.id === fromBranchId)?.name}
                      onPress={() => setFromOpen(true)}
                      icon="warehouse"
                    />
                  </View>
                  <MaterialCommunityIcons name="arrow-right" size={22} color={t.c.muted} style={{ marginTop: 18 }} />
                  <View style={{ flexGrow: 1, flexBasis: 200 }}>
                    <PickerField
                      label={tr('inventory:transfer.to')}
                      value={branches.find((b) => b.id === toBranchId)?.name}
                      onPress={() => setToOpen(true)}
                      icon="warehouse"
                    />
                  </View>
                </View>
                <TextField
                  label={tr('inventory:transfer.notes')}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder={tr('inventory:transfer.notesPlaceholder')}
                  multiline
                />
              </Panel>
            </>
          }
          side={
            <>
              <Panel title="After the transfer" subtitle={item ? item.name : 'Pick an item to see the effect'} icon="clipboard-text-outline">
                {item ? (
                  <>
                    <SummaryRow label={`${nameOf(fromBranchId)} now`} value={`${formatQty(available)} ${item.unit}`} />
                    <SummaryRow label={`${nameOf(fromBranchId)} after`} value={`${formatQty(available - qty)} ${item.unit}`} tone={exceeds ? 'bad' : undefined} strong />
                    <Divider />
                    <SummaryRow label={`${nameOf(toBranchId)} now`} value={`${formatQty(atDestination)} ${item.unit}`} />
                    <SummaryRow label={`${nameOf(toBranchId)} after`} value={`${formatQty(atDestination + qty)} ${item.unit}`} tone="good" strong />
                    {exceeds ? (
                      <Text variant="caption" tone="bad">
                        This is more than the source branch holds.
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Note>The stock at both branches, before and after, appears here once you choose an item.</Note>
                )}
              </Panel>
              <Note>
                Transfers post two movements — one out of the source branch and one into the destination — so total stock stays unchanged.
              </Note>
            </>
          }
        />

        <FormFooter>
          <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
          <Button
            title={tr('inventory:transfer.submit')}
            disabled={!canSave}
            onPress={() => {
              if (!canSave || !itemId) return;
              transferStock({ itemId, fromBranchId, toBranchId, quantity: qty, date, notes: notes || undefined });
              toast.show(tr('inventory:transfer.done'), 'success');
              router.back();
            }}
          />
        </FormFooter>
      </ScrollView>

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
    </View>
  );
}
