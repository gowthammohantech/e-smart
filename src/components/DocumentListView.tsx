import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from './Card';
import { Text } from './Text';
import { SearchBar } from './SearchBar';
import { DocumentRow } from './DocumentRow';
import { EmptyState } from './EmptyState';
import { Sheet } from './Sheet';
import { Button } from './Button';
import { Badge } from './Badge';
import { BusinessDocument, DocStatus, DocumentKind } from '@/types';
import { DOCUMENT_LABELS, STATUS_META } from '@/domain/documentStates';
import { DATE_RANGE_PRESETS, DateRangePreset, inRange, resolveRange } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { money, sum, zero } from '@/lib/money';
import { useBaseCurrency, useParties } from '@/store/selectors';

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
  const router = useRouter();
  const baseCurrency = useBaseCurrency();
  const parties = useParties();

  const [filters, setFilters] = useState<DocumentListFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const nameOf = (id: string) => parties.find((p) => p.id === id)?.name ?? 'Unknown';

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
  }, [documents, filters, parties]);

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

  const label = DOCUMENT_LABELS[kind];

  const toggleStatus = (s: DocStatus) =>
    setFilters((f) => ({
      ...f,
      statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s],
    }));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }}>
        <SearchBar
          value={filters.query}
          onChangeText={(query) => setFilters((f) => ({ ...f, query }))}
          placeholder={`Search ${label.plural.toLowerCase()}`}
          right={
            <Pressable
              onPress={() => setFilterOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Filters"
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
              const meta = STATUS_META[s];
              return (
                <Pressable
                  key={s}
                  onPress={() => toggleStatus(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Filter by ${meta.label}`}
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
                    {meta.label} · {documents.filter((d) => d.status === s).length}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {headerExtra}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="caption" tone="muted">
            {filtered.length} {filtered.length === 1 ? label.singular.toLowerCase() : label.plural.toLowerCase()}
          </Text>
          <Text variant="caption" weight="600">
            {formatMoney(total)}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState
              icon="file-search-outline"
              title={documents.length === 0 ? `No ${label.plural.toLowerCase()} yet` : 'Nothing matches'}
              message={
                documents.length === 0
                  ? `Create your first ${label.singular.toLowerCase()} to see it here.`
                  : 'Try clearing a filter or searching for something else.'
              }
              actionLabel={documents.length === 0 ? emptyAction : 'Clear filters'}
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
        title="Filters"
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <Button
              title="Reset"
              variant="ghost"
              onPress={() => setFilters(DEFAULT_FILTERS)}
              style={{ flex: 1 }}
            />
            <Button title="Apply" onPress={() => setFilterOpen(false)} style={{ flex: 1 }} />
          </View>
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.xl }}>
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Date range
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {DATE_RANGE_PRESETS.map((p) => {
                const active = filters.range === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setFilters((f) => ({ ...f, range: p.key }))}
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
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Status
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {availableStatuses.map((s) => {
                const active = filters.statuses.includes(s);
                return (
                  <Pressable key={s} onPress={() => toggleStatus(s)} accessibilityRole="button">
                    <Badge label={STATUS_META[s].label} tone={active ? STATUS_META[s].tone : 'neutral'} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          {filters.partyId ? (
            <Button
              title="Clear party filter"
              variant="ghost"
              onPress={() => setFilters((f) => ({ ...f, partyId: null }))}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
