import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@esmart/ui/components/Icon';
import { useTranslation } from 'react-i18next';
import { useRefreshOnFocus } from '../remote/useRefreshOnFocus';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { DocumentRow } from '@esmart/ui/components/DocumentRow';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Stagger } from '@esmart/ui/components/Stagger';
import { Sheet } from '@esmart/ui/components/Sheet';
import { Button } from '@esmart/ui/components/Button';
import { Badge, StatusBadge } from '@esmart/ui/components/Badge';
import { Avatar } from '@esmart/ui/components/Avatar';
import { Cell, DataTable, type Column, type Sort } from '@esmart/ui/components/DataTable';
import { FilterMenu } from '@esmart/ui/components/FilterMenu';
import type { DocStatus, DocumentKind } from '@esmart/core/types';
import { PURCHASE_KINDS, STATUS_TONE } from '@esmart/core/domain/documentStates';
import { dateRangeLabel, documentKindLabel, statusLabel } from '@esmart/core/labels';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, resolveRange } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { zero, type Money } from '@esmart/core/lib/money';
import { useAppStore } from '../store/appStore';
import { useBaseCurrency } from '../store/selectors';
import { isOpen } from '../remote/outbox';
import { useDocumentPages, useDocumentSummary, type DocumentQuery } from '../remote/queries';
import { useDebounced } from './useDebounced';
import { pagedTableProps, useRowsExport, useTableSelection } from './pagedTable';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { listParam, presetParam, useQueryParams } from '../navigation/queryParams';

export type DocumentListFilters = {
  query: string;
  statuses: DocStatus[];
  range: DateRangePreset;
  partyId: string | null;
};

const DEFAULT_FILTERS: DocumentListFilters = {
  query: '',
  statuses: [],
  range: 'all',
  partyId: null,
};

/** One row of a list: a server summary, or a document still waiting to sync. */
type Row = { id: string; number: string; date: string; dueDate?: string; status: DocStatus; partyName: string; grandTotal: Money; outstanding?: Money; waiting?: boolean };
const asRowData = (r: Row) => ({ number: r.number, date: r.date, status: r.status, totals: { grandTotal: r.grandTotal } });

/** The server sorts these columns; the rest keep the server's order. */
const SERVER_SORT: Record<string, 'date' | 'number' | 'total'> = { date: 'date', number: 'number', amount: 'total' };

/**
 * Shared list view for every document kind: search, status chips, date range
 * and party filter, with a running total of what matches. Rows come from the
 * server 50 at a time (more as the list scrolls); the count, total and chips
 * come from its summary of the same filters, so they cover every page.
 */
