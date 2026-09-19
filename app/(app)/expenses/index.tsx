import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { StatRow, StatTile } from '@/components/StatTile';
import { DonutChart } from '@/components/charts/DonutChart';
import { useBaseCurrency, useExpenseCategories, useExpenses } from '@/store/selectors';
import { DATE_RANGE_PRESET_KEYS, DateRangePreset, formatDate, inRange, resolveRange } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { money, sum, zero } from '@/lib/money';
import { dateRangeLabel, paymentMethodLabel } from '@/i18n/labels';

export default function ExpensesList() {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  const expenses = useExpenses();
  const categories = useExpenseCategories();

  const [query, setQuery] = useState('');
  const [range, setRange] = useState<DateRangePreset>('last30');
  const [categoryId, setCategoryId] = useState<string | null>(null);

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

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: 'Expenses' }} />

      <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, gap: t.spacing.md }}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search expenses" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm, paddingRight: t.spacing.lg }}>
          {DATE_RANGE_PRESET_KEYS.map((p) => {
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
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <StatRow>
          <StatTile label="Total spent" value={total} tone="warn" icon="receipt-text-outline" caption={`${filtered.length} entries`} />
          <StatTile label="Input tax" value={taxTotal} icon="percent-outline" caption="Claimable" />
        </StatRow>

        {slices.length > 0 ? (
          <Card style={{ marginTop: t.spacing.md }}>
            <DonutChart slices={slices} centerLabel="Total" />
          </Card>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm, paddingVertical: t.spacing.lg }}>
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
            <Text variant="caption" weight="600" style={{ color: !categoryId ? t.c.onPrimary : t.c.muted }}>
              All categories
            </Text>
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
        </ScrollView>

        <Card padded={false}>
          {filtered.length === 0 ? (
            <EmptyState
              illustration="no-expenses"
              icon="receipt-text-outline"
              title="No expenses"
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
