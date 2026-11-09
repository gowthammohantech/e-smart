import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { AppHeader } from '../../../components/AppHeader';
import { SectionHeader } from '@esmart/ui/components/Screen';
import { Card } from '@esmart/ui/components/Card';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { StatGrid } from '@esmart/ui/components/Layout';
import { HubTiles } from '@esmart/ui/components/HubTiles';
import { DocumentRow } from '@esmart/ui/components/DocumentRow';
import { StatusBadge } from '@esmart/ui/components/Badge';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { BarChart, RankedBars } from '@esmart/ui/components/charts/BarChart';
import { useBaseCurrency, useDashboardScope } from '../../../store/selectors';
import { useSalesHub } from '../../../remote/queries';
import { HubState } from '../../../features/dashboard/HubState';
import { PeriodBar } from '../../../features/dashboard/PeriodBar';
import { bucketLabel, delta, periodTitle } from '../../../features/dashboard/labels';
import { major, useCardExport } from '../../../features/dashboard/exportCard';
import { zero, type Money } from '@esmart/core/lib/money';
import type { DocStatus, DocumentKind } from '@esmart/core/types';
import { seriesColor } from '@esmart/ui/theme/chartColors';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { formatMoney } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import { useSectionTiles } from '../../../navigation/useSectionTiles';

