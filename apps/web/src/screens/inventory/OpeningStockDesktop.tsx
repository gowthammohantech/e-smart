import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { useToast } from '@esmart/ui/components/Toast';
import type { Item } from '@esmart/core/types';
import { useAppStore } from '@esmart/app/store/appStore';
import { useBaseCurrency, useItems, useStockLevels } from '@esmart/app/store/selectors';
import { formatMoney, formatQty } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { today } from '@esmart/core/lib/date';
import { Divider, Note, Panel, SummaryRow, TwoColumns } from './parts';

/**
 * Opening stock for a desktop: every tracked item in a table with a quantity
 * box per row, and a summary with the save button beside it. Same entries
 * and save as the phone screen (`@esmart/app/screens/(app)/inventory/opening-stock`).
 */
export function OpeningStockDesktop() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav']);
  const router = useRouter();
  const toast = useToast();

  const items = useItems().filter((i) => i.trackInventory);
  const stock = useStockLevels();
  const baseCurrency = useBaseCurrency();
  const addStockMovement = useAppStore((s) => s.addStockMovement);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);
  const activeBranchId = useAppStore((s) => s.activeBranchId);

  const [query, setQuery] = useState('');
  const [date, setDate] = useState(today());
  const [values, setValues] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.name} ${i.sku}`.toLowerCase().includes(q));
  }, [items, query]);

  const entered = Object.entries(values).filter(([, v]) => Number(v) > 0);
  const totalValue = entered.reduce((acc, [id, v]) => {
    const item = items.find((i) => i.id === id);
    return acc + (item?.purchasePrice.minor ?? 0) * Number(v);
  }, 0);

  const save = () => {
    entered.forEach(([itemId, v]) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return;
      addStockMovement({
        companyId: activeCompanyId,
        branchId: activeBranchId ?? 'brn_mum',
        itemId,
        type: 'opening',
        quantity: Number(v),
        unitCost: item.purchasePrice,
        date,
        notes: 'Opening stock entry',
      });
    });
    toast.show(`Opening stock set for ${entered.length} item${entered.length === 1 ? '' : 's'}`, 'success');
    router.back();
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.openingStock') }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled">
        <TwoColumns
          main={
            <>
              <Note>
                Enter what you already had on hand when you started using the app. This posts an opening movement and does not affect your sales or purchase figures.
              </Note>
              <SearchBar value={query} onChangeText={setQuery} placeholder={tr('inventory:opening.search')} />
              {filtered.length === 0 ? (
                <Card padded={false}>
                  <EmptyState illustration="no-items" icon="package-variant" title={tr('inventory:opening.noTracked')} compact />
                </Card>
              ) : (
                <DataTable<Item>
                  scroll={false}
                  columns={[
                    {
                      key: 'item',
                      header: 'Item',
                      flex: 3,
                      render: (i) => (
                        <View style={{ flexShrink: 1 }}>
                          <Cell weight="600">{i.name}</Cell>
                          <Cell tone="muted">{i.sku}</Cell>
                        </View>
                      ),
                    },
                    {
                      key: 'current',
                      header: 'Current',
                      flex: 1.2,
                      align: 'right',
                      render: (i) => (
                        <Cell mono tone="muted">
                          {`${formatQty(stock[i.id] ?? 0)} ${i.unit}`}
                        </Cell>
                      ),
                    },
                    {
                      key: 'opening',
                      header: 'Opening quantity',
                      width: 150,
                      align: 'right',
                      render: (i) => (
                        <TextField
                          value={values[i.id] ?? ''}
                          onChangeText={(v) => setValues((s) => ({ ...s, [i.id]: v.replace(/[^0-9.]/g, '') }))}
                          placeholder="0"
                          keyboardType="decimal-pad"
                          containerStyle={{ width: 110 }}
                        />
                      ),
                    },
                  ]}
                  rows={filtered}
                  rowKey={(i) => i.id}
                />
              )}
            </>
          }
          side={
            <Panel title="Opening stock" subtitle="Applies to the branch you are in" icon="database-outline">
              <DateField label={tr('inventory:opening.asOn')} value={date} onChange={setDate} />
              <Divider />
              <SummaryRow label="Items entered" value={String(entered.length)} />
              <SummaryRow label="Stock value" value={formatMoney(money(totalValue, baseCurrency))} strong />
              <Button title={tr('inventory:opening.submit')} onPress={save} disabled={entered.length === 0} />
            </Panel>
          }
        />
      </ScrollView>
    </View>
  );
}
