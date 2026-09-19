import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { AppHeader } from '@/components/AppHeader';
import { SectionHeader } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { StatRow, StatTile } from '@/components/StatTile';
import { BarChart } from '@/components/charts/BarChart';
import {
  useBaseCurrency,
  useCanOpen,
  useModuleSet,
  useDocuments,
  useExpenses,
  useItems,
  usePayables,
  useReceivables,
  useStockMovements,
} from '@/store/selectors';
import { profitSnapshot, summarizeStock } from '@/domain/reports';
import { resolveRange, lastNMonths, monthLabel } from '@/lib/date';
import { money } from '@/lib/money';
import { formatMoney, formatPercent } from '@/lib/format';

type ReportLink = {
  key: string;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const REPORTS: ReportLink[] = [
  { key: 'sales-summary', label: 'Sales summary', description: 'By month, customer, item and branch', icon: 'trending-up' },
  { key: 'purchase-summary', label: 'Purchase summary', description: 'What you bought and from whom', icon: 'cart-outline' },
  { key: 'expense-summary', label: 'Expense summary', description: 'Spend by category over time', icon: 'receipt-text-outline' },
  { key: 'receivables', label: 'Receivables', description: 'Who owes you, and for how long', icon: 'clock-alert-outline' },
  { key: 'payables', label: 'Payables', description: 'Supplier dues and aging', icon: 'file-clock-outline' },
  { key: 'stock', label: 'Stock report', description: 'On-hand quantity and valuation', icon: 'warehouse' },
  { key: 'tax-summary', label: 'Tax summary', description: 'Output vs input tax, ready to file', icon: 'percent-outline' },
  { key: 'payments', label: 'Payments & cash', description: 'Money in and out by method', icon: 'cash-sync' },
  { key: 'profit', label: 'Profit snapshot', description: 'Revenue less cost and expenses', icon: 'chart-line' },
];

export default function ReportsTab() {
  const t = useTheme();
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  const documents = useDocuments();
  const expenses = useExpenses();
  const items = useItems();
  const movements = useStockMovements();
  const receivables = useReceivables();
  const payables = usePayables();

  const canOpen = useCanOpen();
  const full = useModuleSet() === 'full';
  const reports = REPORTS.filter((r) => canOpen(`/reports/${r.key}`));
  const range = resolveRange('thisFY');

  const profit = useMemo(
    () => profitSnapshot(documents, expenses, items, baseCurrency, { range }),
    [documents, expenses, items, baseCurrency, range],
  );

  const stock = useMemo(() => summarizeStock(items, movements, baseCurrency), [items, movements, baseCurrency]);

  const trend = useMemo(() => {
    const keys = lastNMonths(6);
    return keys.map((key) => {
      const row = profit.byMonth.find((m) => m.key === key);
      return { label: monthLabel(key), value: row?.profit ?? money(0, baseCurrency) };
    });
  }, [profit.byMonth, baseCurrency]);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <AppHeader title="Reports" subtitle={`Financial year to date · ${baseCurrency}`} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profit and stock need the buying side of the books, so the Sales plan starts at the list. */}
        {full ? (
          <>
        <StatRow>
          <StatTile label="Revenue (FY)" value={profit.revenue} icon="trending-up" />
          <StatTile
            label="Net profit"
            value={profit.netProfit}
            tone={profit.netProfit.minor >= 0 ? 'good' : 'bad'}
            icon="chart-line"
            caption={`${formatPercent(profit.margin)} margin`}
          />
        </StatRow>

        <View style={{ height: t.spacing.md }} />

        <StatRow>
          <StatTile label="Receivable" value={receivables.summary.total} tone="warn" icon="clock-alert-outline" />
          <StatTile label="Payable" value={payables.summary.total} tone="bad" icon="file-clock-outline" />
        </StatRow>

        <SectionHeader title="Monthly profit" action="Open" onAction={() => router.push('/(app)/reports/profit')} />
        <Card>
          <BarChart data={trend} caption="Revenue less cost of goods and expenses" />
        </Card>

        <SectionHeader title="Snapshot" />
        <Card style={{ gap: t.spacing.md }}>
          {[
            { label: 'Gross profit', value: formatMoney(profit.grossProfit) },
            { label: 'Cost of goods sold', value: formatMoney(profit.costOfGoods) },
            { label: 'Operating expenses', value: formatMoney(profit.expenses) },
            { label: 'Stock on hand', value: formatMoney(stock.totalValue) },
          ].map((row) => (
            <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="small" tone="muted">
                {row.label}
              </Text>
              <Text variant="small" weight="600" style={{ fontVariant: ['tabular-nums'] }}>
                {row.value}
              </Text>
            </View>
          ))}
        </Card>
          </>
        ) : null}

        <SectionHeader title="All reports" />
        <Card padded={false}>
          {reports.map((r, i) => (
            <Pressable
              key={r.key}
              onPress={() => router.push(`/(app)/reports/${r.key}`)}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                padding: t.spacing.lg,
                borderBottomWidth: i < reports.length - 1 ? 0.5 : 0,
                borderBottomColor: t.c.line,
                backgroundColor: pressed ? t.c.card2 : 'transparent',
              })}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: t.radius.sm,
                  backgroundColor: t.c.chip,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons name={r.icon} size={19} color={t.c.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight="600">
                  {r.label}
                </Text>
                <Text variant="caption" tone="muted">
                  {r.description}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}
