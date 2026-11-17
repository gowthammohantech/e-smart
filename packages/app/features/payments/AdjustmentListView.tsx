import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
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
import { Skeleton } from '@esmart/ui/components/Skeleton';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { dateRangeLabel, documentKindLabel } from '@esmart/core/labels';
import { formatMoney } from '@esmart/core/lib/format';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, resolveRange } from '@esmart/core/lib/date';
import { zero, type Money } from '@esmart/core/lib/money';
import type { DocumentKind } from '@esmart/core/types';
import { useBaseCurrency } from '../../store/selectors';
import { useAdjustmentPages, useAdjustmentSummary, type AdjustmentRow } from '../../remote/queries';
import { useDebounced } from '../../components/useDebounced';
import { pagedTableProps, useRowsExport, useTableSelection } from '../../components/pagedTable';
import { presetParam, useQueryParams } from '../../navigation/queryParams';
import { CardRowsSkeleton, MoreRowsSkeleton } from '../../components/ScreenSkeleton';
import { BranchFilterMenu, BranchPickerChip, useListBranch } from '../../components/branchFilter';

const ADJUST_ROUTE = '/(app)/receipts/adjust';

/**
 * The adjustments made, newest first: an advance used on a later invoice (or bill), on that
 * document's date, with the GST that came back; and a direct credit note applied to a document.
 * Searchable like the payment lists; + opens Adjust advance to make one.
 */
