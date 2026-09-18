import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { AppHeader } from '@/components/AppHeader';
import { SectionHeader } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
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
  useReceivables,
} from '@/store/selectors';
import { money, sum } from '@/lib/money';
import { inRange, resolveRange } from '@/lib/date';
import { seriesColor } from '@/theme/chartColors';

export default function SalesTab() {
  const t = useTheme();
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
      <AppHeader title="Sales" subtitle="Quotes, orders, invoices and returns" />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <StatRow>
          <StatTile
            label="Invoiced this month"
            value={monthTotal}
            icon="file-document-outline"
            onPress={() => router.push('/(app)/sales/invoices')}
          />
          <StatTile
            label="Collected"
            value={monthCollected}
            tone="good"
            icon="cash-check"
            onPress={() => router.push('/(app)/payments/received')}
          />
        </StatRow>

        <View style={{ height: t.spacing.md }} />

        <StatRow>
          <StatTile
            label="Outstanding"
            value={receivables.summary.total}
            tone="warn"
            icon="clock-alert-outline"
            caption={`${receivables.outstanding.length} open invoices`}
            onPress={() => router.push('/(app)/receivables')}
          />
          <StatTile
            label="Overdue"
            value={receivables.summary.overdue}
            tone="bad"
            icon="alert-circle-outline"
            caption={`${receivables.outstanding.filter((o) => o.daysOverdue > 0).length} invoices`}
            onPress={() => router.push('/(app)/receivables')}
          />
        </StatRow>

        <SectionHeader title="Sales documents" />
        <HubTiles
          tiles={[
            { key: 'invoices', label: 'Invoices', icon: 'file-document-outline', route: '/(app)/sales/invoices', count: invoices.length },
            { key: 'quotes', label: 'Quotations', icon: 'file-percent-outline', route: '/(app)/sales/quotes', count: quotes.length },
            { key: 'orders', label: 'Sales orders', icon: 'clipboard-list-outline', route: '/(app)/sales/orders', count: orders.length },
            { key: 'deliveries', label: 'Delivery notes', icon: 'truck-outline', route: '/(app)/sales/deliveries', count: deliveries.length },
            { key: 'returns', label: 'Sales returns', icon: 'keyboard-return', route: '/(app)/sales/returns', count: returns.length },
            { key: 'payments', label: 'Payments in', icon: 'cash-plus', route: '/(app)/payments/received', count: payments.length },
          ]}
        />

        <SectionHeader title="Top customers" action="Contacts" onAction={() => router.push('/(app)/(tabs)/contacts')} />
        <Card>
          <RankedBars rows={topCustomers} colorFor={(i) => seriesColor(t.scheme, i)} emptyLabel="No sales recorded yet" />
        </Card>

        <SectionHeader title="Recent invoices" action="See all" onAction={() => router.push('/(app)/sales/invoices')} />
        <Card padded={false}>
          {recent.length === 0 ? (
            <EmptyState
              icon="file-document-outline"
              title="No invoices yet"
              actionLabel="New invoice"
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

      <Fab icon="plus" label="Invoice" onPress={() => router.push('/(app)/sales/invoices/new')} />
    </View>
  );
}
