import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Badge } from '@esmart/ui/components/Badge';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { Cell, Column, DataTable, TABLE_PAGE_SIZE } from '@esmart/ui/components/DataTable';
import { Segmented } from '@esmart/ui/components/Field';
import { useItems, useStockLevels } from '../../../../store/selectors';
import { formatMoney, formatQty } from '@esmart/core/lib/format';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';

/**
 * The price list: what you sell and for how much. The full plan reaches items
 * through Stock, with on-hand quantities; this is the Sales plan's way in.
 */
export default function ItemList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'nav', 'common']);
  const router = useRouter();
  const items = useItems();
  const [query, setQuery] = useState('');
  // Goods and services in their own tabs, the way Contacts splits customers and suppliers.
  const [tab, setTab] = useState<'goods' | 'service'>('goods');
  const desktop = useIsDesktop();
  const stock = useStockLevels();

  const inTab = useMemo(() => items.filter((i) => i.type === tab), [items, tab]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? inTab.filter((i) => `${i.name} ${i.sku} ${i.hsnCode ?? ''}`.toLowerCase().includes(q)) : inTab;
  }, [inTab, query]);

  const tabs = (
    <Segmented
      options={[
        { value: 'goods', label: tr('inventory:catalog.items') },
        { value: 'service', label: tr('inventory:catalog.services') },
      ]}
      value={tab}
      onChange={(v) => setTab(v as 'goods' | 'service')}
    />
  );
  // Nothing in this tab at all (rather than nothing matching the search).
  const emptyTitle = inTab.length ? 'No match' : tab === 'service' ? tr('inventory:catalog.noServices') : 'No items yet';
  const emptyMessage = inTab.length
    ? 'No item matches that search.'
    : tab === 'service'
      ? tr('inventory:catalog.noServicesBody')
      : 'Add what you sell to put it on invoices in a tap.';

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.itemsAndServices') }} />
      {desktop ? (
        <View style={{ flex: 1, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg, gap: t.spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <View style={{ width: 260 }}>{tabs}</View>
            <View style={{ width: 340 }}>
              <SearchBar value={query} onChangeText={setQuery} placeholder={tr('inventory:catalog.search')} />
            </View>
          </View>
          <DataTable
            pageSize={TABLE_PAGE_SIZE}
            columns={([
              { key: 'name', header: tr('common:table.name'), flex: 2, render: (i) => <Cell weight="600">{i.name}</Cell>, sortValue: (i) => i.name },
              { key: 'sku', header: tr('common:table.sku'), width: 130, render: (i) => <Cell tone="muted">{i.sku}</Cell>, sortValue: (i) => i.sku },
              { key: 'hsn', secondary: true, header: tr('common:table.hsn'), width: 120, render: (i) => <Cell tone="muted">{i.hsnCode || '—'}</Cell> },
              {
                key: 'type',
                header: tr('common:table.type'),
                secondary: true,
                width: 120,
                render: (i) =>
                  i.type === 'service' ? <Badge label={tr('inventory:catalog.service')} tone="neutral" size="sm" /> : <Cell tone="muted">{i.unit}</Cell>,
                sortValue: (i) => i.type,
              },
              {
                key: 'onHand',
                header: tr('common:table.onHand'),
                width: 120,
                align: 'right',
                render: (i) => (
                  <Cell tone={i.trackInventory && (stock[i.id] ?? 0) <= (i.reorderLevel ?? 0) ? 'bad' : 'default'} mono>
                    {i.trackInventory ? `${formatQty(stock[i.id] ?? 0)} ${i.unit}` : '—'}
                  </Cell>
                ),
                sortValue: (i) => (i.trackInventory ? stock[i.id] ?? 0 : -1),
              },
              {
                key: 'price',
                header: tr('common:table.price'),
                width: 150,
                align: 'right',
                render: (i) => <Cell weight="600" mono>{formatMoney(i.salePrice)}</Cell>,
                sortValue: (i) => i.salePrice.minor,
              },
              // A service carries no stock (nor a goods unit to show as its type), so its tab leaves those out.
            ] satisfies Column<(typeof items)[number]>[]).filter((c) => tab === 'goods' || (c.key !== 'onHand' && c.key !== 'type'))}
            rows={filtered}
            rowKey={(i) => i.id}
            initialSort={{ key: 'name', dir: 'asc' }}
            onRowPress={(i) => router.push(`/(app)/catalog/items/${i.id}`)}
            rowLabel={(i) => i.name}
            empty={<EmptyState illustration="no-items" title={emptyTitle} message={emptyMessage} compact />}
          />
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120, gap: t.spacing.md }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        keyboardShouldPersistTaps="handled"
      >
        {tabs}
        <SearchBar value={query} onChangeText={setQuery} placeholder={tr('inventory:catalog.search')} />
        {filtered.length === 0 ? (
          <EmptyState
            illustration="no-items"
            title={emptyTitle}
            message={emptyMessage}
            actionLabel={inTab.length ? undefined : 'Add item'}
            onAction={inTab.length ? undefined : () => router.push(`/(app)/catalog/items/new?type=${tab}`)}
          />
        ) : (
          <Card padded={false}>
            {filtered.map((item, i) => (
              <ListRow
                key={item.id}
                title={item.name}
                subtitle={`${item.sku}${item.hsnCode ? ` · HSN ${item.hsnCode}` : ''}`}
                meta={`${formatMoney(item.salePrice)} / ${item.unit}`}
                right={item.type === 'service' ? <Badge label={tr('inventory:catalog.service')} tone="neutral" size="sm" /> : undefined}
                divider={i < filtered.length - 1}
                onPress={() => router.push(`/(app)/catalog/items/${item.id}`)}
              />
            ))}
          </Card>
        )}
      </ScrollView>
      )}
      {/* A new one starts on the tab it was added from. */}
      <Fab icon="plus" onPress={() => router.push(`/(app)/catalog/items/new?type=${tab}`)} />
    </View>
  );
}
