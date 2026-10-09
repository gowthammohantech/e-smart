import React, { useMemo, useState, useCallback} from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { FilterMenu } from '@esmart/ui/components/FilterMenu';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Badge } from '@esmart/ui/components/Badge';
import { Avatar } from '@esmart/ui/components/Avatar';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { PaymentDirection } from '@esmart/core/types';
import { dateRangeLabel, paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney } from '@esmart/core/lib/format';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, inRange, resolveRange } from '@esmart/core/lib/date';
import { money, sum, zero } from '@esmart/core/lib/money';
import { useBaseCurrency, useParties, usePayments } from '../../store/selectors';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';

export function PaymentListView({ direction }: { direction: PaymentDirection }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'sales']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  const payments = usePayments(direction);
  const parties = useParties();

  const [query, setQuery] = useState('');
  const [range, setRange] = useState<DateRangePreset>('all');
  const desktop = useIsDesktop();

  const nameOf = useCallback(
    (id: string) => parties.find((p) => p.id === id)?.name ?? 'Unknown',
    [parties],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const r = resolveRange(range);
    return payments.filter((p) => {
      if (range !== 'all' && !inRange(p.date, r)) return false;
      if (!q) return true;
      return `${p.number} ${nameOf(p.partyId)} ${p.reference ?? ''}`.toLowerCase().includes(q);
    });
  }, [payments, query, range, nameOf]);

  const total = useMemo(
    () =>
      filtered.length
        ? sum(
            filtered.map((p) => money(Math.round(p.amount.minor * (p.exchangeRate || 1)), baseCurrency)),
            baseCurrency,
          )
        : zero(baseCurrency),
    [filtered, baseCurrency],
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <View
        style={
          desktop
            ? { paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.md, flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }
            : { paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }
        }
      >
        <View style={desktop ? { width: 300 } : undefined}>
          <SearchBar value={query} onChangeText={setQuery} placeholder={tr('sales:list.search')} />
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
        {desktop ? null : (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" tone="muted">
            {filtered.length} payments
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
              { key: 'number', header: tr('common:table.number'), width: 150, render: (p) => <Cell weight="600">{p.number}</Cell>, sortValue: (p) => p.number },
              {
                key: 'party',
                header: direction === 'received' ? tr('common:table.customer') : tr('common:table.supplier'),
                flex: 2,
                render: (p) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, maxWidth: '100%' }}>
                    <Avatar name={nameOf(p.partyId)} size={26} />
                    <Cell>{nameOf(p.partyId)}</Cell>
                  </View>
                ),
                sortValue: (p) => nameOf(p.partyId),
              },
              { key: 'date', header: tr('common:table.date'), width: 120, render: (p) => <Cell tone="muted">{formatDate(p.date, 'dd MMM yyyy')}</Cell>, sortValue: (p) => p.date },
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
                    <Badge label={`${p.allocations.length} applied`} tone="neutral" size="sm" />
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
                sortValue: (p) => p.amount.minor * (p.exchangeRate || 1),
              },
            ]}
            rows={filtered}
            rowKey={(p) => p.id}
            onRowPress={(p) => router.push(`/(app)/payments/${p.id}`)}
            rowLabel={(p) => `${p.number}, ${formatMoney(p.amount)}`}
            footer={{
              number: <Cell tone="muted">{`${filtered.length} payments`}</Cell>,
              amount: <Cell weight="700" mono>{formatMoney(total)}</Cell>,
            }}
            empty={
              <EmptyState
                illustration="no-payments"
                icon="cash-remove"
                title={tr('sales:list.none')}
                message={payments.length === 0 ? 'Record one to see it here.' : 'Nothing matches this filter.'}
                compact
              />
            }
          />
        </View>
      ) : (
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState
              illustration="no-payments"
              icon="cash-remove"
              title={tr('sales:list.none')}
              message={payments.length === 0 ? 'Record one to see it here.' : 'Nothing matches this filter.'}
              actionLabel={payments.length === 0 ? 'Record payment' : undefined}
              onAction={payments.length === 0 ? () => router.push(`/(app)/payments/new?direction=${direction}`) : undefined}
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
                <Avatar name={nameOf(p.partyId)} size={38} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="body" weight="600" numberOfLines={1}>
                    {nameOf(p.partyId)}
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
                    <Badge label={`${p.allocations.length} applied`} tone="neutral" size="sm" />
                  )}
                </View>
              </Pressable>
            ))
          )}
        </Card>
      </ScrollView>
      )}

      <Fab icon="plus" onPress={() => router.push(`/(app)/payments/new?direction=${direction}`)} />
    </View>
  );
}
