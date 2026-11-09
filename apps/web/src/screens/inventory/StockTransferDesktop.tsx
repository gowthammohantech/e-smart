import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { PickerField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { SkeletonFormField, SkeletonGroup } from '@esmart/ui/components/Skeleton';
import { useServerSave } from '@esmart/app/components/useServerSave';
import { useAppStore } from '@esmart/app/store/appStore';
import { useBranches, useDefaultBranchId } from '@esmart/app/store/selectors';
import { useServerStockLevels, useTrackedItems } from '@esmart/app/remote/queries';
import { formatQty } from '@esmart/core/lib/format';
import { unitShortName } from '@esmart/core/data/masters';
import { today } from '@esmart/core/lib/date';
import { Divider, FormFooter, Note, Panel, Row, SummaryRow, TwoColumns } from './parts';
import { useGoBack } from '@esmart/app/navigation/useGoBack';

/**
 * Branch transfer for a desktop: source and destination side by side with an
 * arrow between, and a summary of what each branch ends up with. Same fields
 * and save as the phone screen (`@esmart/app/screens/(app)/inventory/transfer`).
 */
export function StockTransferDesktop() {
  // The page stays mounted across a business switch; the branches copied into state must start again.
  const companyId = useAppStore((s) => s.activeCompanyId);
  return <StockTransferForm key={companyId} />;
}

function StockTransferForm() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav', 'common']);
  const router = useRouter();
  const goBack = useGoBack();
  const { run: serverSave, saving } = useServerSave();
  const params = useLocalSearchParams<{ itemId?: string }>();

  // Every tracked item, from the server.
  const { items, isPending: itemsPending } = useTrackedItems();
  const branches = useBranches();
  // From the branch picked in the switcher, to the first other one.
  const defaultBranchId = useDefaultBranchId();
  const transferStock = useAppStore((s) => s.transferStock);

  const [itemId, setItemId] = useState<string | null>(params.itemId ?? null);
  const [fromBranchId, setFromBranchId] = useState(defaultBranchId ?? branches[0]?.id ?? '');
  const [toBranchId, setToBranchId] = useState(branches.find((b) => b.id !== (defaultBranchId ?? branches[0]?.id))?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');

  const [itemOpen, setItemOpen] = useState(false);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const item = items.find((i) => i.id === itemId);
  const unit = item ? unitShortName(item.unit) || item.unit : '';
  // What the source branch holds on the transfer date, not today.
  // On hand at each branch now, from the server, which checks the transfer again on saving.
  const fromLevels = useServerStockLevels(fromBranchId, !!fromBranchId).data;
  const toLevels = useServerStockLevels(toBranchId, !!toBranchId).data;
  // Until the source branch's levels are back, nothing is "only 0 available".
  const levelsKnown = fromLevels !== undefined;
  const toKnown = !toBranchId || toLevels !== undefined;
  const available = item ? (fromLevels?.[item.id] ?? 0) : 0;
  const atDestination = item && toBranchId ? (toLevels?.[item.id] ?? 0) : 0;
  const qty = Number(quantity) || 0;
  const exceeds = levelsKnown && qty > available;
  const canSave = !!itemId && qty > 0 && fromBranchId !== toBranchId && !!toBranchId && levelsKnown && !exceeds;
  const nameOf = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';

  if (branches.length < 2) {
    return (
      <View style={{ flex: 1 }}>
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
              <Panel title={tr('inventory:transfer.whatTitle')} subtitle={tr('inventory:transfer.whatHint')} icon="package-variant-closed">
                {/* Opened for an item that hasn't arrived yet: a placeholder, not an empty picker. */}
                {itemId && !item && itemsPending ? (
                  <SkeletonGroup>
                    <SkeletonFormField />
                  </SkeletonGroup>
                ) : (
                  <PickerField
                    label={tr('inventory:transfer.item')}
                    value={item ? `${item.name} (${item.sku})` : undefined}
                    onPress={() => setItemOpen(true)}
                    icon="package-variant-closed"
                    required
                  />
                )}
                <Row>
                  <TextField
                    label={tr('inventory:transfer.quantity')}
                    value={quantity}
                    onChangeText={(v) => setQuantity(v.replace(/[^0-9.]/g, ''))}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    icon="counter"
                    error={exceeds ? tr('inventory:transfer.onlyAvailable', { qty: formatQty(available), unit }) : undefined}
                    hint={item ? (levelsKnown ? tr('inventory:transfer.available', { qty: formatQty(available), unit }) : tr('inventory:transfer.checking')) : undefined}
                    required
                  />
                  <DateField label={tr('inventory:transfer.date')} value={date} onChange={setDate} />
                </Row>
              </Panel>

              <Panel title={tr('inventory:transfer.whereTitle')} subtitle={tr('inventory:transfer.whereHint')} icon="swap-horizontal">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.md }}>
                  <View style={{ flexGrow: 1, flexBasis: 200 }}>
                    <PickerField
                      label={tr('inventory:transfer.from')}
                      value={branches.find((b) => b.id === fromBranchId)?.name}
                      onPress={() => setFromOpen(true)}
                      icon="warehouse"
                    />
                  </View>
                  <Icon name="arrow-right" size={22} color={t.c.muted} style={{ marginTop: 18 }} />
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
              <Panel title={tr('inventory:transfer.afterTitle')} subtitle={item ? item.name : tr('inventory:transfer.pickItemHint')} icon="clipboard-text-outline">
                {item ? (
                  <>
                    <SummaryRow label={tr('inventory:transfer.branchNow', { branch: nameOf(fromBranchId) })} value={`${formatQty(available)} ${unit}`} loading={!levelsKnown} />
                    <SummaryRow label={tr('inventory:transfer.branchAfter', { branch: nameOf(fromBranchId) })} value={`${formatQty(available - qty)} ${unit}`} tone={exceeds ? 'bad' : undefined} strong loading={!levelsKnown} />
                    <Divider />
                    <SummaryRow label={tr('inventory:transfer.branchNow', { branch: nameOf(toBranchId) })} value={`${formatQty(atDestination)} ${unit}`} loading={!toKnown} />
                    <SummaryRow label={tr('inventory:transfer.branchAfter', { branch: nameOf(toBranchId) })} value={`${formatQty(atDestination + qty)} ${unit}`} tone="good" strong loading={!toKnown} />
                    {exceeds ? (
                      <Text variant="caption" tone="bad">
                        {tr('inventory:transfer.exceedsSource')}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Note>{tr('inventory:transfer.afterEmpty')}</Note>
                )}
              </Panel>
              <Note>{tr('inventory:transfer.twoMovesNote')}</Note>
            </>
          }
        />

        <FormFooter>
          <Button title={tr('common:action.cancel')} variant="ghost" onPress={() => goBack(itemId ? `/(app)/catalog/items/${itemId}` : '/(app)/(tabs)/inventory')} />
          <Button
            title={tr('inventory:transfer.submit')}
            disabled={!canSave}
            loading={saving}
            onPress={() => {
              if (!canSave || !itemId) return;
              // Held busy until it has gone back: a second tap would move the stock again.
              void serverSave(() => {
                transferStock({ itemId, fromBranchId, toBranchId, quantity: qty, date, notes: notes || undefined });
              }, tr('inventory:transfer.done'), { icon: 'truck-delivery-outline', hold: true }).then((res) => {
                if (res) goBack(`/(app)/catalog/items/${itemId}`);
              });
            }}
          />
        </FormFooter>
      </ScrollView>

      <SelectSheet
        visible={itemOpen}
        onClose={() => setItemOpen(false)}
        title={tr('inventory:transfer.selectItem')}
        options={items.map((i) => ({ value: i.id, label: i.name, description: i.sku }))}
        loading={itemsPending}
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
