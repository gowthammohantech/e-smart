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
import { DonutChart } from '@esmart/ui/components/charts/DonutChart';
import { useBaseCurrency } from '../../../store/selectors';
import { usePurchasesHub } from '../../../remote/queries';
import { zero, type Money } from '@esmart/core/lib/money';
import type { DocStatus, DocumentKind } from '@esmart/core/types';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { DoodleScatter } from '@esmart/ui/components/Doodles';

export default function PurchasesTab() {
  const t = useTheme();
  const { t: tr } = useTranslation(['purchases', 'common', 'nav']);
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  // Worked out by the server: the whole book needn't be on the device to show it.
  const hub = usePurchasesHub().data;
  const none = zero(baseCurrency);
  const count = (kind: DocumentKind) => hub?.counts[kind] ?? 0;
  const monthPurchases = (hub?.billedThisMonth as Money | undefined) ?? none;
  const monthExpenses = (hub?.expensesThisMonth as Money | undefined) ?? none;
  const expenseSlices = (hub?.expensesByCategory ?? []).map((c) => ({ label: c.name, value: c.total as Money }));
  const recent = hub?.recentBills ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <DoodleScatter />
      <AppHeader title={tr('purchases:hub.title')} subtitle={tr('purchases:hub.subtitle')} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={SHOW_SCROLLBAR}
      >
        <StatGrid>
          <StatRow>
            <StatTile
              label={tr('purchases:hub.thisMonth')}
              value={monthPurchases}
              icon="cart-outline"
              onPress={() => router.push('/(app)/purchases/bills')}
            />
            <StatTile
              label={tr('purchases:hub.expenses')}
              value={monthExpenses}
              tone="warn"
              icon="receipt-text-outline"
              onPress={() => router.push('/(app)/expenses')}
            />
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
        <HubTiles
          tiles={[
            { key: 'bills', label: tr('nav:title.purchaseBills'), icon: 'file-document-outline', route: '/(app)/purchases/bills', count: count('purchaseBill') },
            { key: 'orders', label: tr('nav:title.purchaseOrders'), icon: 'clipboard-list-outline', route: '/(app)/purchases/orders', count: count('purchaseOrder') },
            { key: 'receipts', label: tr('nav:title.goodsReceipts'), icon: 'package-down', route: '/(app)/purchases/receipts', count: count('goodsReceipt') },
            { key: 'returns', label: tr('nav:title.purchaseReturns'), icon: 'package-up', route: '/(app)/purchases/returns', count: count('purchaseReturn') },
            { key: 'creditNotes', label: tr('nav:title.supplierCreditNotes'), icon: 'file-document-minus-outline', route: '/(app)/purchases/credit-notes', count: count('supplierCreditNote') },
            { key: 'debitNotes', label: tr('nav:title.supplierDebitNotes'), icon: 'file-document-plus-outline', route: '/(app)/purchases/debit-notes', count: count('supplierDebitNote') },
            { key: 'expenses', label: tr('purchases:hub.expenses'), icon: 'receipt-text-outline', route: '/(app)/expenses', count: hub?.expenses ?? 0 },
            { key: 'payments', label: tr('purchases:hub.paymentsOut'), icon: 'cash-minus', route: '/(app)/payments/made', count: hub?.paymentsMade ?? 0 },
          ]}
        />

        <SectionHeader title={tr('purchases:hub.whereMoneyGoes')} action={tr('nav:title.report')} onAction={() => router.push('/(app)/reports/expense-summary')} />
        <Card>
          <DonutChart slices={expenseSlices} centerLabel={tr('common:dateRange.last90')} />
        </Card>

        <SectionHeader title={tr('purchases:hub.recentBills')} action={tr('common:action.seeAll')} onAction={() => router.push('/(app)/purchases/bills')} />
        <Card padded={false}>
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
      </ScrollView>

      <Fab icon="plus" label={tr('purchases:hub.bill')} onPress={() => router.push('/(app)/purchases/bills/new')} />
    </View>
  );
}
