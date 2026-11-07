import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { Button } from '@esmart/ui/components/Button';
import { FilterMenu } from '@esmart/ui/components/FilterMenu';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Badge } from '@esmart/ui/components/Badge';
import { Avatar } from '@esmart/ui/components/Avatar';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import type { Payment, PaymentDirection } from '@esmart/core/types';
import { dateRangeLabel, paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney } from '@esmart/core/lib/format';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, resolveRange } from '@esmart/core/lib/date';
import { zero, type Money } from '@esmart/core/lib/money';
import { useAppStore } from '../../store/appStore';
import { useBaseCurrency } from '../../store/selectors';
import { isOpen } from '../../remote/outbox';
import { usePaymentPages, usePaymentSummary } from '../../remote/queries';
import { useDebounced } from '../../components/useDebounced';
import { pagedTableProps, useRowsExport, useTableSelection } from '../../components/pagedTable';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { presetParam, useQueryParams } from '../../navigation/queryParams';

export function PaymentListView({ direction }: { direction: PaymentDirection }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'sales', 'nav']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();

  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  // The range lives in the URL (`?range=thisMonth`); search stays local.
  const [params, setParams] = useQueryParams();
  const range = presetParam(params.range, 'all');
  const setRange = (r: DateRangePreset) => setParams({ range: r === 'all' ? undefined : r });
  const desktop = useIsDesktop();

  // Read from the server 50 at a time; the count and total cover every page.
  const filter = useMemo(() => {
    const r = range === 'all' ? undefined : resolveRange(range);
    return { direction, from: r?.from, to: r?.to, q: search };
  }, [direction, range, search]);
  const pages = usePaymentPages(filter);
  const summary = usePaymentSummary(filter);

  // Recorded offline and not on the server yet: shown first, so a new payment doesn't seem lost.
  const companyId = useAppStore((s) => s.activeCompanyId);
  const stored = useAppStore((s) => s.payments);
  const syncQueue = useAppStore((s) => s.syncQueue);
  const filtered = useMemo<(Payment & { partyName?: string })[]>(() => {
    const unsent = new Set(syncQueue.filter(isOpen).map((e) => e.entityId));
    const parties = useAppStore.getState().parties;
    const waiting = unsent.size
      ? stored.filter((p) => p.companyId === companyId && p.direction === direction && unsent.has(p.id)).map((p) => ({ ...p, partyName: parties.find((x) => x.id === p.partyId)?.name }))
      : [];
    const seen = new Set(waiting.map((p) => p.id));
    return [...waiting, ...(pages.rows as unknown as (Payment & { partyName?: string })[]).filter((p) => !seen.has(p.id))];
  }, [pages.rows, stored, syncQueue, companyId, direction]);
  const nameOf = (p: { partyName?: string }) => p.partyName ?? tr('common:placeholder.unknown');
  const count = summary.data?.count ?? filtered.length;
  const total = (summary.data?.total as Money | undefined) ?? zero(baseCurrency);
  // Nothing recorded at all, as against nothing matching the search or range.
  const noneAtAll = range === 'all' && !search && summary.data?.count === 0 && !filtered.length;
  const loading = (pages.isLoading || summary.isLoading) && !filtered.length;
  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };
  // Desktop bulk action: the chosen payments as a CSV.
  const selection = useTableSelection(filter);
  const exportRows = useRowsExport();
  const exportChosen = (keys: string[]) =>
    exportRows(
      direction === 'received' ? tr('nav:title.paymentsReceived') : tr('nav:title.paymentsMade'),
      {
        headers: [tr('common:table.number'), direction === 'received' ? tr('common:table.customer') : tr('common:table.supplier'), tr('common:table.date'), tr('common:table.method'), tr('common:table.reference'), tr('common:table.amount')],
        rows: filtered
          .filter((p) => keys.includes(p.id))
          .map((p) => [p.number, nameOf(p), p.date, paymentMethodLabel(tr, p.method), p.reference ?? '', p.amount.minor / 100]),
      },
      tr('common:table.exportCancelled'),
    );

  const moreFooter = pages.hasNextPage ? (
    <View style={{ alignItems: 'center', paddingVertical: t.spacing.md }}>
      {pages.isFetchingNextPage ? <ActivityIndicator color={t.c.muted} /> : <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" onPress={loadMore} />}
    </View>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <View
        style={
          desktop
            ? { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }
            : { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }
        }
      >
        <View style={desktop ? { width: 300 } : undefined}>
          <SearchBar compact value={query} onChangeText={setQuery} placeholder={tr('sales:list.search')} />
        </View>
        {desktop ? (
          <FilterMenu
            icon="calendar-range"
            label={tr('common:filters.dateRange')}
            value={range}
            neutralValue={'all' as DateRangePreset}
            options={(['all', ...DATE_RANGE_PRESET_KEYS.filter((k) => k !== 'all')] as DateRangePreset[]).map((p) => ({ value: p, label: dateRangeLabel(tr, p) }))}
            onChange={setRange}
          />
        ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: t.spacing.sm, paddingRight: t.spacing.lg }}
        >
          {(['all', ...DATE_RANGE_PRESET_KEYS.filter((k) => k !== 'all')] as DateRangePreset[]).map((p) => {
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
          })}
        </ScrollView>
        )}
        {desktop ? (
          // How many match and what they add up to, at the right end of the filter row.
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.md }}>
            <Text variant="small" tone="muted">
              {tr('sales:list.count', { count })}
            </Text>
            <Text variant="title" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(total)}
            </Text>
          </View>
        ) : (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" tone="muted">
            {tr('sales:list.count', { count })}
          </Text>
          <Text variant="caption" weight="700" tone={direction === 'received' ? 'good' : 'bad'}>
            {formatMoney(total)}
          </Text>
        </View>
        )}
      </View>

      {desktop ? (
        <View style={{ flex: 1, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg }}>
          <DataTable
            columns={[
              { key: 'number', header: tr('common:table.number'), width: 150, render: (p) => <Cell weight="600">{p.number}</Cell> },
              {
                key: 'party',
                header: direction === 'received' ? tr('common:table.customer') : tr('common:table.supplier'),
                flex: 2,
                render: (p) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, maxWidth: '100%' }}>
                    <Avatar name={nameOf(p)} size={26} />
                    <Cell>{nameOf(p)}</Cell>
                  </View>
                ),
              },
              { key: 'date', header: tr('common:table.date'), width: 120, render: (p) => <Cell tone="muted">{formatDate(p.date, 'dd MMM yyyy')}</Cell> },
              { key: 'method', secondary: true, header: tr('common:table.method'), width: 130, render: (p) => <Cell tone="muted">{paymentMethodLabel(tr, p.method)}</Cell> },
              { key: 'reference', secondary: true, header: tr('common:table.reference'), flex: 1, render: (p) => <Cell tone="muted">{p.reference || '—'}</Cell> },
              {
                key: 'applied',
                header: tr('common:table.applied'),
                width: 130,
                render: (p) =>
                  p.unallocated.minor > 0 ? (
                    <Badge label={tr('sales:list.advance')} tone="warning" size="sm" />
                  ) : (
                    <Badge label={tr('sales:list.appliedCount', { count: p.allocations.length })} tone="neutral" size="sm" />
                  ),
              },
              {
                key: 'amount',
                header: tr('common:table.amount'),
                width: 150,
                align: 'right',
                render: (p) => (
                  <Cell weight="700" tone={direction === 'received' ? 'good' : 'bad'} mono>
                    {formatMoney(p.amount)}
                  </Cell>
                ),
              },
            ]}
            rows={filtered}
            rowKey={(p) => p.id}
            onRowPress={(p) => router.push(`/(app)/payments/${p.id}`)}
            rowLabel={(p) => `${p.number}, ${formatMoney(p.amount)}`}
            {...pagedTableProps(pages, tr('common:table.loadFailed'), `payments-${direction}`)}
            loading={loading}
            totalCount={summary.data ? summary.data.count + (filtered.length - pages.rows.length) : undefined}
            selectable
            selectedKeys={selection.selected}
            onSelectionChange={selection.setSelected}
            bulkActions={(keys) => (
              <Button title={tr('common:table.exportCsv')} icon="file-export-outline" variant="ghost" size="sm" onPress={() => void exportChosen(keys)} />
            )}
            rowActions={(p) => [{ key: 'open', label: tr('common:table.open'), icon: 'eye-outline', onPress: () => router.push(`/(app)/payments/${p.id}`) }]}
            empty={<EmptyState illustration="no-payments" icon="cash-remove" title={tr('sales:list.none')} message={noneAtAll ? tr('sales:list.emptyBody') : tr('common:filters.noMatch')} compact />}
          />
        </View>
      ) : (
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        // The next page loads before the end is reached, so scrolling rarely waits.
        onScroll={({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
          if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600) loadMore();
        }}
        scrollEventThrottle={200}
      >
        <Card padded={false}>
          {loading ? (
            <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
          ) : filtered.length === 0 ? (
            <EmptyState
              illustration="no-payments"
              icon="cash-remove"
              title={tr('sales:list.none')}
              message={noneAtAll ? tr('sales:list.emptyBody') : tr('common:filters.noMatch')}
              actionLabel={noneAtAll ? tr('common:action.recordPayment') : undefined}
              onAction={noneAtAll ? () => router.push(`/(app)/payments/new?direction=${direction}`) : undefined}
              compact
            />
          ) : (
            filtered.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/(app)/payments/${p.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${p.number}, ${formatMoney(p.amount)}`}
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
                <Avatar name={nameOf(p)} size={38} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="body" weight="600" numberOfLines={1}>
                    {nameOf(p)}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {p.number} · {formatDate(p.date, 'dd MMM')} · {paymentMethodLabel(tr, p.method)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text variant="body" weight="700" tone={direction === 'received' ? 'good' : 'bad'}>
                    {formatMoney(p.amount)}
                  </Text>
                  {p.unallocated.minor > 0 ? (
                    <Badge label={tr('sales:list.advance')} tone="warning" size="sm" />
                  ) : (
                    <Badge label={tr('sales:list.appliedCount', { count: p.allocations.length })} tone="neutral" size="sm" />
                  )}
                </View>
              </Pressable>
            ))
          )}
        </Card>
        {moreFooter}
      </ScrollView>
      )}

      <Fab icon="plus" onPress={() => router.push(`/(app)/payments/new?direction=${direction}`)} />
    </View>
  );
}
