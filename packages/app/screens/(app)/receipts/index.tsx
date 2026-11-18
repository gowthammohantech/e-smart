import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
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
import { dateRangeLabel, paymentMethodLabel } from '@esmart/core/labels';
import type { Payment, Voucher } from '@esmart/core/types';
import { useMoneyInPages, useMoneyInSummary, useServerBook, type MoneyInEntry } from '../../../remote/queries';
import { useBaseCurrency, useHasModule, useParties } from '../../../store/selectors';
import { presetParam, useQueryParams } from '../../../navigation/queryParams';
import { useAccountName } from '../../../features/books/names';
import { useDebounced } from '../../../components/useDebounced';
import { pagedTableProps, useRowsExport, useTableSelection } from '../../../components/pagedTable';
import { CardRowsSkeleton, MoreRowsSkeleton } from '../../../components/ScreenSkeleton';
import { Skeleton } from '@esmart/ui/components/Skeleton';
import { BranchFilterMenu, BranchPickerChip, useListBranch } from '../../../components/branchFilter';
import { PartyFilterChip } from '../../../components/PartyFilterChip';

const DEFAULT_RANGE: DateRangePreset = 'last30';

/** What a receipt is for: the account it credits (an income, a loan, capital). */
export const incomeLine = (v: Voucher) => v.lines.find((l) => l.credit.minor > 0);
const voucherAmount = (v: Voucher, currency: string) => money(v.lines.reduce((a, l) => a + l.debit.minor, 0), currency);

type ListedPayment = Payment & { partyName?: string };
/** A row of the list: a customer's payment or a receipt voucher, with what tells them apart already worked out. */
type Row = { id: string; number: string; date: string; amount: Money; payment?: ListedPayment; voucher?: Voucher };
type Kind = 'all' | 'payment' | 'receipt';

/**
 * Money received, laid out like Expenses: by period, searchable. A customer's payment against their
 * invoices and a receipt voucher (interest, rent, a refund, capital) side by side, newest first; on a
 * plan without the books, customers' payments alone.
 */
