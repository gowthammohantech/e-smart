import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { Button } from '@esmart/ui/components/Button';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { DonutChart } from '@esmart/ui/components/charts/DonutChart';
import { useBaseCurrency, useExpenseCategories } from '../../../store/selectors';
import { useAppStore } from '../../../store/appStore';
import { useExpensePages, useExpenseSummary } from '../../../remote/queries';
import { useDebounced } from '../../../components/useDebounced';
import { pagedTableProps, useRowsExport, useTableSelection } from '../../../components/pagedTable';
import type { Expense } from '@esmart/core/types';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, resolveRange } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { zero, type Money } from '@esmart/core/lib/money';
import { dateRangeLabel, paymentMethodLabel } from '@esmart/core/labels';
import { SHOW_SCROLLBAR, useBreakpoint, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { SplitPane } from '@esmart/ui/components/Layout';
import { FilterMenu } from '@esmart/ui/components/FilterMenu';
import { presetParam, useQueryParams } from '../../../navigation/queryParams';
import { CardRowsSkeleton, MoreRowsSkeleton } from '../../../components/ScreenSkeleton';

const DEFAULT_RANGE: DateRangePreset = 'last30';

export default function ExpensesList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'nav', 'purchases']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  const categories = useExpenseCategories();

  const [query, setQuery] = useState('');
  // Range and category live in the URL (`?range=thisMonth&category=…`); search stays local.
  const [params, setParams] = useQueryParams();
  const range = presetParam(params.range, DEFAULT_RANGE);
  const categoryId = params.category ?? null;
  const setRange = (r: DateRangePreset) => setParams({ range: r === DEFAULT_RANGE ? undefined : r });
  const setCategoryId = (id: string | null) => setParams({ category: id ?? undefined });
  const desktop = useIsDesktop();
  // Too narrow for the summary column too; the table footer has the totals.
  const narrow = useBreakpoint() === 'tablet';

  // Read from the server 50 at a time; the totals and the category split cover every page.
  const search = useDebounced(query);
  const filter = useMemo(() => {
    const r = range === 'all' ? undefined : resolveRange(range);
    return { from: r?.from, to: r?.to, q: search, categoryId: categoryId ?? undefined };
  }, [range, search, categoryId]);
  const pages = useExpensePages(filter);
  const summary = useExpenseSummary(filter);

  const filtered = pages.rows as unknown as Expense[];

  const count = summary.data?.count ?? filtered.length;
  const total = (summary.data?.total as Money | undefined) ?? zero(baseCurrency);
  const taxTotal = (summary.data?.tax as Money | undefined) ?? zero(baseCurrency);
  const slices = (summary.data?.byCategory ?? []).map((b) => ({
    label: categories.find((c) => c.id === b.categoryId)?.name ?? tr('purchases:expense.otherCategory'),
    value: b.total as Money,
  }));
  // Nothing recorded at all, as against nothing matching the filters.
  const noneAtAll = range === 'all' && !search && !categoryId && summary.data?.count === 0 && !filtered.length;
  const loading = (pages.isLoading || summary.isLoading) && !filtered.length;
  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };
  // Desktop bulk action: the chosen expenses as a CSV.
  const selection = useTableSelection(filter);
  const exportRows = useRowsExport();
  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name ?? tr('purchases:expense.uncategorised');
  const exportChosen = (keys: string[]) =>
    exportRows(
      tr('nav:title.expenses'),
      {
        headers: [tr('common:table.number'), tr('common:table.date'), tr('common:table.category'), tr('common:table.reference'), tr('common:table.tax'), tr('common:table.amount')],
        rows: filtered
          .filter((e) => keys.includes(e.id))
          .map((e) => [e.number, e.date, categoryName(e.categoryId), e.notes || e.reference || '', e.taxAmount.minor / 100, e.amount.minor / 100]),
      },
      tr('common:table.exportCancelled'),
    );

  const moreFooter = pages.hasNextPage ? (
    <View style={{ alignItems: 'center', paddingVertical: t.spacing.md }}>
      {pages.isFetchingNextPage ? <MoreRowsSkeleton kind="list" /> : <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" onPress={loadMore} />}
    </View>
  ) : null;

  const rangeChips = DATE_RANGE_PRESET_KEYS.map((p) => {
    const active = range === p;
    return (
      <Pressable
        key={p}
        onPress={() => setRange(p)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={{
          paddingHorizontal: t.spacing.md,
          paddingVertical: 6,
          borderRadius: t.radius.pill,
          backgroundColor: active ? t.c.primary : t.c.card,
          borderWidth: active ? 0 : 1,
          borderColor: t.c.line,
        }}
      >
        <Text variant="caption" weight="600" style={{ color: active ? t.c.onPrimary : t.c.muted }}>
          {dateRangeLabel(tr, p)}
        </Text>
      </Pressable>
    );
  });

  const categoryChips = (
    <>
      <Pressable
        onPress={() => setCategoryId(null)}
        accessibilityRole="button"
        style={{
          paddingHorizontal: t.spacing.md,
          paddingVertical: 6,
          borderRadius: t.radius.pill,
          backgroundColor: !categoryId ? t.c.primary : t.c.card,
          borderWidth: !categoryId ? 0 : 1,
          borderColor: t.c.line,
        }}
      >
        <Text variant="caption" weight="600" style={{ color: !categoryId ? t.c.onPrimary : t.c.muted }}>{tr('purchases:expense.allCategories')}</Text>
      </Pressable>
      {categories.map((c) => {
        const active = categoryId === c.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => setCategoryId(active ? null : c.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              paddingHorizontal: t.spacing.md,
              paddingVertical: 6,
              borderRadius: t.radius.pill,
              backgroundColor: active ? t.c.primary : t.c.card,
              borderWidth: active ? 0 : 1,
              borderColor: t.c.line,
            }}
          >
            <Text variant="caption" weight="600" style={{ color: active ? t.c.onPrimary : t.c.muted }}>
              {c.name}
            </Text>
          </Pressable>
        );
      })}
    </>
  );

  // A desktop: the expenses as a table, with totals and the category split
  // in a side column.
  if (desktop) {
    return (
      <View style={{ flex: 1, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg, gap: t.spacing.md }}>
        <Stack.Screen options={{ title: tr('nav:title.expenses') }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: t.spacing.sm }}>
          <View style={{ width: 380 }}>
            <SearchBar compact value={query} onChangeText={setQuery} placeholder={tr('purchases:expense.search')} />
          </View>
          <FilterMenu
            icon="calendar-range"
            label={tr('common:filters.dateRange')}
            value={range}
            neutralValue={'all' as DateRangePreset}
            options={DATE_RANGE_PRESET_KEYS.map((p) => ({ value: p, label: dateRangeLabel(tr, p) }))}
            onChange={setRange}
          />
          <FilterMenu
            icon="shape-outline"
            label={tr('purchases:expense.allCategories')}
            value={categoryId ?? 'all'}
            neutralValue="all"
            options={[{ value: 'all', label: tr('purchases:expense.allCategories') }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            onChange={(v) => setCategoryId(v === 'all' ? null : v)}
          />
          {/* How many match and what they add up to, at the right end of the filter row. */}
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.md }}>
            <Text variant="small" tone="muted">
              {tr('purchases:expense.entriesWithTax', { count, tax: formatMoney(taxTotal) })}
            </Text>
            <Text variant="title" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(total)}
            </Text>
          </View>
        </View>
        <SplitPane
          sideWidth={300}
          main={
            <View style={{ flex: 1 }}>
              <DataTable
                columns={[
                  { key: 'number', header: tr('common:table.number'), width: 150, render: (e) => <Cell weight="600">{e.number}</Cell> },
                  { key: 'date', header: tr('common:table.date'), width: 110, render: (e) => <Cell tone="muted">{formatDate(e.date, 'dd MMM yyyy')}</Cell> },
                  {
                    key: 'category',
                    header: tr('common:table.category'),
                    flex: 1.4,
                    render: (e) => {
                      const cat = categories.find((c) => c.id === e.categoryId);
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, maxWidth: '100%' }}>
                          <Icon name={(cat?.icon ?? 'cash') as IconName} size={16} color={cat?.color ?? t.c.muted} />
                          <Cell>{cat?.name ?? tr('purchases:expense.uncategorised')}</Cell>
                        </View>
                      );
                    },
                  },
                  { key: 'notes', secondary: true, header: tr('common:table.reference'), flex: 1.6, render: (e) => <Cell tone="muted">{e.notes || e.reference || '—'}</Cell> },
                  { key: 'tax', secondary: true, header: tr('common:table.tax'), width: 120, align: 'right', render: (e) => <Cell tone="muted" mono>{formatMoney(e.taxAmount)}</Cell> },
                  { key: 'amount', header: tr('common:table.amount'), width: 120, align: 'right', render: (e) => <Cell weight="600" mono>{formatMoney(e.amount)}</Cell> },
                ]}
                rows={filtered}
                rowKey={(e) => e.id}
                onRowPress={(e) => router.push(`/(app)/expenses/${e.id}`)}
                rowLabel={(e) => `${e.number}, ${formatMoney(e.amount)}`}
                {...pagedTableProps(pages, tr('common:table.loadFailed'), 'expenses')}
                loading={loading}
                totalCount={summary.data ? summary.data.count + (filtered.length - pages.rows.length) : undefined}
                selectable
                selectedKeys={selection.selected}
                onSelectionChange={selection.setSelected}
                bulkActions={(keys) => (
                  <Button title={tr('common:table.exportCsv')} icon="file-export-outline" variant="ghost" size="sm" onPress={() => void exportChosen(keys)} />
                )}
                rowActions={(e) => [
                  { key: 'open', label: tr('common:table.open'), icon: 'eye-outline', onPress: () => router.push(`/(app)/expenses/${e.id}`) },
                  { key: 'edit', label: tr('common:action.edit'), icon: 'pencil-outline', onPress: () => router.push(`/(app)/expenses/${e.id}/edit`) },
                ]}
                empty={
                  <EmptyState
                    illustration="no-expenses"
                    icon="receipt-text-outline"
                    title={tr('purchases:expense.noExpenses')}
                    message={noneAtAll ? tr('purchases:expense.emptyFirst') : tr('purchases:expense.emptyFiltered')}
                    compact
                  />
                }
              />
            </View>
          }
          side={
            narrow ? null : (
            <>
              <StatTile label={tr('purchases:expense.totalSpent')} value={total} tone="warn" icon="receipt-text-outline" caption={tr('purchases:expense.entries', { count })} loading={!summary.data && summary.isLoading} />
              <StatTile label={tr('purchases:expense.inputTax')} value={taxTotal} icon="percent-outline" caption={tr('purchases:expense.claimable')} loading={!summary.data && summary.isLoading} />
              {slices.length > 0 ? (
                <Card>
                  <DonutChart slices={slices} centerLabel={tr('purchases:expense.total')} />
                </Card>
              ) : null}
            </>
            )
          }
        />
        <Fab icon="plus" onPress={() => router.push('/(app)/expenses/new')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.expenses') }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }}>
        <SearchBar compact value={query} onChangeText={setQuery} placeholder={tr('purchases:expense.search')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm, paddingRight: t.spacing.lg }}>
          {rangeChips}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        // The next page loads before the end is reached, so scrolling rarely waits.
        onScroll={({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
          if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600) loadMore();
        }}
        scrollEventThrottle={200}
      >
        <StatRow>
          <StatTile label={tr('purchases:expense.totalSpent')} value={total} tone="warn" icon="receipt-text-outline" caption={tr('purchases:expense.entries', { count })} loading={!summary.data && summary.isLoading} />
          <StatTile label={tr('purchases:expense.inputTax')} value={taxTotal} icon="percent-outline" caption={tr('purchases:expense.claimable')} loading={!summary.data && summary.isLoading} />
        </StatRow>

        {slices.length > 0 ? (
          <Card style={{ marginTop: t.spacing.md }}>
            <DonutChart slices={slices} centerLabel={tr('purchases:expense.total')} />
          </Card>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm, paddingVertical: t.spacing.lg }}>
          {categoryChips}
        </ScrollView>

        <Card padded={false}>
          {loading ? (
            <CardRowsSkeleton kind="list" />
          ) : filtered.length === 0 ? (
            <EmptyState
              illustration="no-expenses"
              icon="receipt-text-outline"
              title={tr('purchases:expense.noExpenses')}
              message={noneAtAll ? tr('purchases:expense.emptyFirst') : tr('purchases:expense.emptyFiltered')}
              actionLabel={noneAtAll ? tr('common:quickAction.addExpense') : undefined}
              onAction={noneAtAll ? () => router.push('/(app)/expenses/new') : undefined}
              compact
            />
          ) : (
            filtered.map((e, i) => {
              const cat = categories.find((c) => c.id === e.categoryId);
              return (
                <Pressable
                  key={e.id}
                  onPress={() => router.push(`/(app)/expenses/${e.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${cat?.name ?? tr('nav:title.expense')}, ${formatMoney(e.amount)}`}
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
                      width: 38,
                      height: 38,
                      borderRadius: t.radius.sm,
                      backgroundColor: `${cat?.color ?? t.c.muted}22`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon
                      name={(cat?.icon ?? 'cash') as IconName}
                      size={19}
                      color={cat?.color ?? t.c.muted}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {cat?.name ?? tr('purchases:expense.uncategorised')}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {/* The number first, as the desktop table has it, so an expense can be found by it. */}
                      {e.number ? `${e.number} · ` : ''}
                      {formatDate(e.date, 'dd MMM')} · {paymentMethodLabel(tr, e.method)}
                      {e.notes ? ` · ${e.notes}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="body" weight="700">
                      {formatMoney(e.amount)}
                    </Text>
                    {e.recurrence !== 'none' ? <Badge label={tr(`purchases:recurrence.${e.recurrence}`)} tone="info" size="sm" /> : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
        {moreFooter}
      </ScrollView>

      <Fab icon="plus" onPress={() => router.push('/(app)/expenses/new')} />
    </View>
  );
}