export default function SalesTab() {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['sales', 'common', 'domain', 'reports', 'nav']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  // Worked out by the server for the branch and period chosen: the whole book needn't be on the device.
  const scope = useDashboardScope();
  const query = useSalesHub(scope);
  const hub = query.data;
  const exportCsv = useCardExport();
  const prev = hub?.previous;
  const trend = (hub?.salesTrend ?? []).map((r) => ({ label: bucketLabel(r.key!, hub!.period.grain), value: r.value as Money }));
  const none = zero(baseCurrency);
  const count = (kind: DocumentKind) => hub?.counts[kind] ?? 0;
  const monthTotal = (hub?.invoicedThisMonth as Money | undefined) ?? none;
  const monthCollected = (hub?.collectedThisMonth as Money | undefined) ?? none;
  const topCustomers = (hub?.topCustomers ?? []).map((c) => ({ label: c.name, value: c.total as Money }));
  const recent = hub?.recentInvoices ?? [];

  const tiles = useSectionTiles('sales', {
    invoices: count('invoice'),
    quotes: count('quote'),
    salesOrders: count('salesOrder'),
    deliveries: count('delivery'),
    salesReturns: count('salesReturn'),
    creditNotes: count('creditNote'),
    debitNotes: count('debitNote'),
  });

  // The sales trend and the top customers: side by side on a desktop, apart on a phone.
  const trendCard = (
    <>
      <SectionHeader
        title={tr('reports:dash.sales.trend')}
        action={tr('reports:dash.export.csv')}
        onAction={() => exportCsv(tr('reports:dash.sales.trend'), hub?.period, { headers: [tr('reports:dash.period.label'), tr('reports:dash.sales.invoiced')], rows: (hub?.salesTrend ?? []).map((r) => [r.key!, major(r.value)]) })}
      />
      <Card>
        <BarChart data={trend} caption={tr('reports:dash.sales.trendCaption')} />
      </Card>
    </>
  );
  const topCard = (
    <>
      <SectionHeader
        title={tr('sales:hub.topCustomers')}
        // Export when there is something to export; nothing in its place otherwise.
        action={topCustomers.length ? tr('reports:dash.export.csv') : undefined}
        onAction={() =>
          exportCsv(tr('sales:hub.topCustomers'), hub?.period, { headers: [tr('sales:hub.contacts'), tr('reports:dash.sales.invoiced')], rows: topCustomers.map((c) => [c.label, major(c.value)]) })
        }
      />
      <Card>
        <RankedBars rows={topCustomers} colorFor={(i) => seriesColor(t.scheme, i)} emptyLabel={tr('sales:hub.noSales')} />
      </Card>
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title={tr('sales:hub.title')} subtitle={tr('sales:hub.subtitle')} />

      <ScrollView
        // Only a phone has the round button to scroll clear of.
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: desktop ? t.spacing.xxl : 120 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        <PeriodBar />
        <HubState query={query}>
          {() => (
        <>
        <SectionHeader title={periodTitle(tr, hub?.period)} />
        <StatGrid>
          <StatRow>
            <StatTile
              label={tr('reports:dash.sales.invoiced')}
              value={monthTotal}
              icon="file-document-outline"
              caption={tr('reports:home.invoicesCount', { count: hub?.invoicesThisMonth ?? 0 })}
              delta={delta(hub?.invoicedThisMonth, prev?.invoiced)}
              onPress={() => router.push('/(app)/sales/invoices')}
            />
            <StatTile
              label={tr('sales:hub.collected')}
              value={monthCollected}
              tone="good"
              icon="cash-check"
              delta={delta(hub?.collectedThisMonth, prev?.collected)}
              onPress={() => router.push('/(app)/payments/received')}
            />
          </StatRow>
          <StatRow>
            <StatTile
              label={tr('sales:hub.outstanding')}
              value={(hub?.outstanding.amount as Money | undefined) ?? none}
              tone="warn"
              icon="clock-alert-outline"
              caption={tr('sales:hub.openInvoices', { count: hub?.outstanding.count ?? 0 })}
              onPress={() => router.push('/(app)/receivables')}
            />
            <StatTile
              label={tr('sales:hub.overdue')}
              value={(hub?.overdue.amount as Money | undefined) ?? none}
              tone="bad"
              icon="alert-circle-outline"
              caption={tr('sales:hub.invoiceCount', { count: hub?.overdue.count ?? 0 })}
              onPress={() => router.push('/(app)/receivables')}
            />
          </StatRow>
        </StatGrid>

        {desktop ? (
          <View style={{ flexDirection: 'row', gap: t.spacing.xl }}>
            <View style={{ flex: 3, minWidth: 0 }}>{trendCard}</View>
            <View style={{ flex: 2, minWidth: 0 }}>{topCard}</View>
          </View>
        ) : (
          trendCard
        )}

        <SectionHeader title={tr('sales:hub.documents')} />
        <HubTiles tiles={tiles} />

        {desktop ? null : topCard}

        <SectionHeader title={tr('sales:hub.recentInvoices')} action={tr('nav:shell.viewAll')} onAction={() => router.push('/(app)/sales/invoices')} />
        {desktop && recent.length ? (
          <DataTable
            scroll={false}
            columns={[
              { key: 'number', header: tr('common:table.number'), width: 160, render: (d) => <Cell weight="600">{d.number ?? ''}</Cell> },
              { key: 'party', header: tr('common:table.customer'), flex: 2, render: (d) => <Cell>{d.partyName ?? tr('common:placeholder.unknown')}</Cell> },
              { key: 'date', header: tr('common:table.date'), width: 130, render: (d) => <Cell tone="muted">{formatDate(d.date!)}</Cell> },
              { key: 'status', header: tr('common:table.status'), width: 150, render: (d) => <StatusBadge status={d.status as DocStatus} size="sm" /> },
              { key: 'total', header: tr('common:table.amount'), width: 150, align: 'right', render: (d) => <Cell weight="600" mono>{formatMoney(d.grandTotal as Money)}</Cell> },
            ]}
            rows={recent}
            rowKey={(d) => d.id!}
            onRowPress={(d) => router.push(`/(app)/sales/invoices/${d.id}`)}
          />
        ) : (
        <Card padded={false}>
          {recent.length === 0 ? (
            <EmptyState
              illustration="no-documents"
              icon="file-document-outline"
              title={tr('sales:hub.noInvoices')}
              actionLabel={tr('sales:hub.newInvoice')}
              onAction={() => router.push('/(app)/sales/invoices/new')}
              compact
            />
          ) : (
            recent.map((d, i) => (
              <DocumentRow
                key={d.id}
                document={{ number: d.number ?? '', date: d.date!, status: d.status as DocStatus, totals: { grandTotal: d.grandTotal as Money } }}
                partyName={d.partyName ?? tr('common:placeholder.unknown')}
                divider={i < recent.length - 1}
                onPress={() => router.push(`/(app)/sales/invoices/${d.id}`)}
              />
            ))
          )}
        </Card>
        )}
        </>
          )}
        </HubState>
      </ScrollView>

      <Fab icon="plus" label={tr('sales:hub.invoice')} onPress={() => router.push('/(app)/sales/invoices/new')} />
    </View>
  );
}
