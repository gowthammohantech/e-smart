import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
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
import { StatusBadge } from '@esmart/ui/components/Badge';
import { Avatar } from '@esmart/ui/components/Avatar';
import { Cell, DataTable, type Column, type Sort } from '@esmart/ui/components/DataTable';
import { FilterMenu } from '@esmart/ui/components/FilterMenu';
import type { DocStatus, DocumentKind } from '@esmart/core/types';
import { PURCHASE_KINDS, STATUS_TONE, isFinalized, nextStatuses } from '@esmart/core/domain/documentStates';
import { dateRangeLabel, documentKindLabel, statusLabel } from '@esmart/core/labels';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, resolveRange } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { StatTile } from '@esmart/ui/components/StatTile';
import { StatGrid } from '@esmart/ui/components/Layout';
import { zero, type Money } from '@esmart/core/lib/money';
import { useAppStore } from '../store/appStore';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast } from '@esmart/ui/components/Toast';
import { api } from '../remote/api';
import { describeError } from '../remote/errors';
import { useBaseCurrency } from '../store/selectors';
import { useDocumentPages, useDocumentSummary, usePartyRecord, type DocumentQuery } from '../remote/queries';
import { useDebounced } from './useDebounced';
import { pagedTableProps, useRowsExport, useTableSelection } from './pagedTable';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { listParam, presetParam, useQueryParams } from '../navigation/queryParams';
import { CardRowsSkeleton, MoreRowsSkeleton } from './ScreenSkeleton';
import { Skeleton, SkeletonGroup, SkeletonStatGrid } from '@esmart/ui/components/Skeleton';
import { ALL_BRANCHES, BranchChip, BranchFilterMenu, useListBranch } from './branchFilter';

export type DocumentListFilters = {
  query: string;
  statuses: DocStatus[];
  range: DateRangePreset;
  partyId: string | null;
  /** `?branch=`: a branch, `all`, or null to follow the top bar's branch. */
  branch: string | null;
};

const DEFAULT_FILTERS: DocumentListFilters = {
  query: '',
  statuses: [],
  range: 'all',
  partyId: null,
  branch: null,
};

