import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { AppHeader } from '../../../components/AppHeader';
import { SectionHeader } from '@esmart/ui/components/Screen';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { StatGrid } from '@esmart/ui/components/Layout';
import { BarChart } from '@esmart/ui/components/charts/BarChart';
import { useActiveCompany, useBaseCurrency, useCanOpen, useModuleSet } from '../../../store/selectors';
import { profitSnapshot, type ProfitSnapshot, type StockReport } from '@esmart/core/domain/reports';
import { useReportData } from '../../../remote/queries';
import { lastNMonths, monthLabelNarrow, resolveRange } from '@esmart/core/lib/date';
import { money, type Money } from '@esmart/core/lib/money';
import { formatMoney, formatPercent } from '@esmart/core/lib/format';
import { SHOW_SCROLLBAR, useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';

type ReportLink = {
  key: string;
  label: string;
  description: string;
  icon: IconName;
};

/** Each report's route key, its catalogue entry under `reports:report`, and its icon. */
const REPORTS: {
  key: string;
  id: 'salesSummary' | 'purchaseSummary' | 'expenseSummary' | 'receivables' | 'payables' | 'stock' | 'taxSummary' | 'payments' | 'advances' | 'profit' | 'tdsRegister' | 'tdsPayable' | 'tdsReceivable' | 'tds26q' | 'tdsChallans' | 'tcsRegister' | 'tcsPayable' | 'msmePayables';
  icon: ReportLink['icon'];
  /** Listed under "TDS & TCS" rather than with the rest. */
  tax?: boolean;
}[] = [
  { key: 'sales-summary', id: 'salesSummary', icon: 'trending-up' },
  { key: 'purchase-summary', id: 'purchaseSummary', icon: 'cart-outline' },
  { key: 'expense-summary', id: 'expenseSummary', icon: 'receipt-text-outline' },
  { key: 'receivables', id: 'receivables', icon: 'clock-alert-outline' },
  { key: 'payables', id: 'payables', icon: 'file-clock-outline' },
  { key: 'stock', id: 'stock', icon: 'warehouse' },
  { key: 'tax-summary', id: 'taxSummary', icon: 'percent-outline' },
  { key: 'payments', id: 'payments', icon: 'cash-sync' },
  { key: 'advances', id: 'advances', icon: 'cash-clock' },
  { key: 'profit', id: 'profit', icon: 'chart-line' },
  { key: 'msme-payables', id: 'msmePayables', icon: 'timer-sand' },
  { key: 'tds-register', id: 'tdsRegister', icon: 'bank-minus', tax: true },
  { key: 'tds-payable', id: 'tdsPayable', icon: 'bank-outline', tax: true },
  { key: 'tds-receivable', id: 'tdsReceivable', icon: 'bank-plus', tax: true },
  { key: 'tds-26q', id: 'tds26q', icon: 'file-table-outline', tax: true },
  { key: 'tds-challans', id: 'tdsChallans', icon: 'bank-transfer-out', tax: true },
  { key: 'tcs-register', id: 'tcsRegister', icon: 'cash-plus', tax: true },
  { key: 'tcs-payable', id: 'tcsPayable', icon: 'cash-lock', tax: true },
];

export default function ReportsTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['reports']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();

  const canOpen = useCanOpen();
  const full = useModuleSet() === 'full';
  const linkOf = (r: (typeof REPORTS)[number]): ReportLink => ({
    key: r.key,
    icon: r.icon,
    label: tr(`reports:report.${r.id}.title`),
    description: tr(`reports:report.${r.id}.description`),
  });
  const open = REPORTS.filter((r) => canOpen(`/reports/${r.key}`));
  // TDS and TCS together, under their own heading, so they're found in one place.
  const groups = [
    { title: tr('reports:hub.allReports'), reports: open.filter((r) => !r.tax).map(linkOf) },
    { title: tr('reports:hub.tdsTcs'), reports: open.filter((r) => r.tax).map(linkOf) },
  ].filter((g) => g.reports.length);
  const range = resolveRange('thisFY', undefined, useActiveCompany()?.fiscalYearStartMonth);
  // Always 'phone' in the native apps, so the desktop layouts below only ever reach a browser.
  const bp = useBreakpoint();
  const desktop = bp !== 'phone';
  // The chart and the snapshot sit side by side once there is room for both.
  const wide = bp === 'desktop' || bp === 'wide';

  // The figures come from the server's reports, each asked for only when the plan includes it.
  const emptyProfit = useMemo(() => profitSnapshot([], [], [], baseCurrency, { range }), [baseCurrency, range]);
  const profit = useReportData<ProfitSnapshot>(canOpen('/reports/profit') ? 'profit' : null, range).data ?? emptyProfit;
  const stock = useReportData<StockReport>(canOpen('/reports/stock') ? 'stock' : null, range).data ?? { totalValue: money(0, baseCurrency) };
  const none = money(0, baseCurrency);
  type Aging = { summary: { total: Money } };
  const receivables = useReportData<Aging>(canOpen('/reports/receivables') ? 'receivables' : null, range).data ?? { summary: { total: none } };
  const payables = useReportData<Aging>(canOpen('/reports/payables') ? 'payables' : null, range).data ?? { summary: { total: none } };

  const trend = useMemo(() => {
    const keys = lastNMonths(6);
    return keys.map((key) => {
      const row = profit.byMonth.find((m) => m.key === key);
      return { label: monthLabelNarrow(key), value: row?.profit ?? money(0, baseCurrency) };
    });
  }, [profit.byMonth, baseCurrency]);

  const snapshot = [
    { label: tr('reports:figure.grossProfit'), value: formatMoney(profit.grossProfit) },
    { label: tr('reports:figure.costOfGoodsSold'), value: formatMoney(profit.costOfGoods) },
    { label: tr('reports:figure.operatingExpenses'), value: formatMoney(profit.expenses) },
    { label: tr('reports:figure.stockOnHand'), value: formatMoney(stock.totalValue) },
  ];

  // Three to a row on a desktop, two on a tablet, the last row padded so every card keeps the same width.
  const perRow = wide ? 3 : 2;
  const gridOf = (reports: ReportLink[]) => {
    const grid: (ReportLink | null)[][] = [];
    for (let i = 0; i < reports.length; i += perRow) {
      const row: (ReportLink | null)[] = reports.slice(i, i + perRow);
      while (row.length < perRow) row.push(null);
      grid.push(row);
    }
    return grid;
  };

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title={tr('reports:hub.title')} subtitle={tr('reports:hub.subtitle', { currency: baseCurrency })} />

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
              caption={tr('reports:hub.margin', { percent: formatPercent(profit.margin) })}
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
              <SectionHeader title={tr('reports:hub.monthlyProfit')} action={tr('reports:hub.open')} onAction={() => router.push('/(app)/reports/profit')} />
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
        <SectionHeader title={tr('reports:hub.monthlyProfit')} action={tr('reports:hub.open')} onAction={() => router.push('/(app)/reports/profit')} />
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

        {groups.map(({ title, reports }) => (
          <React.Fragment key={title}>
        <SectionHeader title={title} />
        {desktop ? (
          <View style={{ gap: t.spacing.md }}>
            {gridOf(reports).map((row, ri) => (
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
                        <Icon name={r.icon} size={22} color={t.c.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text variant="body" weight="600" numberOfLines={1}>
                          {r.label}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={2}>
                          {r.description}
                        </Text>
                      </View>
                      <Icon name="chevron-right" size={18} color={t.c.muted} />
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
                <Icon name={r.icon} size={19} color={t.c.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight="600">
                  {r.label}
                </Text>
                <Text variant="caption" tone="muted">
                  {r.description}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={t.c.muted} />
            </Pressable>
          ))}
        </Card>
        )}
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
}
