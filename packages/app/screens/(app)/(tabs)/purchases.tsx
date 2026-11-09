import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { AppHeader } from '../../../components/AppHeader';
import { SectionHeader } from '@esmart/ui/components/Screen';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Icon } from '@esmart/ui/components/Icon';
import { Segmented } from '@esmart/ui/components/Field';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { Columns, StatGrid } from '@esmart/ui/components/Layout';
import { HubTiles } from '@esmart/ui/components/HubTiles';
import { DocumentRow } from '@esmart/ui/components/DocumentRow';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { DonutChart } from '@esmart/ui/components/charts/DonutChart';
import { BarChart, RankedBars } from '@esmart/ui/components/charts/BarChart';
import { seriesColor } from '@esmart/ui/theme/chartColors';
import { useBaseCurrency, useDashboardScope, useHasModule } from '../../../store/selectors';
import { usePurchasesHub } from '../../../remote/queries';
import { zero, type Money } from '@esmart/core/lib/money';
import { formatMoney } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import type { DocStatus, DocumentKind } from '@esmart/core/types';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { useSectionTiles } from '../../../navigation/useSectionTiles';
import { HubState } from '../../../features/dashboard/HubState';
import { PeriodBar } from '../../../features/dashboard/PeriodBar';
import { bucketLabel, delta, periodTitle } from '../../../features/dashboard/labels';
import { major, useCardExport } from '../../../features/dashboard/exportCard';

type Segment = 'purchases' | 'expenses';