/** One row of a list: the server's summary of a document. */
type Row = { id: string; number: string; date: string; dueDate?: string; status: DocStatus; partyId?: string; partyName: string; grandTotal: Money; outstanding?: Money; supplierDocNumber?: string };
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
  const { t: tr } = useTranslation(['common', 'domain', 'sales']);
  const router = useRouter();
  const baseCurrency = useBaseCurrency();

  // Status, date range, party and branch live in the URL (`?status=draft&range=thisMonth&party=…`);
  // the search box stays local so typing doesn't rewrite the URL on every key.
  const [params, setParams] = useQueryParams();
  // The branch the hubs count in (the top bar's) unless another was picked here.
  const branch = useListBranch(params);
  const [query, setQuery] = useState('');
  const search = useDebounced(query);
  const filters = useMemo<DocumentListFilters>(
    () => ({
      query,
      statuses: listParam.parse<DocStatus>(params.status),
      range: presetParam(params.range, DEFAULT_FILTERS.range),
      partyId: params.party ?? null,
      branch: params.branch ?? null,
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
      branch: f.branch ?? undefined,
    };
    if (url.status !== params.status || url.range !== params.range || url.party !== params.party || url.branch !== params.branch) setParams(url);
  };
  const setBranch = (value: string) => setFilters((f) => ({ ...f, branch: branch.paramFor(value) ?? null }));
  const [filterOpen, setFilterOpen] = useState(false);
  const desktop = useIsDesktop();
  const [sort, setSort] = useState<Sort | null>(null);

  const serverQuery = useMemo<DocumentQuery>(() => {
    const range = filters.range === 'all' ? undefined : resolveRange(filters.range);
    return { kinds: [kind], statuses: filters.statuses, partyId: filters.partyId ?? undefined, branchId: branch.branchId, from: range?.from, to: range?.to, q: search };
  }, [kind, filters.statuses, filters.partyId, branch.branchId, filters.range, search]);
  const pages = useDocumentPages({ ...serverQuery, sort: sort && SERVER_SORT[sort.key] ? ((sort.dir === 'desc' ? '-' : '') + SERVER_SORT[sort.key]) as DocumentQuery['sort'] : undefined });
  const summary = useDocumentSummary(serverQuery);
  const companyId = useAppStore((s) => s.activeCompanyId);

  const rows = useMemo<Row[]>(
    () =>
      pages.rows.map((d) => ({ id: d.id!, number: d.number ?? '', date: d.date!, dueDate: d.dueDate, status: d.status as DocStatus, partyId: d.partyId, partyName: d.partyName ?? '—', grandTotal: d.grandTotal as Money, outstanding: d.outstanding as Money | undefined, supplierDocNumber: d.supplierDocNumber || undefined })),
    [pages.rows],
  );

  const availableStatuses = useMemo(() => (summary.data?.byStatus ?? []).map((b) => b.status as DocStatus), [summary.data]);
  const statusCount = (st: DocStatus) => summary.data?.byStatus.find((b) => b.status === st)?.count ?? 0;
  const count = summary.data?.count ?? rows.length;
  const total = (summary.data?.total as Money | undefined) ?? zero(baseCurrency);
  const filtered = rows;

  const activeFilterCount =
    filters.statuses.length + (filters.partyId ? 1 : 0) + (filters.range !== 'all' ? 1 : 0) + (branch.shown && branch.overridden ? 1 : 0);
  // Nothing of this kind at all (in the top bar's branch, by default), as against nothing matching the filters.
  const noneAtAll = !activeFilterCount && !search && summary.data?.count === 0;
  const loading = (pages.isLoading || summary.isLoading) && !rows.length;
  // Rows can land before the summary: the count and total wait for it, not "50 invoices · ₹0.00".
  const totalsPending = loading || (!summary.data && summary.isLoading);
  // The list couldn't load: say so with a retry, never "Nothing matches" or a ₹0 total.
  const failed = pages.isError && !rows.length;
  const retry = () => {
    void pages.refetch();
    void summary.refetch();
  };
  // Opened from a contact (?party=…): the filter names who it is, and can be taken off.
  const filterParty = usePartyRecord(filters.partyId ?? undefined).data;
  const purchaseKind = PURCHASE_KINDS.includes(kind);
  const partyChip = filters.partyId ? (
    <Pressable
      onPress={() => setFilters((f) => ({ ...f, partyId: null }))}
      accessibilityRole="button"
      accessibilityLabel={tr('common:documentList.clearPartyNamed', { name: filterParty?.name ?? '' })}
      hitSlop={{ top: 4, bottom: 4 }}
      style={{
        height: 36,
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: t.spacing.md,
        borderRadius: t.radius.pill,
        backgroundColor: t.c.chip,
        borderWidth: 1,
        borderColor: t.c.primary,
      }}
    >
      <Icon name={purchaseKind ? 'truck-outline' : 'account-outline'} size={15} color={t.c.primary} />
      {filterParty ? (
        <Text variant="caption" weight="600" tone="primary" numberOfLines={1} style={{ maxWidth: 220 }}>
          {tr(purchaseKind ? 'common:documentList.supplierFilter' : 'common:documentList.customerFilter', { name: filterParty.name })}
        </Text>
      ) : (
        // The contact is still on its way: a bar, not "Customer: …".
        <Skeleton height={10} width={110} radius={4} />
      )}
      <Icon name="close" size={15} color={t.c.primary} />
    </Pressable>
  ) : null;
  const failedState = (
    <EmptyState
      icon="cloud-off-outline"
      title={tr('common:table.loadFailed')}
      message={tr('common:documentList.loadFailedBody')}
      actionLabel={tr('common:action.retry')}
      onAction={retry}
      compact
    />
  );
  /** A status chip: selected ones in the chip fill with primary text, which reads at small sizes. */
  const chipStyle = (active: boolean) => ({
    height: 36,
    justifyContent: 'center' as const,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.radius.pill,
    backgroundColor: active ? t.c.chip : t.c.paper,
    borderWidth: 1,
    borderColor: active ? t.c.primary : t.c.line,
  });
  const loadMore = () => {
    if (pages.hasNextPage && !pages.isFetchingNextPage) void pages.fetchNextPage();
  };
  // Desktop bulk action: the chosen documents as a CSV.
  const selection = useTableSelection(`${kind}|${search}|${branch.branchId ?? ''}|${JSON.stringify(filters)}`);
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
      {pages.isFetchingNextPage ? <MoreRowsSkeleton /> : <Button title={tr('common:documentList.loadMore')} variant="ghost" size="sm" onPress={loadMore} />}
    </View>
  ) : null;

  // The KPI tiles over the desktop table: the list's total, and the statuses that matter for
  // this kind (only those it has). Each one toggles that status filter, like its chip.
  const TILE_STATUSES: Partial<Record<DocumentKind, DocStatus[]>> = {
    invoice: ['overdue', 'issued', 'paid'],
    purchaseBill: ['overdue', 'issued', 'paid'],
    quote: ['draft', 'sent', 'accepted'],
  };
  const TILE_TONE = { success: 'good', warning: 'warn', danger: 'bad', info: 'primary', neutral: 'default' } as const;
  const byStatus = summary.data?.byStatus ?? [];
  const tileStatuses = (TILE_STATUSES[kind] ?? [...byStatus].sort((a, b) => b.count - a.count).map((b) => b.status as DocStatus))
    .filter((st) => byStatus.some((b) => b.status === st && b.count > 0))
    .slice(0, 3);

  // Bulk changes, straight to the server (list rows aren't in the store): delete the drafts among
  // the chosen, or mark the ones that can go draft → sent (a quote). Each says how it went.
  const toast = useToast();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const chosenRows = (keys: string[]) => rows.filter((r) => keys.includes(r.id));
  const draftsIn = (keys: string[]) => chosenRows(keys).filter((r) => r.status === 'draft');
  const sendableIn = (keys: string[]) => chosenRows(keys).filter((r) => nextStatuses(kind, r.status).includes('sent'));
  const runBulk = async (targets: Row[], call: (r: Row) => Promise<{ error?: unknown }>, doneKey: 'common:table.deletedDrafts' | 'common:table.markedSent') => {
    setBulkBusy(true);
    let ok = 0;
    let firstError: unknown;
    for (const r of targets) {
      const res = await call(r).catch((error: unknown) => ({ error }));
      if (res.error) firstError ??= res.error;
      else ok++;
    }
    setBulkBusy(false);
    selection.clear();
    void pages.refetch();
    void summary.refetch();
    if (ok) toast.show(tr(doneKey, { count: ok }), 'success');
    if (firstError) toast.show(tr('common:table.someFailed', { count: targets.length - ok, reason: describeError(firstError, tr) }), 'error');
  };
  const deleteDrafts = (ids: string[]) =>
    runBulk(
      draftsIn(ids),
      (r) => api.DELETE('/companies/{companyId}/documents/{id}', { params: { path: { companyId, id: r.id } } }),
      'common:table.deletedDrafts',
    );
  const markSent = (keys: string[]) =>
    runBulk(
      sendableIn(keys),
      (r) => api.POST('/companies/{companyId}/documents/{id}/status', { params: { path: { companyId, id: r.id } }, body: { status: 'sent' } }),
      'common:table.markedSent',
    );
  // On a phone row: what an issued invoice or bill still owes, and by when.
  const owingLabel = (d: Row) => {
    if (!(kind === 'invoice' || kind === 'purchaseBill') || !isFinalized(d.status) || d.status === 'cancelled' || !d.outstanding || d.outstanding.minor <= 0) return undefined;
    return d.dueDate
      ? tr('common:documentList.owingBy', { amount: formatMoney(d.outstanding), date: formatDate(d.dueDate, 'dd MMM') })
      : tr('common:documentList.owing', { amount: formatMoney(d.outstanding) });
  };
  const payable = (d: Row) => (kind === 'invoice' || kind === 'purchaseBill') && isFinalized(d.status) && !!d.partyId && (d.outstanding?.minor ?? 0) > 0;

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
      {
        key: 'number',
        header: tr('common:table.number'),
        width: 170,
        render: (d) => (
          <View style={{ gap: 2, maxWidth: '100%' }}>
            <Cell weight="600">{!d.number || (d.status === 'draft' && d.number.endsWith('-DRAFT')) ? tr('common:documentList.draftNumber') : d.number}</Cell>
            {/* A bill is looked up by the supplier's own number as often as by ours. */}
            {d.supplierDocNumber ? <Cell tone="muted">{tr('sales:detail.theirNumber', { number: d.supplierDocNumber })}</Cell> : null}
          </View>
        ),
        sortValue: (d) => d.number,
      },
      {
        key: 'party',
        header: purchase ? tr('common:table.supplier') : tr('common:table.customer'),
        flex: 2,
        render: (d) => (
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, maxWidth: '100%' }}>
            <Avatar name={d.partyName} size={26} />
            {/* Takes the column's width before it truncates. */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Cell>{d.partyName}</Cell>
            </View>
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
        {summary.data && summary.data.count + byStatus.length > 0 ? (
          <StatGrid>
            <StatTile
              label={documentKindLabel(tr, kind, 2)}
              value={total}
              icon="file-document-multiple-outline"
              caption={tr('common:documentList.tileCount', { count: summary.data.count })}
            />
            {tileStatuses.map((st) => {
              const b = byStatus.find((x) => x.status === st)!;
              return (
                <StatTile
                  key={st}
                  label={statusLabel(tr, st)}
                  value={b.total as Money}
                  tone={TILE_TONE[STATUS_TONE[st] as keyof typeof TILE_TONE] ?? 'default'}
                  caption={tr('common:documentList.tileCount', { count: b.count })}
                  onPress={() => toggleStatus(st)}
                />
              );
            })}
          </StatGrid>
        ) : !summary.data && summary.isLoading ? (
          <SkeletonGroup>
            <SkeletonStatGrid tiles={4} across />
          </SkeletonGroup>
        ) : null}
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
          <BranchFilterMenu branch={branch} onChange={setBranch} />
          {availableStatuses.map((st) => {
            const active = filters.statuses.includes(st);
            return (
              <Pressable
                key={st}
                onPress={() => toggleStatus(st)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tr('common:documentList.filterByStatus', { status: statusLabel(tr, st) })}
                style={chipStyle(active)}
              >
                <Text variant="caption" weight="600" tone={active ? 'primary' : 'muted'}>
                  {statusLabel(tr, st)} · {statusCount(st)}
                </Text>
              </Pressable>
            );
          })}
          {partyChip}
          {activeFilterCount || filters.query ? (
            <Text variant="caption" tone="primary" weight="600" accessibilityRole="button" onPress={() => setFilters(DEFAULT_FILTERS)}>
              {tr('common:table.clear')}
            </Text>
          ) : null}
          {/* How many match and what they add up to, at the right end of the filter row. */}
          {failed || summary.isError ? null : totalsPending ? (
            <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
              <Skeleton height={12} width={80} radius={4} />
              <Skeleton height={18} width={90} radius={4} />
            </View>
          ) : (
            <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.md }}>
              <Text variant="small" tone="muted">
                {tr('common:documentList.count', { count, kind: documentKindLabel(tr, kind, count) })}
              </Text>
              <Text variant="title" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
                {formatMoney(total)}
              </Text>
            </View>
          )}
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
          totalCount={summary.data ? summary.data.count : undefined}
          selectable
          selectedKeys={selection.selected}
          onSelectionChange={selection.setSelected}
          bulkActions={(keys) => (
            <>
              <Button title={tr('common:table.exportCsv')} icon="file-export-outline" variant="ghost" size="sm" onPress={() => void exportChosen(keys)} />
              {sendableIn(keys).length ? (
                <Button title={tr('common:table.markSent')} icon="send-outline" variant="ghost" size="sm" loading={bulkBusy} onPress={() => void markSent(keys)} />
              ) : null}
              {draftsIn(keys).length ? (
                <Button title={tr('common:table.deleteDrafts')} icon="trash-can-outline" variant="danger" size="sm" disabled={bulkBusy} onPress={() => setConfirmDelete(keys)} />
              ) : null}
            </>
          )}
          rowActions={(d) => [
            { key: 'open', label: tr('common:table.open'), icon: 'eye-outline', onPress: () => router.push(routeFor(d) as never) },
            // As on the detail screen: only a draft is edited in place.
            ...(d.status === 'draft'
              ? [{ key: 'edit', label: tr('common:action.edit'), icon: 'pencil-outline' as const, onPress: () => router.push(`${routeFor(d)}/edit` as never) }]
              : []),
            ...(payable(d)
              ? [
                  {
                    key: 'pay',
                    label: kind === 'purchaseBill' ? tr('sales:detail.paySupplier') : tr('common:action.recordPayment'),
                    icon: 'cash-plus' as const,
                    onPress: () =>
                      router.push(`/(app)/payments/new?direction=${kind === 'invoice' ? 'received' : 'paid'}&partyId=${d.partyId}&documentId=${d.id}` as never),
                  },
                ]
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
        <ConfirmDialog
          visible={!!confirmDelete}
          title={tr('common:table.deleteDraftsTitle', { count: confirmDelete ? draftsIn(confirmDelete).length : 0 })}
          message={tr('common:table.deleteDraftsBody')}
          confirmLabel={tr('common:table.deleteDrafts')}
          destructive
          icon="trash-can-outline"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const ids = confirmDelete ?? [];
            setConfirmDelete(null);
            void deleteDrafts(ids);
          }}
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
          // Short enough not to be cut off on a phone; the desktop's says what it searches.
          placeholder={tr('common:documentList.searchShort', { kind: documentKindLabel(tr, kind, 2) })}
          right={
            <Pressable
              onPress={() => setFilterOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={tr('common:filters.title')}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, minWidth: 44, minHeight: 44 }}
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
            contentContainerStyle={{ gap: t.spacing.sm, paddingRight: t.spacing.lg, paddingVertical: 4 }}
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
                  // 36 tall with 4 above and below to tap: 44 in all.
                  hitSlop={{ top: 4, bottom: 4 }}
                  style={chipStyle(active)}
                >
                  <Text variant="caption" weight="600" tone={active ? 'primary' : 'muted'}>
                    {label} · {statusCount(s)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {partyChip || (branch.shown && branch.branchId) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
            {partyChip}
            <BranchChip branch={branch} onClear={() => setBranch(ALL_BRANCHES)} />
          </View>
        ) : null}

        {headerExtra}

        {failed || summary.isError ? null : totalsPending ? (
          // Not "0 invoices · ₹0.00" before the count is in.
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 16 }}>
            <Skeleton height={10} width={90} radius={4} />
            <Skeleton height={10} width={60} radius={4} />
          </View>
        ) : (
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
        )}
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
            <CardRowsSkeleton />
          ) : failed ? (
            failedState
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
                  detail={d.supplierDocNumber ? tr('sales:detail.theirNumber', { number: d.supplierDocNumber }) : undefined}
                  outstandingLabel={owingLabel(d)}
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
                    hitSlop={{ top: 4, bottom: 4 }}
                    style={chipStyle(active)}
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
                  <Pressable
                    key={s}
                    onPress={() => toggleStatus(s)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={tr('common:documentList.filterByStatus', { status: statusLabel(tr, s) })}
                    hitSlop={{ top: 4, bottom: 4 }}
                    style={[chipStyle(active), { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                  >
                    {active ? <Icon name="check" size={14} color={t.c.primary} /> : null}
                    <Text variant="caption" weight="600" tone={active ? 'primary' : 'muted'}>
                      {statusLabel(tr, s)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {branch.shown ? (
            <View style={{ gap: t.spacing.sm }}>
              <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('common:filters.branch')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
                {[{ id: ALL_BRANCHES, name: tr('common:component.allBranches') }, ...branch.branches].map((b) => {
                  const active = (branch.branchId ?? ALL_BRANCHES) === b.id;
                  return (
                    <Pressable
                      key={b.id}
                      onPress={() => setBranch(b.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      hitSlop={{ top: 4, bottom: 4 }}
                      style={[chipStyle(active), { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                    >
                      {active ? <Icon name="check" size={14} color={t.c.primary} /> : null}
                      <Text variant="caption" weight="600" tone={active ? 'primary' : 'muted'}>
                        {b.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {filters.partyId ? (
            <Button
              title={filterParty?.name ? tr('common:documentList.clearPartyNamed', { name: filterParty.name }) : tr('common:filters.clearParty')}
              variant="ghost"
              onPress={() => setFilters((f) => ({ ...f, partyId: null }))}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
