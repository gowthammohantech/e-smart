import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Badge } from '@esmart/ui/components/Badge';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { Cell, Column, DataTable } from '@esmart/ui/components/DataTable';
import { Button } from '@esmart/ui/components/Button';
import { Segmented } from '@esmart/ui/components/Field';
import { useItemPages } from '../../../../remote/queries';
import { useDebounced } from '../../../../components/useDebounced';
import type { Item } from '@esmart/core/types';
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
  const [query, setQuery] = useState('');
  // Goods and services in their own tabs, the way Contacts splits customers and suppliers.
  const [tab, setTab] = useState<'goods' | 'service'>('goods');
  const desktop = useIsDesktop();
  // Read from the server by name, 50 at a time, each with what's on hand; search runs there too.
  const search = useDebounced(query);
  const pages = useItemPages({ type: tab, q: search });
  const filtered = pages.rows as unknown as (Item & { stockOnHand?: number })[];
  const stock: Record<string, number> = Object.fromEntries(filtered.map((i) => [i.id, i.stockOnHand ?? 0]));
  // Nothing in this tab at all, as against nothing matching the search.
  const inTab = search || pages.isLoading ? [true] : filtered;
  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };
  const moreFooter = pages.hasNextPage ? (
    <View style={{ alignItems: 'center', paddingVertical: t.spacing.md }}>
      {pages.isFetchingNextPage ? <ActivityIndicator color={t.c.muted} /> : <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" onPress={loadMore} />}
    </View>
  ) : null;

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
  const emptyTitle = inTab.length ? tr('inventory:catalog.noMatch') : tab === 'service' ? tr('inventory:catalog.noServices') : tr('inventory:catalog.noItems');
  const emptyMessage = inTab.length
    ? tr('inventory:catalog.noMatchBody')
    : tab === 'service'
      ? tr('inventory:catalog.noServicesBody')
      : tr('inventory:catalog.noItemsBody');

  return (
    <View style={{ flex: 1 }}>
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
            columns={([
              { key: 'name', header: tr('common:table.name'), flex: 2, render: (i) => <Cell weight="600">{i.name}</Cell> },
              { key: 'sku', header: tr('common:table.sku'), width: 130, render: (i) => <Cell tone="muted">{i.sku}</Cell> },
              { key: 'hsn', secondary: true, header: tr('common:table.hsn'), width: 120, render: (i) => <Cell tone="muted">{i.hsnCode || '—'}</Cell> },
              {
                key: 'type',
                header: tr('common:table.type'),
                secondary: true,
                width: 120,
                render: (i) =>
                  i.type === 'service' ? <Badge label={tr('inventory:catalog.service')} tone="neutral" size="sm" /> : <Cell tone="muted">{i.unit}</Cell>,
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
              },
              {
                key: 'price',
                header: tr('common:table.price'),
                width: 150,
                align: 'right',
                render: (i) => <Cell weight="600" mono>{formatMoney(i.salePrice)}</Cell>,
              },
              // A service carries no stock (nor a goods unit to show as its type), so its tab leaves those out.
            ] satisfies Column<(typeof filtered)[number]>[]).filter((c) => tab === 'goods' || (c.key !== 'onHand' && c.key !== 'type'))}
            rows={filtered}
            rowKey={(i) => i.id}
            onRowPress={(i) => router.push(`/(app)/catalog/items/${i.id}`)}
            rowLabel={(i) => i.name}
            empty={pages.isLoading ? <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} /> : <EmptyState illustration="no-items" title={emptyTitle} message={emptyMessage} compact />}
          />
          {moreFooter}
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120, gap: t.spacing.md }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        keyboardShouldPersistTaps="handled"
        // The next page loads before the end is reached, so scrolling rarely waits.
        onScroll={({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
          if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600) loadMore();
        }}
        scrollEventThrottle={200}
      >
        {tabs}
        <SearchBar value={query} onChangeText={setQuery} placeholder={tr('inventory:catalog.search')} />
        {pages.isLoading && !filtered.length ? (
          <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
        ) : filtered.length === 0 ? (
          <EmptyState
            illustration="no-items"
            title={emptyTitle}
            message={emptyMessage}
            actionLabel={inTab.length ? undefined : tr('common:quickAction.addItem')}
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
        {moreFooter}
      </ScrollView>
      )}
      {/* A new one starts on the tab it was added from. */}
      <Fab icon="plus" onPress={() => router.push(`/(app)/catalog/items/new?type=${tab}`)} />
    </View>
  );
}