export default function ReceiptsList() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['books', 'common', 'nav', 'sales']);
  const baseCurrency = useBaseCurrency();
  const desktop = useIsDesktop();
  const narrow = useBreakpoint() === 'tablet';
  const books = useHasModule('books');

  // The chart the server names accounts from: the device needn't hold every party.
  const { book, loaded } = useServerBook();
  const nameOf = useAccountName();
  const parties = useParties();
  const [params, setParams] = useQueryParams();
  const range = presetParam(params.range, DEFAULT_RANGE);
  const setRange = (r: DateRangePreset) => setParams({ range: r === DEFAULT_RANGE ? undefined : r });
  // Customers' payments or the other receipts alone (`?type=`); without the books there are only payments.
  const kind: Kind = !books ? 'all' : params.type === 'payment' || params.type === 'receipt' ? params.type : 'all';
  const setKind = (k: Kind) => setParams({ type: k === 'all' ? undefined : k });
  // The branch the hubs count in (the top bar's) unless another was picked here (`?branch=`).
  const branch = useListBranch(params);
  const setBranch = (value: string) => setParams({ branch: branch.paramFor(value) });
  // Opened for one contact (?party=…, from their page's See all): only theirs, until the chip is pressed.
  const partyId = params.party || undefined;
  const partyChip = <PartyFilterChip partyId={partyId} onClear={() => setParams({ party: undefined })} />;
  const [query, setQuery] = useState('');
  const search = useDebounced(query);

  // Read from the server 50 at a time; the totals and the split by account cover every page.
  const filter = useMemo(() => {
    const r = range === 'all' ? undefined : resolveRange(range);
    return { type: kind === 'all' ? undefined : kind, from: r?.from, to: r?.to, q: search, branchId: branch.branchId, partyId };
  }, [range, search, kind, branch.branchId, partyId]);
  const pages = useMoneyInPages(filter);
  const summary = useMoneyInSummary(filter);
  const rows: Row[] = useMemo(
    () =>
      (pages.rows as MoneyInEntry[]).flatMap((e): Row[] => {
        if (e.type === 'payment' && e.payment) {
          const p = e.payment as unknown as ListedPayment;
          return [{ id: p.id, number: p.number, date: p.date, amount: p.amount, payment: p }];
        }
        if (e.voucher) {
          const v = e.voucher as unknown as Voucher;
          return [{ id: v.id, number: v.number, date: v.date, amount: voucherAmount(v, baseCurrency), voucher: v }];
        }
        return [];
      }),
    [pages.rows, baseCurrency],
  );

  const label = (key?: string) => {
    const a = key ? accountFor(key, book) : undefined;
    return a ? nameOf(a) : '—';
  };
  const voucherParty = (v: Voucher) => (v.partyId ? parties.find((p) => p.id === v.partyId)?.name : undefined);
  /** What it was received for: the customer for a payment, the account credited for a voucher. */
  const forOf = (r: Row) => (r.payment ? (r.payment.partyName ?? tr('common:placeholder.unknown')) : label(incomeLine(r.voucher!)?.account));
  /** Who it was from, under what it was for: how a customer paid, or the voucher's party. */
  const detailOf = (r: Row) => (r.payment ? paymentMethodLabel(tr, r.payment.method) : voucherParty(r.voucher!));
  const appliedBadge = (p: Payment) =>
    p.unallocated.minor > 0 ? (
      <Badge label={tr('sales:list.advance')} tone="warning" size="sm" />
    ) : (
      <Badge label={tr('sales:list.appliedCount', { count: p.allocations.length })} tone="neutral" size="sm" />
    );

  const count = summary.data?.count ?? rows.length;
  const total = (summary.data?.total as Money | undefined) ?? zero(baseCurrency);
  const byAccount = summary.data?.byAccount ?? [];
  const fromCustomers = summary.data?.payments;
  const noneAtAll = range === 'all' && !search && kind === 'all' && !branch.overridden && !partyId && summary.data?.count === 0;
  const loading = (pages.isLoading || summary.isLoading) && !rows.length;
  // Voucher rows name their account from the chart: until it's in they'd read "—", so they wait for it too.
  const rowsLoading = loading || (!loaded && rows.some((r) => r.voucher));
  // The count and total wait for the summary: never "0 receipts · ₹0.00".
  const totalsPending = loading || (!summary.data && summary.isLoading);
  // Didn't load: said so with a retry, never "no receipts" or a ₹0 total.
  const failed = pages.isError && !rows.length;
  const failedState = (
    <EmptyState
      icon="cloud-off-outline"
      title={tr('common:table.loadFailed')}
      message={tr('common:documentList.loadFailedBody')}
      actionLabel={tr('common:action.retry')}
      onAction={() => {
        void pages.refetch();
        void summary.refetch();
      }}
      compact
    />
  );
  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };
  const open = (r: Row) => router.push((r.payment ? `/(app)/payments/${r.id}` : `/(app)/receipts/${r.id}`) as never);
  const add = () => router.push('/(app)/receipts/new' as never);

  const selection = useTableSelection(filter);
  const exportRows = useRowsExport();
  const exportChosen = (keys: string[]) =>
    exportRows(
      tr('books:receipts.title'),
      {
        headers: [tr('common:table.number'), tr('common:table.date'), tr('books:receipts.source'), tr('books:receipts.party'), tr('common:table.reference'), tr('common:table.amount')],
        rows: rows
          .filter((r) => keys.includes(r.id))
          .map((r) => [r.number, r.date, forOf(r), (r.payment ? r.payment.partyName : voucherParty(r.voucher!)) ?? '', (r.payment ? r.payment.reference : (r.voucher!.reference ?? r.voucher!.narration)) ?? '', r.amount.minor / 100]),
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
  // What it was for, across every page: customers' payments, then each account the vouchers credited.
  const split = [
    ...(fromCustomers && fromCustomers.count > 0 ? [{ key: 'customers', title: tr('books:receipts.fromCustomers'), total: fromCustomers.total as Money }] : []),
    ...byAccount.map((b) => ({ key: b.account, title: label(b.account), total: b.total as Money })),
  ];
  const splitCard =
    split.length > 1 && loaded ? (
      <Card padded={false}>
        {split.map((b, i) => (
          <ListRow key={b.key} title={b.title} right={<Text variant="small" weight="600">{formatMoney(b.total)}</Text>} divider={i < split.length - 1} />
        ))}
      </Card>
    ) : null;
  const adjustButton = <Button title={tr('books:receipts.adjust')} icon="swap-horizontal" variant="ghost" size="sm" onPress={() => router.push('/(app)/receipts/adjust' as never)} />;
  const kinds: { key: Kind; label: string }[] = [
    { key: 'all', label: tr('books:receipts.allKinds') },
    { key: 'payment', label: tr('books:receipts.fromCustomers') },
    { key: 'receipt', label: tr('books:receipts.otherReceipts') },
  ];
  const chip = (active: boolean, text: string, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      // The chip stays slim; the target reaches a finger's height.
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      style={{ paddingHorizontal: t.spacing.md, paddingVertical: 6, borderRadius: t.radius.pill, backgroundColor: active ? t.c.primary : t.c.card, borderWidth: active ? 0 : 1, borderColor: t.c.line }}
    >
      <Text variant="caption" weight="600" style={{ color: active ? t.c.onPrimary : t.c.muted }}>
        {text}
      </Text>
    </Pressable>
  );

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
          {books ? (
            <FilterMenu icon="tag-outline" label={tr('books:receipts.allKinds')} value={kind} neutralValue={'all' as Kind} options={kinds.map((k) => ({ value: k.key, label: k.label }))} onChange={setKind} />
          ) : null}
          <BranchFilterMenu branch={branch} onChange={setBranch} />
          {partyId ? partyChip : null}
          {adjustButton}
          {summary.isError ? null : totalsPending ? (
            <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
              <Skeleton height={12} width={80} radius={4} />
              <Skeleton height={18} width={90} radius={4} />
            </View>
          ) : (
            <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.md }}>
              <Text variant="small" tone="muted">
                {tr('books:receipts.count', { count })}
              </Text>
              <Text variant="title" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
                {formatMoney(total)}
              </Text>
            </View>
          )}
        </View>
        <SplitPane
          sideWidth={300}
          main={
            <View style={{ flex: 1 }}>
              <DataTable
                columns={[
                  { key: 'number', header: tr('common:table.number'), width: 150, render: (r) => <Cell weight="600">{r.number}</Cell> },
                  { key: 'date', header: tr('common:table.date'), width: 110, render: (r) => <Cell tone="muted">{formatDate(r.date, 'dd MMM yyyy')}</Cell> },
                  { key: 'for', header: tr('books:receipts.source'), flex: 1.4, render: (r) => (r.voucher && !loaded ? <Skeleton height={10} width={100} radius={4} /> : <Cell>{forOf(r)}</Cell>) },
                  { key: 'party', secondary: true, header: tr('books:receipts.party'), flex: 1.2, render: (r) => <Cell tone="muted">{detailOf(r) ?? '—'}</Cell> },
                  { key: 'ref', secondary: true, header: tr('common:table.reference'), flex: 1.2, render: (r) => <Cell tone="muted">{(r.payment ? r.payment.reference : r.voucher!.reference || r.voucher!.narration) || '—'}</Cell> },
                  { key: 'applied', header: tr('common:table.applied'), width: 130, render: (r) => (r.payment ? appliedBadge(r.payment) : <Cell tone="muted">—</Cell>) },
                  { key: 'amount', header: tr('common:table.amount'), width: 130, align: 'right', render: (r) => <Cell weight="600" tone="good" mono>{formatMoney(r.amount)}</Cell> },
                ]}
                rows={rows}
                rowKey={(r) => r.id}
                onRowPress={open}
                rowLabel={(r) => `${r.number}, ${formatMoney(r.amount)}`}
                {...pagedTableProps(pages, tr('common:table.loadFailed'), 'receipts')}
                loading={loading}
                totalCount={summary.data?.count}
                selectable
                selectedKeys={selection.selected}
                onSelectionChange={selection.setSelected}
                bulkActions={(keys) => <Button title={tr('common:table.exportCsv')} icon="file-export-outline" variant="ghost" size="sm" onPress={() => void exportChosen(keys)} />}
                rowActions={(r) => [
                  { key: 'open', label: tr('common:table.open'), icon: 'eye-outline', onPress: () => open(r) },
                  // A payment is edited from its own page; a receipt voucher has an edit form.
                  ...(r.voucher ? [{ key: 'edit', label: tr('common:action.edit'), icon: 'pencil-outline' as const, onPress: () => router.push(`/(app)/receipts/${r.id}/edit` as never) }] : []),
                ]}
                empty={empty}
              />
            </View>
          }
          side={
            narrow ? null : summary.isError ? (
              <Card padded={false}>{failedState}</Card>
            ) : (
              <>
                <StatTile label={tr('books:receipts.total')} value={total} tone="good" icon="cash-plus" caption={tr('books:receipts.count', { count })} loading={!summary.data && summary.isLoading} />
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
          {DATE_RANGE_PRESET_KEYS.map((p) => chip(range === p, dateRangeLabel(tr, p), () => setRange(p), p))}
        </ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {books ? kinds.map((k) => chip(kind === k.key, k.label, () => setKind(k.key), `kind-${k.key}`)) : null}
          <BranchPickerChip branch={branch} onChange={setBranch} />
          {partyId ? partyChip : null}
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120, gap: t.spacing.md }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
        onScroll={({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
          if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600) loadMore();
        }}
        scrollEventThrottle={200}
      >
        {summary.isError ? (
          failed ? null : <Card padded={false}>{failedState}</Card>
        ) : (
          <StatRow>
            <StatTile label={tr('books:receipts.total')} value={total} tone="good" icon="cash-plus" caption={tr('books:receipts.count', { count })} loading={!summary.data && summary.isLoading} />
          </StatRow>
        )}
        {splitCard}
        <View style={{ alignItems: 'flex-start' }}>{adjustButton}</View>
        <Card padded={false}>
          {rowsLoading ? (
            <CardRowsSkeleton />
          ) : failed ? (
            failedState
          ) : rows.length ? (
            rows.map((r, i) => (
              <ListRow
                key={r.id}
                title={forOf(r)}
                subtitle={[r.number, formatDate(r.date), detailOf(r), r.voucher?.narration].filter(Boolean).join(' · ')}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="small" weight="600" tone="good">
                      {formatMoney(r.amount)}
                    </Text>
                    {r.payment ? appliedBadge(r.payment) : null}
                  </View>
                }
                chevron
                divider={i < rows.length - 1}
                onPress={() => open(r)}
              />
            ))
          ) : (
            empty
          )}
        </Card>
        {pages.hasNextPage ? (
          <View style={{ alignItems: 'center' }}>
            {pages.isFetchingNextPage ? <MoreRowsSkeleton /> : <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" onPress={loadMore} />}
          </View>
        ) : null}
      </ScrollView>
      <Fab icon="plus" onPress={add} />
    </View>
  );
}
