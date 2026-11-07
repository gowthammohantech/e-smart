import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { FilterMenu } from '@esmart/ui/components/FilterMenu';
import { SplitPane } from '@esmart/ui/components/Layout';
import { ListRow } from '@esmart/ui/components/ListRow';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR, useBreakpoint, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { accountFor } from '@esmart/core/domain/ledger/accounts';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, resolveRange } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money, zero, type Money } from '@esmart/core/lib/money';
import { dateRangeLabel } from '@esmart/core/labels';
import type { Voucher } from '@esmart/core/types';
import { useServerBook, useVoucherPages, useVoucherSummary } from '../../../remote/queries';
import { useBaseCurrency, useParties } from '../../../store/selectors';
import { presetParam, useQueryParams } from '../../../navigation/queryParams';
import { useAccountName } from '../../../features/books/names';
import { useDebounced } from '../../../components/useDebounced';
import { pagedTableProps, useRowsExport, useTableSelection } from '../../../components/pagedTable';

const DEFAULT_RANGE: DateRangePreset = 'last30';

/** What a receipt is for: the account it credits (an income, a loan, capital). */
export const incomeLine = (v: Voucher) => v.lines.find((l) => l.credit.minor > 0);
const amountOf = (v: Voucher, currency: string) => money(v.lines.reduce((a, l) => a + l.debit.minor, 0), currency);

