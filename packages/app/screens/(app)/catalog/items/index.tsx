import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
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
import { FilterMenu } from '@esmart/ui/components/FilterMenu';
import { useItemPages } from '../../../../remote/queries';
import { pagedTableProps, useRowsExport, useTableSelection } from '../../../../components/pagedTable';
import { useServerSave } from '../../../../components/useServerSave';
import { useAppStore } from '../../../../store/appStore';
import { useBrands, useHasModule, useItemCategories } from '../../../../store/selectors';
import { unitShortName } from '@esmart/core/data/masters';
import { useDebounced } from '../../../../components/useDebounced';
import type { Item } from '@esmart/core/types';
import { formatMoney, formatQty } from '@esmart/core/lib/format';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { ListSkeleton, MoreRowsSkeleton } from '../../../../components/ScreenSkeleton';
import { LoadFailed } from '../../../../features/company/LoadFailed';
import { Text } from '@esmart/ui/components/Text';

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
  // By the company's own item category and brand ('all' is no filter).
  const [categoryId, setCategoryId] = useState('all');
  const [brandId, setBrandId] = useState('all');
  const categories = useItemCategories();
  const brands = useBrands();
  // Switched off, SKU, category and brand leave the list too.
  const hasPos = useHasModule('pos');
  const showFilters = hasPos && (categories.length > 0 || brands.length > 0);
  const filtering = categoryId !== 'all' || brandId !== 'all';
  const pages = useItemPages({ type: tab, q: search, categoryId: categoryId === 'all' ? undefined : categoryId, brandId: brandId === 'all' ? undefined : brandId });
  const held = pages.rows as unknown as (Item & { stockOnHand?: number })[];
  // Just switched Goods/Services: the other tab's rows are held over while this one's load. They're
  // the wrong kind (services under Goods), so the list waits on placeholders instead.
  const wrongKind = pages.isPlaceholderData && (held.length === 0 || held.some((i) => i.type !== tab));
  const filtered = wrongKind ? [] : held;
  const stock: Record<string, number> = Object.fromEntries(filtered.map((i) => [i.id, i.stockOnHand ?? 0]));
  // Nothing in this tab at all, as against nothing matching the search.
  const inTab = search || filtering || pages.isLoading || wrongKind ? [true] : filtered;
  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };
  // The phone's list: the next page loads on scroll, with this as the fallback.
  const moreFooter = pages.hasNextPage ? (
    <View style={{ alignItems: 'center', paddingVertical: t.spacing.md }}>
      {pages.isFetchingNextPage ? <MoreRowsSkeleton kind="list" /> : <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" onPress={loadMore} />}
    </View>
  ) : null;

  // Desktop bulk actions: the chosen rows as a CSV, or set inactive in one save.
  const selection = useTableSelection(`${tab}|${search}|${categoryId}|${brandId}`);
  const exportRows = useRowsExport();
  const saveItem = useAppStore((s) => s.saveItem);
  const { run: serverSave, saving } = useServerSave();
  const chosen = (keys: string[]) => filtered.filter((i) => keys.includes(i.id));
  const exportChosen = (keys: string[]) =>
    exportRows(
      tr('nav:title.itemsAndServices'),
      {
        headers: [tr('common:table.name'), tr('common:table.sku'), tr('common:table.hsn'), tr('common:table.unit'), tr('common:table.onHand'), tr('common:table.price')],
        rows: chosen(keys).map((i) => [i.name, i.sku, i.hsnCode ?? '', i.unit, i.trackInventory ? (stock[i.id] ?? 0) : '', i.salePrice.minor / 100]),
      },
      tr('common:table.exportCancelled'),
    );
  const deactivate = async (keys: string[]) => {
    const items = chosen(keys).filter((i) => i.status !== 'inactive');
    if (!items.length) return;
    const res = await serverSave(
      () => {
        // The list's rows are whole items plus read-only stock figures, which aren't saved back.
        for (const { stockOnHand: _stock, low: _low, ...item } of items as (Item & { stockOnHand?: number; low?: boolean })[]) {
          saveItem({ ...item, status: 'inactive' });
        }
      },
      tr('common:table.deactivated', { count: items.length }),
      { icon: 'minus-circle-outline' },
    );
    if (res) {
      selection.clear();
      void pages.refetch();
    }
  };

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
  const filters = (
    <>
      {hasPos && categories.length ? (
        <FilterMenu
          icon="tag-outline"
          label={tr('inventory:catalog.allCategories')}
          value={categoryId}
          neutralValue="all"
          options={[{ value: 'all', label: tr('inventory:catalog.allCategories') }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          onChange={setCategoryId}
        />
      ) : null}
      {hasPos && brands.length ? (
        <FilterMenu
          icon="star-circle-outline"
          label={tr('inventory:catalog.allBrands')}
          value={brandId}
          neutralValue="all"
          options={[{ value: 'all', label: tr('inventory:catalog.allBrands') }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
          onChange={setBrandId}
        />
      ) : null}
    </>
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.md }}>
            <View style={{ flexBasis: 260, flexShrink: 1, minWidth: 200 }}>{tabs}</View>
            <View style={{ flexBasis: 340, flexShrink: 1, minWidth: 220 }}>
              <SearchBar compact value={query} onChangeText={setQuery} placeholder={tr('inventory:catalog.search')} />
            </View>
            {filters}
            <View style={{ flex: 1 }} />
            <Button title={tr('inventory:import.action')} icon="upload" variant="ghost" size="sm" onPress={() => router.push('/(app)/catalog/items/import' as never)} />
          </View>
          <DataTable
            columns={([
              { key: 'name', header: tr('common:table.name'), flex: 2, render: (i) => <Cell weight="600">{i.name}</Cell> },
              { key: 'sku', header: tr('common:table.sku'), width: 130, render: (i) => <Cell tone="muted">{i.sku}</Cell> },
              { key: 'hsn', secondary: true, header: tr('common:table.hsn'), width: 120, render: (i) => <Cell tone="muted">{i.hsnCode || '—'}</Cell> },
              {
                // Goods and services have their own tabs, so this column is the unit an item is sold in.
                key: 'unit',
                header: tr('common:table.unit'),
                secondary: true,
                width: 120,
                render: (i) => <Cell tone="muted">{unitShortName(i.unit) || '—'}</Cell>,
              },
              {
                key: 'onHand',
                header: tr('common:table.onHand'),
                width: 120,
                align: 'right',
                render: (i) => (
                  <Cell tone={i.trackInventory && (stock[i.id] ?? 0) <= (i.reorderLevel ?? 0) ? 'bad' : 'default'} mono>
                    {i.trackInventory ? `${formatQty(stock[i.id] ?? 0)} ${unitShortName(i.unit)}` : '—'}
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
            ] satisfies Column<(typeof filtered)[number]>[]).filter((c) => (tab === 'goods' || (c.key !== 'onHand' && c.key !== 'unit')) && (hasPos || c.key !== 'sku'))}
            rows={filtered}
            rowKey={(i) => i.id}
            onRowPress={(i) => router.push(`/(app)/catalog/items/${i.id}`)}
            rowLabel={(i) => i.name}
            {...pagedTableProps(pages, tr('common:table.loadFailed'), 'items')}
            loading={pages.isLoading || wrongKind}
            selectable
            selectedKeys={selection.selected}
            onSelectionChange={selection.setSelected}
            bulkActions={(keys) => (
              <>
                <Button title={tr('common:table.exportCsv')} icon="file-export-outline" variant="ghost" size="sm" onPress={() => void exportChosen(keys)} />
                <Button title={tr('common:table.deactivate')} icon="minus-circle-outline" variant="ghost" size="sm" loading={saving} onPress={() => void deactivate(keys)} />
              </>
            )}
            rowActions={(i) => [
              { key: 'open', label: tr('common:table.open'), icon: 'eye-outline', onPress: () => router.push(`/(app)/catalog/items/${i.id}`) },
              { key: 'edit', label: tr('common:action.edit'), icon: 'pencil-outline', onPress: () => router.push(`/(app)/catalog/items/${i.id}/edit`) },
            ]}
            empty={<EmptyState illustration="no-items" title={emptyTitle} message={emptyMessage} compact />}
          />
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
        {/* Filters on the left and Import on the right, as on a desktop. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.sm }}>
          {showFilters ? filters : null}
          <View style={{ flex: 1 }} />
          <Button title={tr('inventory:import.action')} icon="upload" variant="ghost" size="sm" onPress={() => router.push('/(app)/catalog/items/import' as never)} />
        </View>
        {pages.isError && !filtered.length ? (
          <Card padded={false}>
            <LoadFailed onRetry={pages.refetch} compact />
          </Card>
        ) : (pages.isLoading || wrongKind) && !filtered.length ? (
          <ListSkeleton kind="list" />
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
                subtitle={[hasPos ? item.sku : '', item.hsnCode ? `HSN ${item.hsnCode}` : ''].filter(Boolean).join(' · ') || undefined}
                meta={`${formatMoney(item.salePrice)} / ${unitShortName(item.unit)}`}
                right={
                  item.type === 'service' ? (
                    <Badge label={tr('inventory:catalog.service')} tone="neutral" size="sm" />
                  ) : item.trackInventory ? (
                    // What's on hand, as the desktop table shows it.
                    <Text variant="small" weight="700" tone={(stock[item.id] ?? 0) <= (item.reorderLevel ?? 0) ? 'bad' : 'default'} style={{ fontVariant: ['tabular-nums'] }}>
                      {formatQty(stock[item.id] ?? 0)} {unitShortName(item.unit)}
                    </Text>
                  ) : undefined
                }
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
