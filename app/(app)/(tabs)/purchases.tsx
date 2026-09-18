import React, { useMemo } from 'react';
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
import { DonutChart } from '@/components/charts/DonutChart';
import {
  useBaseCurrency,
  useDocuments,
  useExpenseCategories,
  useExpenses,
  useParties,
  usePayables,
  usePayments,
} from '@/store/selectors';
import { money, sum } from '@/lib/money';
import { inRange, resolveRange } from '@/lib/date';

export default function PurchasesTab() {
  const t = useTheme();
  const router = useRouter();

  const baseCurrency = useBaseCurrency();
  const bills = useDocuments('purchaseBill');
  const orders = useDocuments('purchaseOrder');
  const receipts = useDocuments('goodsReceipt');
  const returns = useDocuments('purchaseReturn');
  const expenses = useExpenses();
  const categories = useExpenseCategories();
  const payments = usePayments('paid');
  const payables = usePayables();
  const suppliers = useParties('supplier');

  const month = resolveRange('thisMonth');

  const monthPurchases = useMemo(
    () =>
      sum(
        bills
          .filter((d) => inRange(d.date, month) && !['draft', 'cancelled'].includes(d.status))
          .map((d) => money(Math.round(d.totals.grandTotal.minor * (d.exchangeRate || 1)), baseCurrency)),
        baseCurrency,
      ),
    [bills, month, baseCurrency],
  );

  const monthExpenses = useMemo(
    () =>
      sum(
        expenses
          .filter((e) => inRange(e.date, month))
          .map((e) => money(Math.round(e.amount.minor * (e.exchangeRate || 1)), baseCurrency)),
        baseCurrency,
      ),
    [expenses, month, baseCurrency],
  );

  const expenseSlices = useMemo(() => {
    const map = new Map<string, number>();
    expenses
      .filter((e) => inRange(e.date, resolveRange('last90')))
      .forEach((e) => {
        map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + Math.round(e.amount.minor * (e.exchangeRate || 1)));
      });
    return Array.from(map.entries()).map(([id, minor]) => ({
      label: categories.find((c) => c.id === id)?.name ?? 'Other',
      value: money(minor, baseCurrency),
    }));
  }, [expenses, categories, baseCurrency]);

  const recent = bills.filter((d) => d.status !== 'cancelled').slice(0, 6);
  const nameOf = (id: string) => suppliers.find((s) => s.id === id)?.name ?? 'Unknown';

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <AppHeader title="Purchases" subtitle="Orders, bills, expenses and payments out" />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <StatRow>
          <StatTile
            label="Purchases this month"
            value={monthPurchases}
            icon="cart-outline"
            onPress={() => router.push('/(app)/purchases/bills')}
          />
          <StatTile
            label="Expenses"
            value={monthExpenses}
            tone="warn"
            icon="receipt-text-outline"
            onPress={() => router.push('/(app)/expenses')}
          />
        </StatRow>

        <View style={{ height: t.spacing.md }} />

        <StatRow>
          <StatTile
            label="Payable"
            value={payables.summary.total}
            icon="file-clock-outline"
            caption={`${payables.outstanding.length} open bills`}
            onPress={() => router.push('/(app)/payables')}
          />
          <StatTile
            label="Overdue"
            value={payables.summary.overdue}
            tone="bad"
            icon="alert-circle-outline"
            onPress={() => router.push('/(app)/payables')}
          />
        </StatRow>

        <SectionHeader title="Purchase documents" />
        <HubTiles
          tiles={[
            { key: 'bills', label: 'Purchase bills', icon: 'file-document-outline', route: '/(app)/purchases/bills', count: bills.length },
            { key: 'orders', label: 'Purchase orders', icon: 'clipboard-list-outline', route: '/(app)/purchases/orders', count: orders.length },
            { key: 'receipts', label: 'Goods receipts', icon: 'package-down', route: '/(app)/purchases/receipts', count: receipts.length },
            { key: 'returns', label: 'Purchase returns', icon: 'package-up', route: '/(app)/purchases/returns', count: returns.length },
            { key: 'expenses', label: 'Expenses', icon: 'receipt-text-outline', route: '/(app)/expenses', count: expenses.length },
            { key: 'payments', label: 'Payments out', icon: 'cash-minus', route: '/(app)/payments/made', count: payments.length },
          ]}
        />

        <SectionHeader title="Where the money goes" action="Report" onAction={() => router.push('/(app)/reports/expense-summary')} />
        <Card>
          <DonutChart slices={expenseSlices} centerLabel="Last 90 days" />
        </Card>

        <SectionHeader title="Recent bills" action="See all" onAction={() => router.push('/(app)/purchases/bills')} />
        <Card padded={false}>
          {recent.length === 0 ? (
            <EmptyState
              icon="file-document-outline"
              title="No purchase bills yet"
              actionLabel="Record a bill"
              onAction={() => router.push('/(app)/purchases/bills/new')}
              compact
            />
          ) : (
            recent.map((d, i) => (
              <DocumentRow
                key={d.id}
                document={d}
                partyName={nameOf(d.partyId)}
                divider={i < recent.length - 1}
                onPress={() => router.push(`/(app)/purchases/bills/${d.id}`)}
              />
            ))
          )}
        </Card>
      </ScrollView>

      <Fab icon="plus" label="Bill" onPress={() => router.push('/(app)/purchases/bills/new')} />
    </View>
  );
}
