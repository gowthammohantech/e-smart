import React, { useMemo, useState, useCallback} from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { DocumentRow } from '@esmart/ui/components/DocumentRow';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Sheet } from '@esmart/ui/components/Sheet';
import { Button } from '@esmart/ui/components/Button';
import { Badge, StatusBadge } from '@esmart/ui/components/Badge';
import { Avatar } from '@esmart/ui/components/Avatar';
import { Cell, DataTable, type Column } from '@esmart/ui/components/DataTable';
import { FilterMenu } from '@esmart/ui/components/FilterMenu';
import { outstandingOf } from '@esmart/core/domain/receivables';
import { BusinessDocument, DocStatus, DocumentKind } from '@esmart/core/types';
import { PURCHASE_KINDS, STATUS_TONE } from '@esmart/core/domain/documentStates';
import { dateRangeLabel, documentKindLabel, statusLabel } from '@esmart/core/labels';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, inRange, resolveRange } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money, sum, zero } from '@esmart/core/lib/money';
import { useBaseCurrency, useParties, usePayments } from '../store/selectors';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';

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

/**
 * Shared list view for every document kind: search, status chips, date range
 * and party filter, with a running total of what is on screen.
 */
export function DocumentListView({
  documents,
  kind,
  routeFor,
  emptyAction,
  onEmptyAction,
  headerExtra,
}: {
  documents: BusinessDocument[];
  kind: DocumentKind;
  routeFor: (doc: BusinessDocument) => string;
  emptyAction?: string;
  onEmptyAction?: () => void;
  headerExtra?: React.ReactNode;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain']);
  const router = useRouter();
  const baseCurrency = useBaseCurrency();
  const parties = useParties();

  const [filters, setFilters] = useState<DocumentListFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const desktop = useIsDesktop();
  const payments = usePayments();

  const nameOf = useCallback(
    (id: string) => parties.find((p) => p.id === id)?.name ?? 'Unknown',
    [parties],
  );

  const availableStatuses = useMemo(() => {
    const set = new Set<DocStatus>();
    documents.forEach((d) => set.add(d.status));
    return Array.from(set);
  }, [documents]);

  const filtered = useMemo(() => {
    const range = resolveRange(filters.range);
    const q = filters.query.trim().toLowerCase();
    return documents.filter((d) => {
      if (filters.statuses.length && !filters.statuses.includes(d.status)) return false;
      if (filters.partyId && d.partyId !== filters.partyId) return false;
      if (filters.range !== 'all' && !inRange(d.date, range)) return false;
      if (q) {
        const haystack = `${d.number} ${nameOf(d.partyId)} ${d.reference ?? ''} ${d.supplierDocNumber ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [documents, filters, nameOf]);

  const total = useMemo(
    () =>
      filtered.length
        ? sum(
            filtered.map((d) => money(Math.round(d.totals.grandTotal.minor * (d.exchangeRate || 1)), baseCurrency)),
            baseCurrency,
          )
        : zero(baseCurrency),
    [filtered, baseCurrency],
  );

  const activeFilterCount =
    filters.statuses.length + (filters.partyId ? 1 : 0) + (filters.range !== 'all' ? 1 : 0);


  const toggleStatus = (s: DocStatus) =>
    setFilters((f) => ({
      ...f,
      statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s],
    }));

  // A desktop shows the list as a sortable table under a one-row filter bar.
  if (desktop) {
    const purchase = PURCHASE_KINDS.includes(kind);
    const owes = kind === 'invoice' || kind === 'purchaseBill';
    const columns: Column<BusinessDocument>[] = [
      { key: 'number', header: tr('common:table.number'), width: 170, render: (d) => <Cell weight="600">{d.number}</Cell>, sortValue: (d) => d.number },
      {
        key: 'party',
        header: purchase ? tr('common:table.supplier') : tr('common:table.customer'),
        flex: 2,
        render: (d) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, maxWidth: '100%' }}>
            <Avatar name={nameOf(d.partyId)} size={26} />
            <Cell>{nameOf(d.partyId)}</Cell>
          </View>
        ),
        sortValue: (d) => nameOf(d.partyId),
      },
      { key: 'date', header: tr('common:table.date'), width: 120, render: (d) => <Cell tone="muted">{formatDate(d.date, 'dd MMM yyyy')}</Cell>, sortValue: (d) => d.date },
      {
        key: 'due',
        header: tr('common:table.due'),
        width: 120,
        secondary: true,
        render: (d) => <Cell tone="muted">{d.dueDate || d.validUntil ? formatDate((d.dueDate ?? d.validUntil) as string, 'dd MMM yyyy') : '—'}</Cell>,
        sortValue: (d) => d.dueDate ?? d.validUntil ?? '',
      },
      { key: 'status', header: tr('common:table.status'), width: 130, render: (d) => <StatusBadge status={d.status} size="sm" />, sortValue: (d) => d.status },
      {
        key: 'amount',
        header: tr('common:table.amount'),
        width: 150,
        align: 'right',
        render: (d) => <Cell weight="600" mono>{formatMoney(d.totals.grandTotal)}</Cell>,
        sortValue: (d) => d.totals.grandTotal.minor * (d.exchangeRate || 1),
      },
      ...(owes
        ? [
            {
              key: 'outstanding',
              header: tr('common:table.outstanding'),
              width: 150,
              secondary: true,
              align: 'right' as const,
              render: (d: BusinessDocument) => {
                if (['draft', 'cancelled'].includes(d.status)) return <Cell tone="muted">—</Cell>;
                const due = outstandingOf(d, payments);
                return (
                  <Cell tone={due.minor > 0 ? 'default' : 'muted'} mono>
                    {formatMoney(due)}
                  </Cell>
                );
              },
              sortValue: (d: BusinessDocument) => outstandingOf(d, payments).minor,
            },
          ]
        : []),
    ];

    return (
      <View style={{ flex: 1, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg, gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: t.spacing.sm }}>
          <View style={{ width: 300 }}>
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
                  {statusLabel(tr, st)} · {documents.filter((d) => d.status === st).length}
                </Text>
              </Pressable>
            );
          })}
          {activeFilterCount || filters.query ? (
            <Text variant="caption" tone="primary" weight="600" accessibilityRole="button" onPress={() => setFilters(DEFAULT_FILTERS)}>
              {tr('common:table.clear')}
            </Text>
          ) : null}
        </View>

        {headerExtra}

        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(d) => d.id}
          onRowPress={(d) => router.push(routeFor(d) as never)}
          rowLabel={(d) => `${d.number}, ${nameOf(d.partyId)}, ${formatMoney(d.totals.grandTotal)}`}
          footer={{
            number: (
              <Cell tone="muted">
                {tr('common:documentList.count', { count: filtered.length, kind: documentKindLabel(tr, kind, filtered.length) })}
              </Cell>
            ),
            amount: (
              <Cell weight="700" mono>
                {formatMoney(total)}
              </Cell>
            ),
          }}
          empty={
            <EmptyState
              illustration="no-documents"
              icon="file-search-outline"
              title={
                documents.length === 0
                  ? tr('common:documentList.emptyNoneTitle', { kind: documentKindLabel(tr, kind, 2) })
                  : tr('common:documentList.emptyNoMatchTitle')
              }
              message={
                documents.length === 0
                  ? tr('common:documentList.emptyNoneMessage', { kind: documentKindLabel(tr, kind, 1) })
                  : tr('common:documentList.emptyNoMatchMessage')
              }
              actionLabel={documents.length === 0 ? emptyAction : tr('common:documentList.clearFilters')}
              onAction={documents.length === 0 ? onEmptyAction : () => setFilters(DEFAULT_FILTERS)}
              compact
            />
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
              <MaterialCommunityIcons
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
                    {label} · {documents.filter((d) => d.status === s).length}
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
              count: filtered.length,
              kind: documentKindLabel(tr, kind, filtered.length),
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
      >
        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState
              illustration="no-documents" icon="file-search-outline"
              title={
                documents.length === 0
                  ? tr('common:documentList.emptyNoneTitle', { kind: documentKindLabel(tr, kind, 2) })
                  : tr('common:documentList.emptyNoMatchTitle')
              }
              message={
                documents.length === 0
                  ? tr('common:documentList.emptyNoneMessage', { kind: documentKindLabel(tr, kind, 1) })
                  : tr('common:documentList.emptyNoMatchMessage')
              }
              actionLabel={documents.length === 0 ? emptyAction : tr('common:documentList.clearFilters')}
              onAction={documents.length === 0 ? onEmptyAction : () => setFilters(DEFAULT_FILTERS)}
              compact
            />
          ) : (
            filtered.map((d, i) => (
              <DocumentRow
                key={d.id}
                document={d}
                partyName={nameOf(d.partyId)}
                divider={i < filtered.length - 1}
                onPress={() => router.push(routeFor(d) as never)}
              />
            ))
          )}
        </Card>
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