export function DocumentListView({
  kind,
  routeFor,
  emptyAction,
  onEmptyAction,
  headerExtra,
}: {
  kind: DocumentKind;
  routeFor: (doc: { id: string }) => string;
  emptyAction?: string;
  onEmptyAction?: () => void;
  headerExtra?: React.ReactNode;
}) {
  useRefreshOnFocus();
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain']);
  const router = useRouter();
  const baseCurrency = useBaseCurrency();

  // Status, date range and party live in the URL (`?status=draft&range=thisMonth&party=…`);
  // the search box stays local so typing doesn't rewrite the URL on every key.
  const [params, setParams] = useQueryParams();
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const filters = useMemo<DocumentListFilters>(
    () => ({
      query,
      statuses: listParam.parse<DocStatus>(params.status),
      range: presetParam(params.range, DEFAULT_FILTERS.range),
      partyId: params.party ?? null,
    }),
    [query, params],
  );
  const setFilters = (next: DocumentListFilters | ((f: DocumentListFilters) => DocumentListFilters)) => {
    const f = typeof next === 'function' ? next(filters) : next;
    setQuery(f.query);
    const url = {
      status: listParam.format(f.statuses),
      range: f.range === DEFAULT_FILTERS.range ? undefined : f.range,
      party: f.partyId ?? undefined,
    };
    if (url.status !== params.status || url.range !== params.range || url.party !== params.party) setParams(url);
  };
  const [filterOpen, setFilterOpen] = useState(false);
  const desktop = useIsDesktop();
  const [sort, setSort] = useState<Sort | null>(null);

  const serverQuery = useMemo<DocumentQuery>(() => {
    const range = filters.range === 'all' ? undefined : resolveRange(filters.range);
    return { kinds: [kind], statuses: filters.statuses, partyId: filters.partyId ?? undefined, from: range?.from, to: range?.to, q: search };
  }, [kind, filters.statuses, filters.partyId, filters.range, search]);
  const pages = useDocumentPages({ ...serverQuery, sort: sort && SERVER_SORT[sort.key] ? ((sort.dir === 'desc' ? '-' : '') + SERVER_SORT[sort.key]) as DocumentQuery['sort'] : undefined });
  const summary = useDocumentSummary(serverQuery);

  // Made offline and not on the server yet: shown first, so a new document doesn't seem lost.
  const companyId = useAppStore((s) => s.activeCompanyId);
  const documents = useAppStore((s) => s.documents);
  const syncQueue = useAppStore((s) => s.syncQueue);
  const waiting = useMemo<Row[]>(() => {
    const unsent = new Set(syncQueue.filter(isOpen).map((e) => e.entityId));
    if (!unsent.size) return [];
    const parties = useAppStore.getState().parties;
    return documents
      .filter((d) => d.companyId === companyId && d.kind === kind && unsent.has(d.id))
      .map((d) => ({ id: d.id, number: d.number, date: d.date, dueDate: d.dueDate ?? d.validUntil, status: d.status, partyName: parties.find((p) => p.id === d.partyId)?.name ?? '—', grandTotal: d.totals.grandTotal, waiting: true }));
  }, [documents, syncQueue, companyId, kind]);
  const rows = useMemo<Row[]>(() => {
    const seen = new Set(waiting.map((r) => r.id));
    const fromServer = pages.rows
      .filter((d) => !seen.has(d.id!))
      .map((d) => ({ id: d.id!, number: d.number ?? '', date: d.date!, dueDate: d.dueDate, status: d.status as DocStatus, partyName: d.partyName ?? '—', grandTotal: d.grandTotal as Money, outstanding: d.outstanding as Money | undefined }));
    return [...waiting, ...fromServer];
  }, [pages.rows, waiting]);

  const availableStatuses = useMemo(() => (summary.data?.byStatus ?? []).map((b) => b.status as DocStatus), [summary.data]);
  const statusCount = (st: DocStatus) => summary.data?.byStatus.find((b) => b.status === st)?.count ?? 0;
  const count = summary.data?.count ?? rows.length;
  const total = (summary.data?.total as Money | undefined) ?? zero(baseCurrency);
  const filtered = rows;

  const activeFilterCount =
    filters.statuses.length + (filters.partyId ? 1 : 0) + (filters.range !== 'all' ? 1 : 0);
  // Nothing of this kind at all, as against nothing matching the filters.
  const noneAtAll = !activeFilterCount && !search && summary.data?.count === 0 && !waiting.length;
  const loading = (pages.isLoading || summary.isLoading) && !rows.length;
  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };
  // Desktop bulk action: the chosen documents as a CSV.
  const selection = useTableSelection(`${kind}|${search}|${JSON.stringify(filters)}`);
  const exportRows = useRowsExport();
  const exportChosen = (keys: string[]) =>
    exportRows(
      documentKindLabel(tr, kind, 2),
      {
        headers: [tr('common:table.number'), tr('common:table.party'), tr('common:table.date'), tr('common:table.due'), tr('common:table.status'), tr('common:table.amount'), tr('common:table.outstanding')],
        rows: rows
          .filter((d) => keys.includes(d.id))
          .map((d) => [d.number, d.partyName, d.date, d.dueDate ?? '', statusLabel(tr, d.status), d.grandTotal.minor / 100, d.outstanding ? d.outstanding.minor / 100 : '']),
      },
      tr('common:table.exportCancelled'),
    );

  const moreFooter = pages.hasNextPage ? (
    <View style={{ alignItems: 'center', paddingVertical: t.spacing.md }}>
      {pages.isFetchingNextPage ? <ActivityIndicator color={t.c.muted} /> : <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" onPress={loadMore} />}
    </View>
  ) : null;

  const toggleStatus = (s: DocStatus) =>
    setFilters((f) => ({
      ...f,
      statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s],
    }));

  // A desktop shows the list as a sortable table under a one-row filter bar.
  if (desktop) {
    const purchase = PURCHASE_KINDS.includes(kind);
    const owes = kind === 'invoice' || kind === 'purchaseBill';
    const columns: Column<Row>[] = [
      { key: 'number', header: tr('common:table.number'), width: 170, render: (d) => <Cell weight="600">{d.number || tr('common:documentList.waiting')}</Cell>, sortValue: (d) => d.number },
      {
        key: 'party',
        header: purchase ? tr('common:table.supplier') : tr('common:table.customer'),
        flex: 2,
        render: (d) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, maxWidth: '100%' }}>
            <Avatar name={d.partyName} size={26} />
            <Cell>{d.partyName}</Cell>
          </View>
        ),
      },
      { key: 'date', header: tr('common:table.date'), width: 120, render: (d) => <Cell tone="muted">{formatDate(d.date, 'dd MMM yyyy')}</Cell>, sortValue: (d) => d.date },
      {
        key: 'due',
        header: tr('common:table.due'),
        width: 120,
        secondary: true,
        render: (d) => <Cell tone="muted">{d.dueDate ? formatDate(d.dueDate, 'dd MMM yyyy') : '—'}</Cell>,
      },
      { key: 'status', header: tr('common:table.status'), width: 130, render: (d) => <StatusBadge status={d.status} size="sm" /> },
      {
        key: 'amount',
        header: tr('common:table.amount'),
        width: 150,
        align: 'right',
        render: (d) => <Cell weight="600" mono>{formatMoney(d.grandTotal)}</Cell>,
        sortValue: (d) => d.grandTotal.minor,
      },
      ...(owes
        ? [
            {
              key: 'outstanding',
              header: tr('common:table.outstanding'),
              width: 150,
              secondary: true,
              align: 'right' as const,
              // The server works out what each still owes, returns and notes included.
              render: (d: Row) => {
                if (['draft', 'cancelled'].includes(d.status) || !d.outstanding) return <Cell tone="muted">—</Cell>;
                return (
                  <Cell tone={d.outstanding.minor > 0 ? 'default' : 'muted'} mono>
                    {formatMoney(d.outstanding)}
                  </Cell>
                );
              },
            },
          ]
        : []),
    ];

    return (
      <View style={{ flex: 1, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg, gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {/* Wide enough for the hint naming what it searches. */}
          <View style={{ width: 380 }}>
            <SearchBar
              value={filters.query}
              onChangeText={(query) => setFilters((f) => ({ ...f, query }))}
              placeholder={tr('common:documentList.search', { kind: documentKindLabel(tr, kind, 2) })}
            />
          </View>
          <FilterMenu
            icon="calendar-range"
            label={tr('common:filters.dateRange')}
            value={filters.range}
            neutralValue={'all' as DateRangePreset}
            options={(['all', ...DATE_RANGE_PRESET_KEYS.filter((k) => k !== 'all')] as DateRangePreset[]).map((p) => ({ value: p, label: dateRangeLabel(tr, p) }))}
            onChange={(range) => setFilters((f) => ({ ...f, range }))}
          />
          {availableStatuses.map((st) => {
            const active = filters.statuses.includes(st);
            return (
              <Pressable
                key={st}
                onPress={() => toggleStatus(st)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tr('common:documentList.filterByStatus', { status: statusLabel(tr, st) })}
                style={{
                  height: 36,
                  justifyContent: 'center',
                  paddingHorizontal: t.spacing.md,
                  borderRadius: t.radius.pill,
                  backgroundColor: active ? t.c.primary : t.c.paper,
                  borderWidth: active ? 0 : 1,
                  borderColor: t.c.line,
                }}
              >
                <Text variant="caption" weight="600" style={{ color: active ? t.c.onPrimary : t.c.muted }}>
                  {statusLabel(tr, st)} · {statusCount(st)}
                </Text>
              </Pressable>
            );
          })}
          {activeFilterCount || filters.query ? (
            <Text variant="caption" tone="primary" weight="600" accessibilityRole="button" onPress={() => setFilters(DEFAULT_FILTERS)}>
              {tr('common:table.clear')}
            </Text>
          ) : null}
          {/* How many match and what they add up to, at the right end of the filter row. */}
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.md }}>
            <Text variant="small" tone="muted">
              {tr('common:documentList.count', { count, kind: documentKindLabel(tr, kind, count) })}
            </Text>
            <Text variant="title" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
              {formatMoney(total)}
            </Text>
          </View>
        </View>

        {headerExtra}

        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(d) => d.id}
          sort={sort}
          onSortChange={setSort}
          onRowPress={(d) => router.push(routeFor(d) as never)}
          rowLabel={(d) => `${d.number}, ${d.partyName}, ${formatMoney(d.grandTotal)}`}
          {...pagedTableProps(pages, tr('common:table.loadFailed'), `documents-${kind}`)}
          loading={loading}
          totalCount={summary.data ? summary.data.count + waiting.length : undefined}
          selectable
          selectedKeys={selection.selected}
          onSelectionChange={selection.setSelected}
          bulkActions={(keys) => (
            <Button title={tr('common:table.exportCsv')} icon="file-export-outline" variant="ghost" size="sm" onPress={() => void exportChosen(keys)} />
          )}
          rowActions={(d) => [
            { key: 'open', label: tr('common:table.open'), icon: 'eye-outline', onPress: () => router.push(routeFor(d) as never) },
            // As on the detail screen: only a draft is edited in place.
            ...(d.status === 'draft' && !d.waiting
              ? [{ key: 'edit', label: tr('common:action.edit'), icon: 'pencil-outline' as const, onPress: () => router.push(`${routeFor(d)}/edit` as never) }]
              : []),
            { key: 'preview', label: tr('common:table.preview'), icon: 'file-document-outline', onPress: () => router.push(`/(app)/documents/${d.id}` as never) },
          ]}
          empty={
            loading ? null : (
              <EmptyState
                illustration="no-documents"
                icon="file-search-outline"
                title={noneAtAll ? tr('common:documentList.emptyNoneTitle', { kind: documentKindLabel(tr, kind, 2) }) : tr('common:documentList.emptyNoMatchTitle')}
                message={noneAtAll ? tr('common:documentList.emptyNoneMessage', { kind: documentKindLabel(tr, kind, 1) }) : tr('common:documentList.emptyNoMatchMessage')}
                actionLabel={noneAtAll ? emptyAction : tr('common:documentList.clearFilters')}
                onAction={noneAtAll ? onEmptyAction : () => setFilters(DEFAULT_FILTERS)}
                compact
              />
            )
          }
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }}>
        <SearchBar
          value={filters.query}
          onChangeText={(query) => setFilters((f) => ({ ...f, query }))}
          placeholder={tr('common:documentList.search', { kind: documentKindLabel(tr, kind, 2) })}
          right={
            <Pressable
              onPress={() => setFilterOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={tr('common:filters.title')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
            >
              <Icon
                name="tune-variant"
                size={19}
                color={activeFilterCount ? t.c.primary : t.c.muted}
              />
              {activeFilterCount ? (
                <Text variant="micro" tone="primary" weight="700">
                  {activeFilterCount}
                </Text>
              ) : null}
            </Pressable>
          }
        />

        {availableStatuses.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: t.spacing.sm, paddingRight: t.spacing.lg }}
          >
            {availableStatuses.map((s) => {
              const active = filters.statuses.includes(s);
              const label = statusLabel(tr, s);
              return (
                <Pressable
                  key={s}
                  onPress={() => toggleStatus(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={tr('common:documentList.filterByStatus', { status: label })}
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
                    {label} · {statusCount(s)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {headerExtra}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="caption" tone="muted">
            {tr('common:documentList.count', {
              count,
              kind: documentKindLabel(tr, kind, count),
            })}
          </Text>
          <Text variant="caption" weight="600">
            {formatMoney(total)}
          </Text>
        </View>
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
        <Card padded={false}>
          {loading ? (
            <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />
          ) : filtered.length === 0 ? (
            <EmptyState
              illustration="no-documents" icon="file-search-outline"
              title={noneAtAll ? tr('common:documentList.emptyNoneTitle', { kind: documentKindLabel(tr, kind, 2) }) : tr('common:documentList.emptyNoMatchTitle')}
              message={noneAtAll ? tr('common:documentList.emptyNoneMessage', { kind: documentKindLabel(tr, kind, 1) }) : tr('common:documentList.emptyNoMatchMessage')}
              actionLabel={noneAtAll ? emptyAction : tr('common:documentList.clearFilters')}
              onAction={noneAtAll ? onEmptyAction : () => setFilters(DEFAULT_FILTERS)}
              compact
            />
          ) : (
            filtered.map((d, i) => (
              <Stagger key={d.id} index={i}>
                <DocumentRow
                  document={asRowData(d)}
                  partyName={d.partyName}
                  divider={i < filtered.length - 1}
                  onPress={() => router.push(routeFor(d) as never)}
                />
              </Stagger>
            ))
          )}
        </Card>
        {moreFooter}
      </ScrollView>

      <Sheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title={tr('common:filters.title')}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <Button
              title={tr('common:filters.reset')}
              variant="ghost"
              onPress={() => setFilters(DEFAULT_FILTERS)}
              style={{ flex: 1 }}
            />
            <Button title={tr('common:filters.apply')} onPress={() => setFilterOpen(false)} style={{ flex: 1 }} />
          </View>
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.xl }}>
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('common:filters.dateRange')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {DATE_RANGE_PRESET_KEYS.map((p) => {
                const active = filters.range === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setFilters((f) => ({ ...f, range: p }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={{
                      paddingHorizontal: t.spacing.md,
                      paddingVertical: 7,
                      borderRadius: t.radius.pill,
                      backgroundColor: active ? t.c.chip : t.c.card2,
                      borderWidth: 1,
                      borderColor: active ? t.c.primary : t.c.line,
                    }}
                  >
                    <Text variant="caption" weight="600" tone={active ? 'primary' : 'muted'}>
                      {dateRangeLabel(tr, p)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('common:filters.status')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {availableStatuses.map((s) => {
                const active = filters.statuses.includes(s);
                return (
                  <Pressable key={s} onPress={() => toggleStatus(s)} accessibilityRole="button">
                    <Badge label={statusLabel(tr, s)} tone={active ? STATUS_TONE[s] : 'neutral'} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          {filters.partyId ? (
            <Button
              title={tr('common:filters.clearParty')}
              variant="ghost"
              onPress={() => setFilters((f) => ({ ...f, partyId: null }))}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