export function AdjustmentListView() {
  const t = useTheme();
  const { t: tr } = useTranslation(['books', 'common', 'domain']);
  const router = useRouter();
  const baseCurrency = useBaseCurrency();
  const desktop = useIsDesktop();

  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  // The range lives in the URL (`?range=thisMonth`); search stays local.
  const [params, setParams] = useQueryParams();
  const range = presetParam(params.range, 'all');
  const setRange = (r: DateRangePreset) => setParams({ range: r === 'all' ? undefined : r });
  const branch = useListBranch(params);
  const setBranch = (value: string) => setParams({ branch: branch.paramFor(value) });

  const filter = useMemo(() => {
    const r = range === 'all' ? undefined : resolveRange(range);
    return { from: r?.from, to: r?.to, q: search, branchId: branch.branchId };
  }, [range, search, branch.branchId]);
  const pages = useAdjustmentPages(filter);
  const summary = useAdjustmentSummary(filter);

  const rows = pages.rows;
  const count = summary.data?.count ?? rows.length;
  const total = (summary.data?.total as Money | undefined) ?? zero(baseCurrency);
  const noneAtAll = range === 'all' && !search && !branch.overridden && summary.data?.count === 0 && !rows.length;
  const loading = (pages.isLoading || summary.isLoading) && !rows.length;
  const totalsPending = loading || (!summary.data && summary.isLoading);
  const failed = pages.isError && !rows.length;
  const retry = () => {
    void pages.refetch();
    void summary.refetch();
  };
  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };

  const kindLabel = (r: AdjustmentRow) => tr(`books:adjustments.kind.${r.kind}`);
  // An advance reads as money (green); a note as a credit (neutral).
  const kindBadge = (r: AdjustmentRow) => <Badge label={kindLabel(r)} tone={r.sourceType === 'payment' ? 'success' : 'neutral'} size="sm" />;
  const against = (r: AdjustmentRow) => `${r.documentNumber} · ${documentKindLabel(tr, r.documentKind as DocumentKind, 1)}`;
  // The advance or note it came from.
  const open = (r: AdjustmentRow) => router.push((r.sourceType === 'payment' ? `/(app)/payments/${r.sourceId}` : `/(app)/documents/${r.sourceId}`) as never);

  const selection = useTableSelection(filter);
  const exportRows = useRowsExport();
  const exportChosen = (keys: string[]) =>
    exportRows(
      tr('books:adjustments.title'),
      {
        headers: [tr('common:table.date'), tr('books:adjustments.type'), tr('books:adjustments.source'), tr('books:adjustments.party'), tr('books:adjustments.against'), tr('books:adjustments.gst'), tr('common:table.amount')],
        rows: rows
          .filter((r) => keys.includes(r.id))
          .map((r) => [r.date, kindLabel(r), r.sourceNumber, r.partyName, r.documentNumber, r.gst ? r.gst.minor / 100 : '', r.amount.minor / 100]),
      },
      tr('common:table.exportCancelled'),
    );

  const ranges = ['all', ...DATE_RANGE_PRESET_KEYS.filter((k) => k !== 'all')] as DateRangePreset[];
  const empty = (
    <EmptyState
      illustration="no-payments"
      icon="swap-horizontal"
      title={tr('books:adjustments.none')}
      message={noneAtAll ? tr('books:adjustments.emptyBody') : tr('common:filters.noMatch')}
      actionLabel={noneAtAll ? tr('books:adjustments.adjustNow') : undefined}
      onAction={noneAtAll ? () => router.push(ADJUST_ROUTE as never) : undefined}
      compact
    />
  );

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
          <SearchBar compact value={query} onChangeText={setQuery} placeholder={tr('books:adjustments.search')} />
        </View>
        {desktop ? (
          <>
            <FilterMenu
              icon="calendar-range"
              label={tr('common:filters.dateRange')}
              value={range}
              neutralValue={'all' as DateRangePreset}
              options={ranges.map((p) => ({ value: p, label: dateRangeLabel(tr, p) }))}
              onChange={setRange}
            />
            <BranchFilterMenu branch={branch} onChange={setBranch} />
          </>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm, paddingRight: t.spacing.lg }}>
              {ranges.map((p) => {
                const active = range === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setRange(p)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
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
            <BranchPickerChip branch={branch} onChange={setBranch} />
          </>
        )}
        {/* How many match and what they add up to (not ₹0 when it didn't load). */}
        {summary.isError || (failed && !desktop) ? null : totalsPending ? (
          <View style={desktop ? { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: t.spacing.md } : { flexDirection: 'row', justifyContent: 'space-between', minHeight: 16 }}>
            <Skeleton height={desktop ? 12 : 10} width={80} radius={4} />
            <Skeleton height={desktop ? 18 : 10} width={desktop ? 90 : 60} radius={4} />
          </View>
        ) : (
          <View style={desktop ? { marginLeft: 'auto', flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.md } : { flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant={desktop ? 'small' : 'caption'} tone="muted">
              {tr('books:adjustments.count', { count })}
            </Text>
            <Text variant={desktop ? 'title' : 'caption'} weight="700" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(total)}
            </Text>
          </View>
        )}
      </View>

      {desktop ? (
        <View style={{ flex: 1, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg }}>
          <DataTable
            columns={[
              { key: 'date', header: tr('common:table.date'), width: 120, render: (r) => <Cell tone="muted">{formatDate(r.date, 'dd MMM yyyy')}</Cell> },
              { key: 'type', header: tr('books:adjustments.type'), width: 170, render: (r) => kindBadge(r) },
              { key: 'source', header: tr('books:adjustments.source'), width: 150, render: (r) => <Cell weight="600">{r.sourceNumber}</Cell> },
              {
                key: 'party',
                header: tr('books:adjustments.party'),
                flex: 2,
                render: (r) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, maxWidth: '100%' }}>
                    <Avatar name={r.partyName} size={26} />
                    <Cell>{r.partyName}</Cell>
                  </View>
                ),
              },
              { key: 'against', header: tr('books:adjustments.against'), flex: 2, render: (r) => <Cell tone="muted">{against(r)}</Cell> },
              { key: 'gst', secondary: true, header: tr('books:adjustments.gst'), width: 120, align: 'right', render: (r) => <Cell tone="muted" mono>{r.gst ? formatMoney(r.gst as Money) : '—'}</Cell> },
              {
                key: 'amount',
                header: tr('common:table.amount'),
                width: 150,
                align: 'right',
                render: (r) => (
                  <Cell weight="700" mono>
                    {formatMoney(r.amount as Money)}
                  </Cell>
                ),
              },
            ]}
            rows={rows}
            rowKey={(r) => r.id}
            onRowPress={open}
            rowLabel={(r) => `${r.sourceNumber}, ${r.documentNumber}, ${formatMoney(r.amount as Money)}`}
            {...pagedTableProps(pages, tr('common:table.loadFailed'), 'adjustments')}
            loading={loading}
            totalCount={summary.data?.count}
            selectable
            selectedKeys={selection.selected}
            onSelectionChange={selection.setSelected}
            bulkActions={(keys) => <Button title={tr('common:table.exportCsv')} icon="file-export-outline" variant="ghost" size="sm" onPress={() => void exportChosen(keys)} />}
            rowActions={(r) => [
              { key: 'open', label: tr('common:table.open'), icon: 'eye-outline', onPress: () => open(r) },
              { key: 'document', label: tr('books:adjustments.openDocument', { number: r.documentNumber }), icon: 'file-document-outline', onPress: () => router.push(`/(app)/documents/${r.documentId}` as never) },
            ]}
            empty={empty}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }}
          showsVerticalScrollIndicator={SHOW_SCROLLBAR}
          onScroll={({ nativeEvent: e }: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 600) loadMore();
          }}
          scrollEventThrottle={200}
        >
          <Card padded={false}>
            {loading ? (
              <CardRowsSkeleton />
            ) : failed ? (
              <EmptyState icon="cloud-off-outline" title={tr('common:table.loadFailed')} message={tr('common:documentList.loadFailedBody')} actionLabel={tr('common:action.retry')} onAction={retry} compact />
            ) : rows.length === 0 ? (
              empty
            ) : (
              rows.map((r, i) => (
                <Pressable
                  key={r.id}
                  onPress={() => open(r)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.sourceNumber}, ${r.documentNumber}, ${formatMoney(r.amount as Money)}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    padding: t.spacing.lg,
                    borderBottomWidth: i < rows.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.c.line,
                    backgroundColor: pressed ? t.c.card2 : 'transparent',
                  })}
                >
                  <Avatar name={r.partyName} size={38} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {r.partyName}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {`${r.sourceNumber} → ${r.documentNumber} · ${formatDate(r.date, 'dd MMM')}`}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="body" weight="700">
                      {formatMoney(r.amount as Money)}
                    </Text>
                    {kindBadge(r)}
                  </View>
                </Pressable>
              ))
            )}
          </Card>
          {pages.hasNextPage ? (
            <View style={{ alignItems: 'center', paddingVertical: t.spacing.md }}>
              {pages.isFetchingNextPage ? <MoreRowsSkeleton /> : <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" onPress={loadMore} />}
            </View>
          ) : null}
        </ScrollView>
      )}

      <Fab icon="plus" onPress={() => router.push(ADJUST_ROUTE as never)} />
    </View>
  );
}