/** Money in that isn't from an invoice, laid out like Expenses: by period, searchable, with what it was for. */
export default function ReceiptsList() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['books', 'common', 'nav']);
  const baseCurrency = useBaseCurrency();
  const desktop = useIsDesktop();
  const narrow = useBreakpoint() === 'tablet';

  // The chart the server names accounts from: the device needn't hold every party.
  const { book } = useServerBook();
  const nameOf = useAccountName();
  const parties = useParties();
  const [params, setParams] = useQueryParams();
  const range = presetParam(params.range, DEFAULT_RANGE);
  const setRange = (r: DateRangePreset) => setParams({ range: r === DEFAULT_RANGE ? undefined : r });
  const [query, setQuery] = useState('');
  const search = useDebounced(query);

  // Read from the server 50 at a time; the total and the split by account cover every page.
  const filter = useMemo(() => {
    const r = range === 'all' ? undefined : resolveRange(range);
    return { kind: 'receipt' as const, from: r?.from, to: r?.to, q: search };
  }, [range, search]);
  const pages = useVoucherPages(filter);
  const summary = useVoucherSummary(filter);
  const receipts = pages.rows;

  const label = (key?: string) => {
    const a = key ? accountFor(key, book) : undefined;
    return a ? nameOf(a) : '—';
  };
  const partyName = (v: Voucher) => (v.partyId ? parties.find((p) => p.id === v.partyId)?.name : undefined);
  const count = summary.data?.count ?? receipts.length;
  const total = (summary.data?.total as Money | undefined) ?? zero(baseCurrency);
  const byAccount = summary.data?.byAccount ?? [];
  const noneAtAll = range === 'all' && !search && summary.data?.count === 0;
  const loading = (pages.isLoading || summary.isLoading) && !receipts.length;
  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };
  const open = (v: Voucher) => router.push(`/(app)/receipts/${v.id}` as never);
  const add = () => router.push('/(app)/receipts/new' as never);

  const selection = useTableSelection(filter);
  const exportRows = useRowsExport();
  const exportChosen = (keys: string[]) =>
    exportRows(
      tr('books:receipts.title'),
      {
        headers: [tr('common:table.number'), tr('common:table.date'), tr('books:receipts.source'), tr('books:receipts.party'), tr('common:table.reference'), tr('common:table.amount')],
        rows: receipts.filter((v) => keys.includes(v.id)).map((v) => [v.number, v.date, label(incomeLine(v)?.account), partyName(v) ?? '', v.reference ?? v.narration ?? '', amountOf(v, baseCurrency).minor / 100]),
      },
      tr('common:table.exportCancelled'),
    );

  const empty = (
    <EmptyState
      icon="cash-plus"
      title={tr('books:receipts.empty')}
      message={noneAtAll ? tr('books:receipts.emptyBody') : tr('books:receipts.emptyFiltered')}
      actionLabel={noneAtAll ? tr('books:receipts.new') : undefined}
      onAction={noneAtAll ? add : undefined}
      compact
    />
  );
  const splitCard =
    byAccount.length > 1 ? (
      <Card padded={false}>
        {byAccount.map((b, i) => (
          <ListRow key={b.account} title={label(b.account)} right={<Text variant="small" weight="600">{formatMoney(b.total as Money)}</Text>} divider={i < byAccount.length - 1} />
        ))}
      </Card>
    ) : null;
  const adjustButton = <Button title={tr('books:receipts.adjust')} icon="swap-horizontal" variant="ghost" size="sm" onPress={() => router.push('/(app)/receipts/adjust' as never)} />;

  if (desktop) {
    return (
      <View style={{ flex: 1, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg, gap: t.spacing.md }}>
        <Stack.Screen options={{ title: tr('books:receipts.title') }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: t.spacing.sm }}>
          <View style={{ width: 380 }}>
            <SearchBar compact value={query} onChangeText={setQuery} placeholder={tr('books:receipts.search')} />
          </View>
          <FilterMenu
            icon="calendar-range"
            label={tr('common:filters.dateRange')}
            value={range}
            neutralValue={'all' as DateRangePreset}
            options={DATE_RANGE_PRESET_KEYS.map((p) => ({ value: p, label: dateRangeLabel(tr, p) }))}
            onChange={setRange}
          />
          {adjustButton}
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.md }}>
            <Text variant="small" tone="muted">
              {tr('books:receipts.count', { count })}
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
                  { key: 'number', header: tr('common:table.number'), width: 150, render: (v) => <Cell weight="600">{v.number}</Cell> },
                  { key: 'date', header: tr('common:table.date'), width: 110, render: (v) => <Cell tone="muted">{formatDate(v.date, 'dd MMM yyyy')}</Cell> },
                  { key: 'for', header: tr('books:receipts.source'), flex: 1.4, render: (v) => <Cell>{label(incomeLine(v)?.account)}</Cell> },
                  { key: 'party', secondary: true, header: tr('books:receipts.party'), flex: 1.2, render: (v) => <Cell tone="muted">{partyName(v) ?? '—'}</Cell> },
                  { key: 'ref', secondary: true, header: tr('common:table.reference'), flex: 1.4, render: (v) => <Cell tone="muted">{v.reference || v.narration || '—'}</Cell> },
                  { key: 'amount', header: tr('common:table.amount'), width: 130, align: 'right', render: (v) => <Cell weight="600" mono>{formatMoney(amountOf(v, baseCurrency))}</Cell> },
                ]}
                rows={receipts}
                rowKey={(v) => v.id}
                onRowPress={open}
                rowLabel={(v) => `${v.number}, ${formatMoney(amountOf(v, baseCurrency))}`}
                {...pagedTableProps(pages, tr('common:table.loadFailed'), 'receipts')}
                loading={loading}
                totalCount={summary.data?.count}
                selectable
                selectedKeys={selection.selected}
                onSelectionChange={selection.setSelected}
                bulkActions={(keys) => <Button title={tr('common:table.exportCsv')} icon="file-export-outline" variant="ghost" size="sm" onPress={() => void exportChosen(keys)} />}
                rowActions={(v) => [
                  { key: 'open', label: tr('common:table.open'), icon: 'eye-outline', onPress: () => open(v) },
                  { key: 'edit', label: tr('common:action.edit'), icon: 'pencil-outline', onPress: () => router.push(`/(app)/receipts/${v.id}/edit` as never) },
                ]}
                empty={empty}
              />
            </View>
          }
          side={
            narrow ? null : (
              <>
                <StatTile label={tr('books:receipts.total')} value={total} tone="good" icon="cash-plus" caption={tr('books:receipts.count', { count })} />
                {splitCard}
              </>
            )
          }
        />
        <Fab icon="plus" onPress={add} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('books:receipts.title') }} />
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }}>
        <SearchBar compact value={query} onChangeText={setQuery} placeholder={tr('books:receipts.search')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm, paddingRight: t.spacing.lg }}>
          {DATE_RANGE_PRESET_KEYS.map((p) => {
            const active = range === p;
            return (
              <Pressable
                key={p}
                onPress={() => setRange(p)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{ paddingHorizontal: t.spacing.md, paddingVertical: 6, borderRadius: t.radius.pill, backgroundColor: active ? t.c.primary : t.c.card, borderWidth: active ? 0 : 1, borderColor: t.c.line }}
              >
                <Text variant="caption" weight="600" style={{ color: active ? t.c.onPrimary : t.c.muted }}>
                  {dateRangeLabel(tr, p)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120, gap: t.spacing.md }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        onScroll={({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
          if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600) loadMore();
        }}
        scrollEventThrottle={200}
      >
        <StatRow>
          <StatTile label={tr('books:receipts.total')} value={total} tone="good" icon="cash-plus" caption={tr('books:receipts.count', { count })} />
        </StatRow>
        {splitCard}
        <View style={{ alignItems: 'flex-start' }}>{adjustButton}</View>
        <Card padded={false}>
          {loading ? (
            <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
          ) : receipts.length ? (
            receipts.map((v, i) => (
              <ListRow
                key={v.id}
                title={label(incomeLine(v)?.account)}
                subtitle={[v.number, formatDate(v.date), partyName(v), v.narration].filter(Boolean).join(' · ')}
                right={
                  <Text variant="small" weight="600" tone="good">
                    {formatMoney(amountOf(v, baseCurrency))}
                  </Text>
                }
                chevron
                divider={i < receipts.length - 1}
                onPress={() => open(v)}
              />
            ))
          ) : (
            empty
          )}
        </Card>
        {pages.hasNextPage ? (
          <View style={{ alignItems: 'center' }}>
            {pages.isFetchingNextPage ? <ActivityIndicator color={t.c.muted} /> : <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" onPress={loadMore} />}
          </View>
        ) : null}
      </ScrollView>
      <Fab icon="plus" onPress={add} />
    </View>
  );
}
