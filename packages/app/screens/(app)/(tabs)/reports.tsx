import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { AppHeader } from '../../../components/AppHeader';
import { SectionHeader } from '@esmart/ui/components/Screen';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { StatGrid } from '@esmart/ui/components/Layout';
import { BarChart } from '@esmart/ui/components/charts/BarChart';
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
} from '../../../store/selectors';
import { profitSnapshot, summarizeStock } from '@esmart/core/domain/reports';
import { lastNMonths, monthLabelNarrow, resolveRange } from '@esmart/core/lib/date';
import { money } from '@esmart/core/lib/money';
import { formatMoney, formatPercent } from '@esmart/core/lib/format';
import { SHOW_SCROLLBAR, useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';

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
  const { t: tr } = useTranslation(['reports']);
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
  // Always 'phone' in the native apps, so the desktop layouts below only ever reach a browser.
  const bp = useBreakpoint();
  const desktop = bp !== 'phone';
  // The chart and the snapshot sit side by side once there is room for both.
  const wide = bp === 'desktop' || bp === 'wide';

  const profit = useMemo(
    () => profitSnapshot(documents, expenses, items, baseCurrency, { range }),
    [documents, expenses, items, baseCurrency, range],
  );

  const stock = useMemo(() => summarizeStock(items, movements, baseCurrency), [items, movements, baseCurrency]);

  const trend = useMemo(() => {
    const keys = lastNMonths(6);
    return keys.map((key) => {
      const row = profit.byMonth.find((m) => m.key === key);
      return { label: monthLabelNarrow(key), value: row?.profit ?? money(0, baseCurrency) };
    });
  }, [profit.byMonth, baseCurrency]);

  const snapshot = [
    { label: 'Gross profit', value: formatMoney(profit.grossProfit) },
    { label: 'Cost of goods sold', value: formatMoney(profit.costOfGoods) },
    { label: 'Operating expenses', value: formatMoney(profit.expenses) },
    { label: 'Stock on hand', value: formatMoney(stock.totalValue) },
  ];

  // Three to a row on a desktop, two on a tablet, the last row padded so every card keeps the same width.
  const perRow = wide ? 3 : 2;
  const grid: (ReportLink | null)[][] = [];
  for (let i = 0; i < reports.length; i += perRow) {
    const row: (ReportLink | null)[] = reports.slice(i, i + perRow);
    while (row.length < perRow) row.push(null);
    grid.push(row);
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <AppHeader title={tr('reports:hub.title')} subtitle={`Financial year to date · ${baseCurrency}`} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 40 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        {/* Profit and stock need the buying side of the books, so the Sales plan starts at the list. */}
        {full ? (
          <>
        <StatGrid>
          <StatRow>
            <StatTile label={tr('reports:hub.revenueFy')} value={profit.revenue} icon="trending-up" />
            <StatTile
              label={tr('reports:hub.netProfit')}
              value={profit.netProfit}
              tone={profit.netProfit.minor >= 0 ? 'good' : 'bad'}
              icon="chart-line"
              caption={`${formatPercent(profit.margin)} margin`}
            />
          </StatRow>
          <StatRow>
            <StatTile label={tr('reports:hub.receivable')} value={receivables.summary.total} tone="warn" icon="clock-alert-outline" />
            <StatTile label={tr('reports:hub.payable')} value={payables.summary.total} tone="bad" icon="file-clock-outline" />
          </StatRow>
        </StatGrid>

        {wide ? (
          // A desktop puts the snapshot beside the chart, both the same height.
          <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: t.spacing.xl }}>
            <View style={{ flex: 2, minWidth: 0 }}>
              <SectionHeader title={tr('reports:hub.monthlyProfit')} action="Open" onAction={() => router.push('/(app)/reports/profit')} />
              <Card style={{ flex: 1 }}>
                <BarChart data={trend} caption={tr('reports:hub.profitCaption')} />
              </Card>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <SectionHeader title={tr('reports:hub.snapshot')} />
              <Card style={{ flex: 1, justifyContent: 'space-around' }}>
                {snapshot.map((row, i) => (
                  <View
                    key={row.label}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: t.spacing.md,
                      borderTopWidth: i === 0 ? 0 : 0.5,
                      borderTopColor: t.c.line,
                    }}
                  >
                    <Text variant="small" tone="muted">
                      {row.label}
                    </Text>
                    <Text variant="body" weight="600" style={{ fontVariant: ['tabular-nums'] }}>
                      {row.value}
                    </Text>
                  </View>
                ))}
              </Card>
            </View>
          </View>
        ) : (
          <>
        <SectionHeader title={tr('reports:hub.monthlyProfit')} action="Open" onAction={() => router.push('/(app)/reports/profit')} />
        <Card>
          <BarChart data={trend} caption={tr('reports:hub.profitCaption')} />
        </Card>

        <SectionHeader title={tr('reports:hub.snapshot')} />
        <Card style={{ gap: t.spacing.md }}>
          {snapshot.map((row) => (
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
        )}
          </>
        ) : null}

        <SectionHeader title={tr('reports:hub.allReports')} />
        {desktop ? (
          <View style={{ gap: t.spacing.md }}>
            {grid.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row', gap: t.spacing.md }}>
                {row.map((r, i) =>
                  r ? (
                    <Pressable
                      key={r.key}
                      onPress={() => router.push(`/(app)/reports/${r.key}`)}
                      accessibilityRole="button"
                      accessibilityLabel={r.label}
                      style={(state) => {
                        const { hovered, pressed, focused } = state as WebPressState;
                        return {
                          flex: 1,
                          minWidth: 0,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: t.spacing.md,
                          padding: t.spacing.lg,
                          borderRadius: t.radius.lg,
                          borderWidth: 1,
                          borderColor: hovered ? t.c.primary : t.c.line,
                          backgroundColor: hovered || pressed ? t.c.card2 : t.c.card,
                          ...focusRing(t, focused),
                        };
                      }}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: t.radius.md,
                          backgroundColor: t.c.chip,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MaterialCommunityIcons name={r.icon} size={22} color={t.c.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text variant="body" weight="600" numberOfLines={1}>
                          {r.label}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={2}>
                          {r.description}
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
                    </Pressable>
                  ) : (
                    // Sized like a card (padding and border count towards flex) so the columns line up.
                    <View key={`pad-${i}`} style={{ flex: 1, padding: t.spacing.lg, borderWidth: 1, borderColor: 'transparent' }} />
                  ),
                )}
              </View>
            ))}
          </View>
        ) : (
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
        )}
      </ScrollView>
    </View>
  );
}
