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
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Fab } from '@esmart/ui/components/Fab';
import { RankedBars } from '@esmart/ui/components/charts/BarChart';
import { useBaseCurrency } from '../../../store/selectors';
import { useSalesHub } from '../../../remote/queries';
import { zero, type Money } from '@esmart/core/lib/money';
import type { DocStatus, DocumentKind } from '@esmart/core/types';
import { documentKindLabel } from '@esmart/core/labels';
import { seriesColor } from '@esmart/ui/theme/chartColors';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

export default function SalesTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales', 'common', 'domain', 'reports']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  // Worked out by the server: the whole book needn't be on the device to show it.
  const hub = useSalesHub().data;
  const none = zero(baseCurrency);
  const count = (kind: DocumentKind) => hub?.counts[kind] ?? 0;
  const monthTotal = (hub?.invoicedThisMonth as Money | undefined) ?? none;
  const monthCollected = (hub?.collectedThisMonth as Money | undefined) ?? none;
  const topCustomers = (hub?.topCustomers ?? []).map((c) => ({ label: c.name, value: c.total as Money }));
  const recent = hub?.recentInvoices ?? [];

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title={tr('sales:hub.title')} subtitle={tr('sales:hub.subtitle')} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        <StatGrid>
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

        <SectionHeader title={tr('sales:hub.documents')} />
        <HubTiles
          tiles={[
            { key: 'invoices', label: documentKindLabel(tr, 'invoice', 2), icon: 'file-document-outline', route: '/(app)/sales/invoices', count: count('invoice') },
            { key: 'quotes', label: documentKindLabel(tr, 'quote', 2), icon: 'file-percent-outline', route: '/(app)/sales/quotes', count: count('quote') },
            { key: 'orders', label: documentKindLabel(tr, 'salesOrder', 2), icon: 'clipboard-list-outline', route: '/(app)/sales/orders', count: count('salesOrder') },
            { key: 'deliveries', label: documentKindLabel(tr, 'delivery', 2), icon: 'truck-outline', route: '/(app)/sales/deliveries', count: count('delivery') },
            { key: 'returns', label: documentKindLabel(tr, 'salesReturn', 2), icon: 'keyboard-return', route: '/(app)/sales/returns', count: count('salesReturn') },
            { key: 'creditNotes', label: documentKindLabel(tr, 'creditNote', 2), icon: 'file-document-minus-outline', route: '/(app)/sales/credit-notes', count: count('creditNote') },
            { key: 'debitNotes', label: documentKindLabel(tr, 'debitNote', 2), icon: 'file-document-plus-outline', route: '/(app)/sales/debit-notes', count: count('debitNote') },
            { key: 'payments', label: tr('sales:hub.paymentsIn'), icon: 'cash-plus', route: '/(app)/payments/received', count: hub?.paymentsReceived ?? 0 },
            { key: 'compliance', label: tr('reports:home.eInvoices'), icon: 'shield-check-outline', route: '/(app)/compliance', count: hub?.eInvoicesGenerated ?? 0 },
          ]}
        />

        <SectionHeader title={tr('sales:hub.topCustomers')} action={tr('sales:hub.contacts')} onAction={() => router.push('/(app)/(tabs)/contacts')} />
        <Card>
          <RankedBars rows={topCustomers} colorFor={(i) => seriesColor(t.scheme, i)} emptyLabel={tr('sales:hub.noSales')} />
        </Card>

        <SectionHeader title={tr('sales:hub.recentInvoices')} action={tr('common:action.seeAll')} onAction={() => router.push('/(app)/sales/invoices')} />
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
      </ScrollView>

      <Fab icon="plus" label={tr('sales:hub.invoice')} onPress={() => router.push('/(app)/sales/invoices/new')} />
    </View>
  );
}
