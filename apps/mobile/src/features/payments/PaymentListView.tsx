import React, { useMemo, useState, useCallback} from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { Badge } from '@/components/Badge';
import { Avatar } from '@/components/Avatar';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { PaymentDirection } from '@/types';
import { dateRangeLabel, paymentMethodLabel } from '@/i18n/labels';
import { formatMoney } from '@/lib/format';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, inRange, resolveRange } from '@/lib/date';
import { money, sum, zero } from '@/lib/money';
import { useBaseCurrency, useParties, usePayments } from '@/store/selectors';

export function PaymentListView({ direction }: { direction: PaymentDirection }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'sales']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  const payments = usePayments(direction);
  const parties = useParties();

  const [query, setQuery] = useState('');
  const [range, setRange] = useState<DateRangePreset>('all');

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
      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder={tr('sales:list.search')} />
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="caption" tone="muted">
            {filtered.length} payments
          </Text>
          <Text variant="caption" weight="700" tone={direction === 'received' ? 'good' : 'bad'}>
            {formatMoney(total)}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
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

      <Fab icon="plus" onPress={() => router.push(`/(app)/payments/new?direction=${direction}`)} />
    </View>
  );
}
