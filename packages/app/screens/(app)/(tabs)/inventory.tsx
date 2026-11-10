import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { AppHeader } from '../../../components/AppHeader';
import { SectionHeader } from '@esmart/ui/components/Screen';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { Badge } from '@esmart/ui/components/Badge';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { Segmented } from '@esmart/ui/components/Field';
import { Sheet } from '@esmart/ui/components/Sheet';
import { useBaseCurrency, useCanOpen } from '../../../store/selectors';
import { unitShortName } from '@esmart/core/data/masters';
import { LoadFailed } from '../../../features/company/LoadFailed';
import { useAppStore } from '../../../store/appStore';
import { useItemPages, useServerReport } from '../../../remote/queries';
import { useDebounced } from '../../../components/useDebounced';
import { formatMoney, formatQty } from '@esmart/core/lib/format';
import { isLowStock } from '@esmart/core/domain/stockLedger';
import { today } from '@esmart/core/lib/date';
import { zero, type Money } from '@esmart/core/lib/money';
import type { Item } from '@esmart/core/types';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { Menu, MenuItem } from '@esmart/ui/components/Menu';
import type { PageActionAnchor } from '@esmart/ui/components/PageHeader';
import { useQueryParams } from '../../../navigation/queryParams';
import { CardRowsSkeleton, MoreRowsSkeleton } from '../../../components/ScreenSkeleton';

type Filter = 'all' | 'low' | 'out' | 'services';
const FILTERS: Filter[] = ['all', 'low', 'out', 'services'];

