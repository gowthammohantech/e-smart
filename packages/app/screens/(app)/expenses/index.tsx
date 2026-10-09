import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { SearchBar } from '@esmart/ui/components/SearchBar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { DonutChart } from '@esmart/ui/components/charts/DonutChart';
import { useBaseCurrency, useExpenseCategories, useExpenses } from '../../../store/selectors';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, inRange, resolveRange } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money, sum, zero } from '@esmart/core/lib/money';
import { dateRangeLabel, paymentMethodLabel } from '@esmart/core/labels';
import { SHOW_SCROLLBAR, useBreakpoint, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { SplitPane } from '@esmart/ui/components/Layout';
import { FilterMenu } from '@esmart/ui/components/FilterMenu';

export default function ExpensesList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'nav', 'purchases']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  const expenses = useExpenses();
  const categories = useExpenseCategories();

  const [query, setQuery] = useState('');
  const [range, setRange] = useState<DateRangePreset>('last30');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const desktop = useIsDesktop();
  // Too narrow for the summary column too; the table footer has the totals.
  const narrow = useBreakpoint() === 'tablet';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const r = resolveRange(range);
    return expenses.filter((e) => {
      if (range !== 'all' && !inRange(e.date, r)) return false;
      if (categoryId && e.categoryId !== categoryId) return false;
      if (!q) return true;
      const cat = categories.find((c) => c.id === e.categoryId)?.name ?? '';
      return `${e.number} ${cat} ${e.notes ?? ''}`.toLowerCase().includes(q);
    });
  }, [expenses, query, range, categoryId, categories]);

  const total = useMemo(
    () => (filtered.length ? sum(filtered.map((e) => money(Math.round(e.amount.minor * (e.exchangeRate || 1)), baseCurrency)), baseCurrency) : zero(baseCurrency)),
    [filtered, baseCurrency],
  );

  const taxTotal = useMemo(
    () => (filtered.length ? sum(filtered.map((e) => money(Math.round(e.taxAmount.minor * (e.exchangeRate || 1)), baseCurrency)), baseCurrency) : zero(baseCurrency)),
    [filtered, baseCurrency],
  );

  const slices = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((e) => {
      map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + Math.round(e.amount.minor * (e.exchangeRate || 1)));
    });
    return Array.from(map.entries()).map(([id, minor]) => ({
      label: categories.find((c) => c.id === id)?.name ?? 'Other',
      value: money(minor, baseCurrency),
    }));
  }, [filtered, categories, baseCurrency]);

  const rangeChips = DATE_RANGE_PRESET_KEYS.map((p) => {
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
  });

  const categoryChips = (
    <>
      <Pressable
        onPress={() => setCategoryId(null)}
        accessibilityRole="button"
        style={{
          paddingHorizontal: t.spacing.md,
          paddingVertical: 6,
          borderRadius: t.radius.pill,
          backgroundColor: !categoryId ? t.c.primary : t.c.card,
          borderWidth: !categoryId ? 0 : 1,
          borderColor: t.c.line,
        }}
      >
        <Text variant="caption" weight="600" style={{ color: !categoryId ? t.c.onPrimary : t.c.muted }}>{tr('purchases:expense.allCategories')}</Text>
      </Pressable>
      {categories.map((c) => {
        const active = categoryId === c.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => setCategoryId(active ? null : c.id)}
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
              {c.name}
            </Text>
          </Pressable>
        );
      })}
    </>
  );

  // A desktop: the expenses as a table, with totals and the category split
  // in a side column.
  if (desktop) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg, paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.lg, gap: t.spacing.md }}>
        <Stack.Screen options={{ title: tr('nav:title.expenses') }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: t.spacing.sm }}>
          <View style={{ width: 300 }}>
            <SearchBar value={query} onChangeText={setQuery} placeholder={tr('purchases:expense.search')} />
          </View>
          <FilterMenu
            icon="calendar-range"
            label={tr('common:filters.dateRange')}
            value={range}
            neutralValue={'all' as DateRangePreset}
            options={DATE_RANGE_PRESET_KEYS.map((p) => ({ value: p, label: dateRangeLabel(tr, p) }))}
            onChange={setRange}
          />
          <FilterMenu
            icon="shape-outline"
            label={tr('purchases:expense.allCategories')}
            value={categoryId ?? 'all'}
            neutralValue="all"
            options={[{ value: 'all', label: tr('purchases:expense.allCategories') }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            onChange={(v) => setCategoryId(v === 'all' ? null : v)}
          />
        </View>
        <SplitPane
          sideWidth={300}
          main={
            <DataTable
              columns={[
                { key: 'number', header: tr('common:table.number'), width: 150, render: (e) => <Cell weight="600">{e.number}</Cell>, sortValue: (e) => e.number },
                { key: 'date', header: tr('common:table.date'), width: 110, render: (e) => <Cell tone="muted">{formatDate(e.date, 'dd MMM yyyy')}</Cell>, sortValue: (e) => e.date },
                {
                  key: 'category',
                  header: tr('common:table.category'),
                  flex: 1.4,
                  render: (e) => {
                    const cat = categories.find((c) => c.id === e.categoryId);
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, maxWidth: '100%' }}>
                        <MaterialCommunityIcons name={(cat?.icon ?? 'cash') as keyof typeof MaterialCommunityIcons.glyphMap} size={16} color={cat?.color ?? t.c.muted} />
                        <Cell>{cat?.name ?? 'Uncategorised'}</Cell>
                      </View>
                    );
                  },
                  sortValue: (e) => categories.find((c) => c.id === e.categoryId)?.name ?? '',
                },
                { key: 'notes', secondary: true, header: tr('common:table.reference'), flex: 1.6, render: (e) => <Cell tone="muted">{e.notes || e.reference || '—'}</Cell> },
                { key: 'tax', secondary: true, header: tr('common:table.tax'), width: 120, align: 'right', render: (e) => <Cell tone="muted" mono>{formatMoney(e.taxAmount)}</Cell> },
                { key: 'amount', header: tr('common:table.amount'), width: 120, align: 'right', render: (e) => <Cell weight="600" mono>{formatMoney(e.amount)}</Cell>, sortValue: (e) => e.amount.minor * (e.exchangeRate || 1) },
              ]}
              rows={filtered}
              rowKey={(e) => e.id}
              onRowPress={(e) => router.push(`/(app)/expenses/${e.id}`)}
              rowLabel={(e) => `${e.number}, ${formatMoney(e.amount)}`}
              footer={{
                number: <Cell tone="muted">{`${filtered.length} entries`}</Cell>,
                tax: <Cell weight="600" mono>{formatMoney(taxTotal)}</Cell>,
                amount: <Cell weight="700" mono>{formatMoney(total)}</Cell>,
              }}
              empty={
                <EmptyState
                  illustration="no-expenses"
                  icon="receipt-text-outline"
                  title={tr('purchases:expense.noExpenses')}
                  message={expenses.length === 0 ? 'Record your first expense to track where the money goes.' : 'Nothing matches this filter.'}
                  compact
                />
              }
            />
          }
          side={
            narrow ? null : (
            <>
              <StatTile label={tr('purchases:expense.totalSpent')} value={total} tone="warn" icon="receipt-text-outline" caption={`${filtered.length} entries`} />
              <StatTile label={tr('purchases:expense.inputTax')} value={taxTotal} icon="percent-outline" caption={tr('purchases:expense.claimable')} />
              {slices.length > 0 ? (
                <Card>
                  <DonutChart slices={slices} centerLabel="Total" />
                </Card>
              ) : null}
            </>
            )
          }
        />
        <Fab icon="plus" onPress={() => router.push('/(app)/expenses/new')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.expenses') }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder={tr('purchases:expense.search')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm, paddingRight: t.spacing.lg }}>
          {rangeChips}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <StatRow>
          <StatTile label={tr('purchases:expense.totalSpent')} value={total} tone="warn" icon="receipt-text-outline" caption={`${filtered.length} entries`} />
          <StatTile label={tr('purchases:expense.inputTax')} value={taxTotal} icon="percent-outline" caption={tr('purchases:expense.claimable')} />
        </StatRow>

        {slices.length > 0 ? (
          <Card style={{ marginTop: t.spacing.md }}>
            <DonutChart slices={slices} centerLabel="Total" />
          </Card>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm, paddingVertical: t.spacing.lg }}>
          {categoryChips}
        </ScrollView>

        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState
              illustration="no-expenses"
              icon="receipt-text-outline"
              title={tr('purchases:expense.noExpenses')}
              message={expenses.length === 0 ? 'Record your first expense to track where the money goes.' : 'Nothing matches this filter.'}
              actionLabel={expenses.length === 0 ? 'Add expense' : undefined}
              onAction={expenses.length === 0 ? () => router.push('/(app)/expenses/new') : undefined}
              compact
            />
          ) : (
            filtered.map((e, i) => {
              const cat = categories.find((c) => c.id === e.categoryId);
              return (
                <Pressable
                  key={e.id}
                  onPress={() => router.push(`/(app)/expenses/${e.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${cat?.name ?? 'Expense'}, ${formatMoney(e.amount)}`}
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
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: t.radius.sm,
                      backgroundColor: `${cat?.color ?? t.c.muted}22`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MaterialCommunityIcons
                      name={(cat?.icon ?? 'cash') as keyof typeof MaterialCommunityIcons.glyphMap}
                      size={19}
                      color={cat?.color ?? t.c.muted}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {cat?.name ?? 'Uncategorised'}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {formatDate(e.date, 'dd MMM')} · {paymentMethodLabel(tr, e.method)}
                      {e.notes ? ` · ${e.notes}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="body" weight="700">
                      {formatMoney(e.amount)}
                    </Text>
                    {e.recurrence !== 'none' ? <Badge label={e.recurrence} tone="info" size="sm" /> : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
      </ScrollView>

      <Fab icon="plus" onPress={() => router.push('/(app)/expenses/new')} />
    </View>
  );
}
