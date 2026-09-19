import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { AppHeader } from '@/components/AppHeader';
import { SectionHeader } from '@/components/Screen';
import { Card } from '@/components/Card';
import { StatRow, StatTile } from '@/components/StatTile';
import { HubTiles } from '@/components/HubTiles';
import { DocumentRow } from '@/components/DocumentRow';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { RankedBars } from '@/components/charts/BarChart';
import {
  useBaseCurrency,
  useDocuments,
  useParties,
  usePayments,
  useComplianceSummary,
  useReceivables,
} from '@/store/selectors';
import { money, sum } from '@/lib/money';
import { inRange, resolveRange } from '@/lib/date';
import { seriesColor } from '@/theme/chartColors';

export default function SalesTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  const invoices = useDocuments('invoice');
  const quotes = useDocuments('quote');
  const orders = useDocuments('salesOrder');
  const deliveries = useDocuments('delivery');
  const returns = useDocuments('salesReturn');
  const payments = usePayments('received');
  const receivables = useReceivables();
  const customers = useParties('customer');
  const compliance = useComplianceSummary();

  const month = resolveRange('thisMonth');

  const monthTotal = useMemo(
    () =>
      sum(
        invoices
          .filter((d) => inRange(d.date, month) && !['draft', 'cancelled'].includes(d.status))
          .map((d) => money(Math.round(d.totals.grandTotal.minor * (d.exchangeRate || 1)), baseCurrency)),
        baseCurrency,
      ),
    [invoices, month, baseCurrency],
  );

  const monthCollected = useMemo(
    () =>
      sum(
        payments
          .filter((p) => inRange(p.date, month))
          .map((p) => money(Math.round(p.amount.minor * (p.exchangeRate || 1)), baseCurrency)),
        baseCurrency,
      ),
    [payments, month, baseCurrency],
  );

  const topCustomers = useMemo(() => {
    const map = new Map<string, number>();
    invoices
      .filter((d) => !['draft', 'cancelled'].includes(d.status))
      .forEach((d) => {
        map.set(d.partyId, (map.get(d.partyId) ?? 0) + Math.round(d.totals.grandTotal.minor * (d.exchangeRate || 1)));
      });
    return Array.from(map.entries())
      .map(([id, minor]) => ({
        label: customers.find((c) => c.id === id)?.name ?? 'Unknown',
        value: money(minor, baseCurrency),
      }))
      .sort((a, b) => b.value.minor - a.value.minor)
      .slice(0, 5);
  }, [invoices, customers, baseCurrency]);

  const recent = invoices.filter((d) => d.status !== 'cancelled').slice(0, 6);
  const nameOf = (id: string) => customers.find((c) => c.id === id)?.name ?? 'Unknown';

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <AppHeader title={tr('sales:hub.title')} subtitle={tr('sales:hub.subtitle')} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <StatRow>
          <StatTile
            label={tr('sales:hub.invoicedThisMonth')}
            value={monthTotal}
            icon="file-document-outline"
            onPress={() => router.push('/(app)/sales/invoices')}
          />
          <StatTile
            label={tr('sales:hub.collected')}
            value={monthCollected}
            tone="good"
            icon="cash-check"
            onPress={() => router.push('/(app)/payments/received')}
          />
        </StatRow>

        <View style={{ height: t.spacing.md }} />

        <StatRow>
          <StatTile
            label={tr('sales:hub.outstanding')}
            value={receivables.summary.total}
            tone="warn"
            icon="clock-alert-outline"
            caption={`${receivables.outstanding.length} open invoices`}
            onPress={() => router.push('/(app)/receivables')}
          />
          <StatTile
            label={tr('sales:hub.overdue')}
            value={receivables.summary.overdue}
            tone="bad"
            icon="alert-circle-outline"
            caption={`${receivables.outstanding.filter((o) => o.daysOverdue > 0).length} invoices`}
            onPress={() => router.push('/(app)/receivables')}
          />
        </StatRow>

        <SectionHeader title={tr('sales:hub.documents')} />
        <HubTiles
          tiles={[
            { key: 'invoices', label: 'Invoices', icon: 'file-document-outline', route: '/(app)/sales/invoices', count: invoices.length },
            { key: 'quotes', label: 'Quotations', icon: 'file-percent-outline', route: '/(app)/sales/quotes', count: quotes.length },
            { key: 'orders', label: 'Sales orders', icon: 'clipboard-list-outline', route: '/(app)/sales/orders', count: orders.length },
            { key: 'deliveries', label: 'Delivery notes', icon: 'truck-outline', route: '/(app)/sales/deliveries', count: deliveries.length },
            { key: 'returns', label: 'Sales returns', icon: 'keyboard-return', route: '/(app)/sales/returns', count: returns.length },
            { key: 'payments', label: 'Payments in', icon: 'cash-plus', route: '/(app)/payments/received', count: payments.length },
            { key: 'compliance', label: 'E-invoices', icon: 'shield-check-outline', route: '/(app)/compliance', count: compliance.eInvoice.generated },
          ]}
        />

        <SectionHeader title={tr('sales:hub.topCustomers')} action="Contacts" onAction={() => router.push('/(app)/(tabs)/contacts')} />
        <Card>
          <RankedBars rows={topCustomers} colorFor={(i) => seriesColor(t.scheme, i)} emptyLabel="No sales recorded yet" />
        </Card>

        <SectionHeader title={tr('sales:hub.recentInvoices')} action="See all" onAction={() => router.push('/(app)/sales/invoices')} />
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
                document={d}
                partyName={nameOf(d.partyId)}
                divider={i < recent.length - 1}
                onPress={() => router.push(`/(app)/sales/invoices/${d.id}`)}
              />
            ))
          )}
        </Card>
      </ScrollView>

      <Fab icon="plus" label={tr('sales:hub.invoice')} onPress={() => router.push('/(app)/sales/invoices/new')} />
    </View>
  );
}