export default function InventoryTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['inventory', 'common', 'nav', 'reports']);
  const router = useRouter();
  const desktop = useIsDesktop();

  const baseCurrency = useBaseCurrency();
  // The branch picked in the header, as the device's figures were.
  const branchId = useAppStore((s) => s.activeBranchId) || undefined;

  const [query, setQuery] = useState('');
  // The stock filter lives in the URL (`?filter=low`); search stays local.
  const [params, setParams] = useQueryParams();
  const filter: Filter = FILTERS.includes(params.filter as Filter) ? (params.filter as Filter) : 'all';
  const setFilter = (f: Filter) => setParams({ filter: f === 'all' ? undefined : f });
  const [actionsOpen, setActionsOpen] = useState(false);
  // On a desktop "New" drops a menu from the header button instead of opening a sheet.
  const [newMenu, setNewMenu] = useState<PageActionAnchor | null>(null);
  const canOpen = useCanOpen();
  // The header button passes where it sits, and the menu hangs from it; from the "N" key, the sheet.
  const openNew = (anchor?: PageActionAnchor) => {
    if (desktop && anchor) setNewMenu(anchor);
    else setActionsOpen(true);
  };
  const newActions = [
    { label: tr('common:quickAction.addItem'), icon: 'tag-plus-outline' as const, route: '/(app)/catalog/items/new' },
    { label: tr('nav:title.stockAdjustment'), icon: 'tune' as const, route: '/(app)/inventory/adjust' },
    { label: tr('nav:title.branchTransfer'), icon: 'swap-horizontal' as const, route: '/(app)/inventory/transfer' },
    { label: tr('inventory:hub.setOpeningStock'), icon: 'database-import-outline' as const, route: '/(app)/inventory/opening-stock' },
    { label: tr('inventory:hub.scanBarcode'), icon: 'barcode-scan' as const, route: '/(app)/inventory/scan' },
    { label: tr('nav:title.stockMovements'), icon: 'format-list-bulleted' as const, route: '/(app)/inventory/movements' },
  ]
    // Only what this plan and these modules can open, as Home's sheet does.
    .filter((a) => canOpen(a.route));

  // Worked out by the server: the figures from its stock report, the list a page at a time.
  const day = today();
  const stockQuery = useServerReport<{ totalValue?: Money; lowCount?: number; outCount?: number; trackedCount?: number }>('stock', { from: day, to: day, branchId });
  const stockReport = stockQuery.data;
  // Failed: a dash, never a ₹0 that reads as an empty store.
  const reportFailed = !stockReport && stockQuery.isError;
  const report = {
    totalValue: stockReport?.totalValue ?? zero(baseCurrency),
    lowCount: stockReport?.lowCount ?? 0,
    outCount: stockReport?.outCount ?? 0,
    trackedCount: stockReport?.trackedCount ?? 0,
  };
  const search = useDebounced(query);
  const pages = useItemPages({ q: search, branchId, stock: filter === 'low' ? 'low' : filter === 'out' ? 'out' : filter === 'services' ? 'untracked' : undefined });
  const filtered = pages.rows as unknown as (Item & { stockOnHand?: number })[];
  const stock: Record<string, number> = Object.fromEntries(filtered.map((i) => [i.id, i.stockOnHand ?? 0]));
  // A filter change keeps the last filter's rows as placeholder (stocked items under "Services"); shimmer instead.
  const listPending = (pages.isLoading && !filtered.length) || pages.isPlaceholderData;
  const noneAtAll = filter === 'all' && !search && !pages.isLoading && !filtered.length;
  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title={tr('inventory:hub.title')} subtitle={tr('inventory:hub.subtitle')} />

      <ScrollView
        // A desktop has no floating button to clear at the bottom.
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: desktop ? t.spacing.xxl : 120 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        // The next page loads before the end is reached, so scrolling rarely waits.
        onScroll={({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
          if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600) loadMore();
        }}
        scrollEventThrottle={200}
      >
        <StatRow>
          <StatTile
            label={tr('inventory:hub.stockValue')}
            value={reportFailed ? '—' : report.totalValue}
            icon="warehouse"
            loading={!stockReport && !reportFailed}
            caption={reportFailed ? tr('reports:dash.state.failedTitle') : tr('inventory:hub.trackedItems', { count: report.trackedCount })}
          />
          <StatTile
            label={tr('inventory:hub.lowStock')}
            value={reportFailed ? '—' : String(report.lowCount)}
            loading={!stockReport && !reportFailed}
            tone="warn"
            icon="alert-outline"
            caption={reportFailed ? undefined : tr('inventory:hub.outOfStock', { count: report.outCount })}
            onPress={() => router.push('/(app)/inventory/low-stock')}
          />
        </StatRow>

        <View style={{ gap: t.spacing.md, marginTop: t.spacing.xl }}>
          <SearchBar
            compact
            value={query}
            onChangeText={setQuery}
            placeholder={tr('inventory:hub.searchPlaceholder')}
            // The camera scan is a phone's; a desktop scans from "New" (a USB scanner types into the search).
            right={
              desktop ? undefined : (
              <Pressable
                onPress={() => router.push('/(app)/inventory/scan')}
                // A full 44pt target, not just the glyph.
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={tr('inventory:hub.scanBarcode')}
                style={{ width: 44, height: 36, alignItems: 'center', justifyContent: 'center', marginRight: -t.spacing.sm }}
              >
                <Icon name="barcode-scan" size={20} color={t.c.primary} />
              </Pressable>
              )
            }
          />
          <Segmented
            options={[
              { value: 'all', label: tr('inventory:hub.all') },
              { value: 'low', label: tr('inventory:hub.low') },
              { value: 'out', label: tr('inventory:hub.out') },
              { value: 'services', label: tr('inventory:catalog.services') },
            ]}
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            size="sm"
          />
        </View>

        <SectionHeader
          title={
            // Only what's loaded is counted; more pages to come show as "50+ items". No "0 items" before the list is in.
            listPending ? tr('inventory:catalog.items') : pages.hasNextPage ? tr('inventory:hub.itemCountMore', { count: filtered.length }) : tr('inventory:hub.itemCount', { count: filtered.length })
          } action={tr('inventory:hub.movements')} onAction={() => router.push('/(app)/inventory/movements')} />

        {desktop && !(pages.isError && !filtered.length) && !(filtered.length === 0 && !listPending) ? (
          // A desktop reads the stock as a table: name, SKU, price, on hand and its state in columns.
          <DataTable
            scroll={false}
            loading={listPending}
            rows={listPending ? [] : filtered}
            rowKey={(i) => i.id}
            rowLabel={(i) => i.name}
            onRowPress={(i) => router.push(`/(app)/catalog/items/${i.id}`)}
            columns={[
              { key: 'name', header: tr('common:table.name'), flex: 2, render: (i) => <Cell weight="600">{i.name}</Cell> },
              { key: 'sku', header: tr('common:table.sku'), width: 140, render: (i) => <Cell tone="muted">{i.sku || '—'}</Cell> },
              { key: 'unit', header: tr('common:table.unit'), width: 100, secondary: true, render: (i) => <Cell tone="muted">{unitShortName(i.unit) || i.unit || '—'}</Cell> },
              { key: 'price', header: tr('common:table.price'), width: 150, align: 'right', render: (i) => <Cell mono>{formatMoney(i.salePrice)}</Cell> },
              {
                key: 'onHand',
                header: tr('common:table.onHand'),
                width: 130,
                align: 'right',
                render: (i) => {
                  const onHand = stock[i.id] ?? 0;
                  const low = i.trackInventory && isLowStock(i, onHand);
                  return i.trackInventory ? (
                    <Cell weight="700" tone={onHand <= 0 ? 'bad' : low ? 'warn' : 'default'} mono>
                      {formatQty(onHand)}
                    </Cell>
                  ) : (
                    <Cell tone="muted">—</Cell>
                  );
                },
              },
              {
                key: 'status',
                header: tr('common:table.status'),
                width: 120,
                render: (i) => {
                  const onHand = stock[i.id] ?? 0;
                  if (!i.trackInventory) return <Badge label={tr('inventory:hub.service')} tone="neutral" size="sm" />;
                  if (onHand <= 0) return <Badge label={tr('inventory:hub.out')} tone="danger" size="sm" />;
                  if (isLowStock(i, onHand)) return <Badge label={tr('inventory:hub.low')} tone="warning" size="sm" />;
                  return null;
                },
              },
            ]}
          />
        ) : (
        <Card padded={false}>
          {pages.isError && !filtered.length ? (
            <LoadFailed onRetry={pages.refetch} compact />
          ) : listPending ? (
            <CardRowsSkeleton kind="list" />
          ) : filtered.length === 0 ? (
            <EmptyState
              illustration="no-items"
              icon="package-variant"
              title={tr('inventory:hub.nothingHere')}
              message={noneAtAll ? tr('inventory:hub.emptyFirst') : tr('inventory:hub.emptyFilter')}
              actionLabel={noneAtAll ? tr('common:quickAction.addItem') : undefined}
              onAction={noneAtAll ? () => router.push('/(app)/catalog/items/new') : undefined}
              compact
            />
          ) : (
            filtered.map((item, i) => {
              const onHand = stock[item.id] ?? 0;
              const low = item.trackInventory && isLowStock(item, onHand);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/(app)/catalog/items/${item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    item.trackInventory
                      ? tr('inventory:hub.a11yStock', { name: item.name, qty: formatQty(onHand) })
                      : tr('inventory:hub.a11yService', { name: item.name })
                  }
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    padding: t.spacing.lg,
                    borderBottomWidth: i < filtered.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.c.line,
                    backgroundColor: pressed ? t.c.card2 : 'transparent',
                  })}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: t.radius.sm,
                      backgroundColor: item.trackInventory ? t.c.chip : t.c.mutedSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon
                      name={item.trackInventory ? 'package-variant-closed' : 'hammer-wrench'}
                      size={19}
                      color={item.trackInventory ? t.c.primary : t.c.muted}
                    />
                  </View>

                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {item.sku} · {formatMoney(item.salePrice)} / {unitShortName(item.unit) || item.unit}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {item.trackInventory ? (
                      <>
                        <Text
                          variant="body"
                          weight="700"
                          tone={onHand <= 0 ? 'bad' : low ? 'warn' : 'default'}
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          {formatQty(onHand)}
                        </Text>
                        {onHand <= 0 ? (
                          <Badge label={tr('inventory:hub.out')} tone="danger" size="sm" />
                        ) : low ? (
                          <Badge label={tr('inventory:hub.low')} tone="warning" size="sm" />
                        ) : (
                          <Text variant="micro" tone="muted">
                            {unitShortName(item.unit) || item.unit}
                          </Text>
                        )}
                      </>
                    ) : (
                      <Badge label={tr('inventory:hub.service')} tone="neutral" size="sm" />
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
        )}
        {pages.isFetchingNextPage ? <MoreRowsSkeleton kind="list" /> : null}
      </ScrollView>

      <Fab icon="plus" onPress={openNew} />
      <Menu anchor={newMenu} onClose={() => setNewMenu(null)} align="right" width={260}>
        {newActions.map((a) => (
          <MenuItem
            key={a.label}
            icon={a.icon}
            label={a.label}
            onPress={() => {
              setNewMenu(null);
              router.push(a.route as never);
            }}
          />
        ))}
      </Menu>

      <Sheet visible={actionsOpen} onClose={() => setActionsOpen(false)} title={tr('inventory:hub.actions')}>
        {newActions.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => {
              setActionsOpen(false);
              router.push(a.route as never);
            }}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              paddingVertical: t.spacing.md,
              paddingHorizontal: t.spacing.lg,
              backgroundColor: pressed ? t.c.card2 : 'transparent',
            })}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: t.radius.sm,
                backgroundColor: t.c.chip,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={a.icon} size={20} color={t.c.primary} />
            </View>
            <Text variant="body" weight="500" style={{ flex: 1 }}>
              {a.label}
            </Text>
            <Icon name="chevron-right" size={18} color={t.c.muted} />
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}