export default function PurchasesTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['purchases', 'common', 'nav', 'reports']);
  const router = useRouter();
  const desktop = useIsDesktop();
  // A desktop keeps lists of rows to a readable width, not the value 1000px from its name.
  const listCap = desktop ? { maxWidth: 880 } : undefined;

  const baseCurrency = useBaseCurrency();
  const withExpenses = useHasModule('expenses');
  const [segment, setSegment] = useState<Segment>('purchases');
  const exportCsv = useCardExport();
  // Worked out by the server for the branch and period chosen: the whole book needn't be on the device.
  const scope = useDashboardScope();
  const query = usePurchasesHub(scope);
  const hub = query.data;
  const none = zero(baseCurrency);
  const prev = hub?.previous;
  const count = (kind: DocumentKind) => hub?.counts[kind] ?? 0;
  const monthPurchases = (hub?.billedThisMonth as Money | undefined) ?? none;
  const monthExpenses = (hub?.expensesThisMonth as Money | undefined) ?? none;
  const expenseSlices = (hub?.expensesByCategory ?? []).map((c) => ({ label: c.name, value: c.total as Money }));
  const recent = hub?.recentBills ?? [];
  const insights = hub?.expenseInsights;
  const title = periodTitle(tr, hub?.period);
  const showing: Segment = withExpenses ? segment : 'purchases';

  const tiles = useSectionTiles('purchases', {
    bills: count('purchaseBill'),
    purchaseOrders: count('purchaseOrder'),
    goodsReceipts: count('goodsReceipt'),
    purchaseReturns: count('purchaseReturn'),
    supplierCreditNotes: count('supplierCreditNote'),
    supplierDebitNotes: count('supplierDebitNote'),
  });

  const purchases = (
    <>
      <SectionHeader title={title} />
      <StatGrid>
        <StatRow>
          <StatTile
            label={tr('purchases:hub.thisMonth')}
            value={monthPurchases}
            icon="cart-outline"
            delta={delta(hub?.billedThisMonth, prev?.billed, true)}
            onPress={() => router.push('/(app)/purchases/bills')}
          />
          {withExpenses ? (
            <StatTile
              label={tr('purchases:hub.expenses')}
              value={monthExpenses}
              tone="warn"
              icon="receipt-text-outline"
              delta={delta(hub?.expensesThisMonth, prev?.expenses, true)}
              onPress={() => setSegment('expenses')}
            />
          ) : (
            // Holds the lone tile to half the row, the size of the tiles below it.
            <View style={{ flex: 1 }} />
          )}
        </StatRow>
        <StatRow>
          <StatTile
            label={tr('purchases:hub.payable')}
            value={(hub?.payable.amount as Money | undefined) ?? none}
            icon="file-clock-outline"
            caption={tr('purchases:hub.openBills', { count: hub?.payable.count ?? 0 })}
            onPress={() => router.push('/(app)/payables')}
          />
          <StatTile
            label={tr('purchases:hub.overdue')}
            value={(hub?.overdue.amount as Money | undefined) ?? none}
            tone="bad"
            icon="alert-circle-outline"
            onPress={() => router.push('/(app)/payables')}
          />
        </StatRow>
      </StatGrid>

      <SectionHeader title={tr('purchases:hub.documents')} />
      <HubTiles tiles={tiles} />

      <SectionHeader title={tr('purchases:hub.recentBills')} action={tr('nav:shell.viewAll')} onAction={() => router.push('/(app)/purchases/bills')} />
      <Card padded={false} style={listCap}>
        {recent.length === 0 ? (
          <EmptyState
            illustration="no-documents"
            icon="file-document-outline"
            title={tr('purchases:hub.noBills')}
            actionLabel={tr('purchases:hub.recordBill')}
            onAction={() => router.push('/(app)/purchases/bills/new')}
            compact
          />
        ) : (
          recent.map((d, i) => (
            <DocumentRow
              key={d.id}
              document={{ number: d.number ?? '', date: d.date!, status: d.status as DocStatus, totals: { grandTotal: d.grandTotal as Money } }}
              partyName={d.partyName ?? tr('common:placeholder.unknown')}
              divider={i < recent.length - 1}
              onPress={() => router.push(`/(app)/purchases/bills/${d.id}`)}
            />
          ))
        )}
      </Card>
    </>
  );

  const expenses = insights ? (
    <>
      <SectionHeader title={title} />
      <StatGrid>
        <StatRow>
          <StatTile
            label={tr('reports:dash.expenses.total')}
            value={monthExpenses}
            tone="warn"
            icon="receipt-text-outline"
            caption={tr('reports:home.entriesCount', { count: insights.count })}
            delta={delta(hub?.expensesThisMonth, prev?.expenses, true)}
            onPress={() => router.push('/(app)/expenses')}
          />
          <StatTile label={tr('reports:dash.expenses.itc')} value={insights.itcEligibleTax} tone="good" icon="percent-outline" caption={tr('reports:dash.expenses.tax')} />
        </StatRow>
        <StatRow>
          <StatTile label={tr('reports:dash.expenses.tax')} value={insights.tax} icon="scale-balance" />
          <StatTile label={tr('reports:dash.expenses.billable')} value={insights.billable} icon="account-check-outline" />
        </StatRow>
      </StatGrid>

      {/* Side by side on a desktop rather than four page-wide cards; one after the other on a phone. */}
      <Columns
        left={
          <View>
            <SectionHeader
              title={tr('reports:dash.expenses.trend')}
              action={tr('reports:dash.export.csv')}
              onAction={() => exportCsv(tr('reports:dash.expenses.trend'), hub?.period, { headers: [tr('reports:dash.period.label'), tr('reports:dash.expenses.total')], rows: insights.trend.map((r) => [r.key!, major(r.value)]) })}
            />
            <Card>
              <BarChart data={insights.trend.map((r) => ({ label: bucketLabel(r.key!, hub!.period.grain), value: r.value as Money }))} caption={tr('reports:dash.expenses.trendCaption')} color={seriesColor(t.scheme, 1)} />
            </Card>
          </View>
        }
        right={
          <View>
            <SectionHeader
              title={tr('reports:dash.expenses.byCategory')}
              // Export when there is something to export; nothing in its place otherwise.
              action={expenseSlices.length ? tr('reports:dash.export.csv') : undefined}
              onAction={() =>
                exportCsv(tr('reports:dash.expenses.byCategory'), hub?.period, { headers: [tr('reports:dash.expenses.byCategory'), tr('reports:dash.expenses.total')], rows: expenseSlices.map((c) => [c.label, major(c.value)]) })
              }
            />
            <Card>
              <DonutChart slices={expenseSlices} centerLabel={title} />
            </Card>
          </View>
        }
      />
      <Columns
        left={
          <View>
            <SectionHeader title={tr('reports:dash.expenses.topSuppliers')} />
            <Card>
              <RankedBars rows={insights.topSuppliers.map((s) => ({ label: s.name, value: s.total as Money }))} colorFor={(i) => seriesColor(t.scheme, i)} emptyLabel={tr('reports:dash.expenses.noSuppliers')} />
            </Card>
          </View>
        }
        right={
          <View>
            <SectionHeader title={tr('reports:dash.expenses.upcoming')} action={tr('nav:shell.viewAll')} onAction={() => router.push('/(app)/expenses')} />
            <Card padded={false}>
              {insights.upcomingRecurring.length === 0 ? (
                <Text variant="small" tone="muted" style={{ padding: t.spacing.lg }}>
                  {tr('reports:dash.expenses.noUpcoming')}
                </Text>
              ) : (
                insights.upcomingRecurring.map((r, i, arr) => (
                  <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md, borderBottomWidth: i < arr.length - 1 ? 0.5 : 0, borderBottomColor: t.c.line }}>
                    <Icon name="repeat" size={18} color={t.c.muted} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="small" weight="500" numberOfLines={1}>
                        {r.description || r.category}
                      </Text>
                      <Text variant="micro" tone="muted" numberOfLines={1}>
                        {[formatDate(r.nextDate, 'd MMM'), tr(`reports:dash.expenses.recurrence.${r.recurrence}`)].join(' · ')}
                      </Text>
                    </View>
                    <Text variant="small" weight="600">
                      {formatMoney(r.amount as Money)}
                    </Text>
                  </View>
                ))
              )}
            </Card>
          </View>
        }
      />
    </>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title={tr('purchases:hub.title')} subtitle={tr('purchases:hub.subtitle')} />

      <ScrollView
        // No FAB or tab bar to clear on a desktop.
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: desktop ? t.spacing.xxl : 120 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        {withExpenses ? (
          <Segmented
            options={[
              { value: 'purchases', label: tr('reports:dash.expenses.segPurchases') },
              { value: 'expenses', label: tr('reports:dash.expenses.segExpenses') },
            ]}
            value={showing}
            onChange={setSegment}
            style={{ marginTop: t.spacing.md }}
          />
        ) : null}
        <PeriodBar />
        <HubState query={query}>{() => (showing === 'expenses' ? expenses : purchases)}</HubState>
      </ScrollView>

      <Fab
        icon="plus"
        label={showing === 'expenses' ? tr('nav:title.expense') : tr('purchases:hub.bill')}
        onPress={() => router.push(showing === 'expenses' ? '/(app)/expenses/new' : '/(app)/purchases/bills/new')}
      />
    </View>
  );
}
