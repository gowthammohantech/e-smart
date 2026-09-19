import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { AppHeader } from '@/components/AppHeader';
import { Screen, SectionHeader } from '@/components/Screen';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { StatRow, StatTile } from '@/components/StatTile';
import { QuickActions , quickActions } from '@/components/QuickActions';
import { BarChart } from '@/components/charts/BarChart';
import { AgingBars } from '@/components/charts/AgingBars';
import { DocumentRow } from '@/components/DocumentRow';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/Badge';
import { Fab } from '@/components/Fab';
import { Illustration } from '@/components/Illustration';
import { Sheet } from '@/components/Sheet';
import {
  useBaseCurrency,
  useCanOpen,
  useComplianceSummary,
  useCurrentUser,
  useModuleSet,
  useDocuments,
  useExpenses,
  useItems,
  useParties,
  usePayables,
  usePayments,
  useReceivables,
  useStockLevels,
} from '@/store/selectors';
import { money, subtract, sum } from '@/lib/money';
import { formatMoney } from '@/lib/format';
import { inRange, lastNMonths, monthLabel, resolveRange } from '@/lib/date';
import { isLowStock } from '@/domain/stockLedger';
import { useUiStore } from '@/store/uiStore';
import { openLixi } from '@/features/lixi/open';

export default function Home() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'nav']);
  const router = useRouter();
  const pullToLixi = useUiStore((s) => s.lixiAccess.pullDown);

  const user = useCurrentUser();
  const baseCurrency = useBaseCurrency();
  const invoices = useDocuments('invoice');
  const quotes = useDocuments('quote');
  const payments = usePayments();
  const expenses = useExpenses();
  const items = useItems({ activeOnly: true });
  const stock = useStockLevels();
  const customers = useParties('customer');
  const receivables = useReceivables();
  const payables = usePayables();
  const compliance = useComplianceSummary();
  const canOpen = useCanOpen();
  const full = useModuleSet() === 'full';

  const [actionsOpen, setActionsOpen] = useState(false);

  const thisMonth = resolveRange('thisMonth');

  const monthSales = useMemo(() => {
    const live = invoices.filter(
      (d) => inRange(d.date, thisMonth) && !['draft', 'cancelled'].includes(d.status),
    );
    return sum(
      live.map((d) => money(Math.round(d.totals.grandTotal.minor * (d.exchangeRate || 1)), baseCurrency)),
      baseCurrency,
    );
  }, [invoices, thisMonth, baseCurrency]);

  const monthExpenses = useMemo(() => {
    const live = expenses.filter((e) => inRange(e.date, thisMonth));
    return sum(
      live.map((e) => money(Math.round(e.amount.minor * (e.exchangeRate || 1)), baseCurrency)),
      baseCurrency,
    );
  }, [expenses, thisMonth, baseCurrency]);

  const monthCollected = useMemo(() => {
    const live = payments.filter((p) => p.direction === 'received' && inRange(p.date, thisMonth));
    return sum(
      live.map((p) => money(Math.round(p.amount.minor * (p.exchangeRate || 1)), baseCurrency)),
      baseCurrency,
    );
  }, [payments, thisMonth, baseCurrency]);

  const salesTrend = useMemo(() => {
    const keys = lastNMonths(6);
    return keys.map((key) => {
      const total = invoices
        .filter((d) => d.date.startsWith(key) && !['draft', 'cancelled'].includes(d.status))
        .reduce((acc, d) => acc + Math.round(d.totals.grandTotal.minor * (d.exchangeRate || 1)), 0);
      return { label: monthLabel(key), value: money(total, baseCurrency) };
    });
  }, [invoices, baseCurrency]);

  const lowStockItems = useMemo(
    () => items.filter((i) => isLowStock(i, stock[i.id] ?? 0)),
    [items, stock],
  );

  const overdueInvoices = useMemo(
    () =>
      receivables.outstanding
        .filter((o) => o.daysOverdue > 0)
        .sort((a, b) => b.daysOverdue - a.daysOverdue)
        .slice(0, 4),
    [receivables.outstanding],
  );

  const openQuotes = quotes.filter((q) => q.status === 'sent');
  const draftInvoices = invoices.filter((d) => d.status === 'draft');
  const nameOf = (id: string) => customers.find((c) => c.id === id)?.name ?? 'Unknown';

  type AttentionItem = {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
    count: number;
    route: string;
    tone: 'danger' | 'warning' | 'info';
  };

  const attention: AttentionItem[] = ([
    { icon: 'alert-circle-outline', label: 'Overdue invoices', count: receivables.outstanding.filter((o) => o.daysOverdue > 0).length, route: '/(app)/receivables', tone: 'danger' },
    { icon: 'file-document-outline', label: 'Draft invoices', count: draftInvoices.length, route: '/(app)/sales/invoices', tone: 'warning' },
    { icon: 'file-percent-outline', label: 'Quotes awaiting reply', count: openQuotes.length, route: '/(app)/sales/quotes', tone: 'info' },
    { icon: 'package-variant', label: 'Items low on stock', count: lowStockItems.length, route: '/(app)/inventory/low-stock', tone: 'warning' },
    { icon: 'shield-alert-outline', label: 'E-invoices rejected', count: compliance.eInvoice.failed, route: '/(app)/compliance', tone: 'danger' },
    { icon: 'clock-alert-outline', label: 'E-way bills expiring in 24 h', count: compliance.expiringSoon, route: '/(app)/compliance', tone: 'warning' },
  ] as AttentionItem[]).filter((a) => a.count > 0 && canOpen(a.route));

  const recent = useMemo(
    () => invoices.filter((d) => d.status !== 'cancelled').slice(0, 5),
    [invoices],
  );

  const netThisMonth = subtract(monthSales, monthExpenses);

  // A business created moments ago has nothing to summarise — a wall of zeroes
  // and empty charts reads as broken, so show a first-run block instead.
  const isFirstRun = invoices.length === 0 && payments.length === 0 && expenses.length === 0;

  if (isFirstRun) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <AppHeader />
        <Screen bottomInset={80}>
          <View style={{ alignItems: 'center', gap: t.spacing.md, paddingTop: t.spacing.xl }}>
            <Illustration name="empty-dashboard" size="hero" />
            <Text variant="h2" center>
              Let&apos;s get you started
            </Text>
            <Text variant="small" tone="muted" center style={{ maxWidth: 300, lineHeight: 20 }}>
              Raise your first invoice and this dashboard fills in — sales, collections, what you&apos;re owed and where
              the money goes.
            </Text>
          </View>

          <View style={{ marginTop: t.spacing.xxl, marginHorizontal: -t.spacing.lg, paddingLeft: t.spacing.lg }}>
            <QuickActions />
          </View>

          <SectionHeader title="First steps" />
          <Card padded={false}>
            {[
              { label: 'Add a customer', icon: 'account-plus-outline' as const, route: '/(app)/contacts/customers/new' },
              { label: 'Add a product or service', icon: 'tag-plus-outline' as const, route: '/(app)/catalog/items/new' },
              { label: 'Create your first invoice', icon: 'file-document-edit-outline' as const, route: '/(app)/sales/invoices/new' },
            ].map((step, i, arr) => (
              <Pressable
                key={step.label}
                onPress={() => router.push(step.route as never)}
                accessibilityRole="button"
                accessibilityLabel={step.label}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  padding: t.spacing.lg,
                  borderBottomWidth: i < arr.length - 1 ? 0.5 : 0,
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
                  <MaterialCommunityIcons name={step.icon} size={19} color={t.c.primary} />
                </View>
                <Text variant="body" weight="500" style={{ flex: 1 }}>
                  {step.label}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
              </Pressable>
            ))}
          </Card>
        </Screen>

        <Fab icon="plus" label="Invoice" onPress={() => router.push('/(app)/sales/invoices/new')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <AppHeader />

      <Screen
        bottomInset={80}
        onRefresh={pullToLixi ? () => openLixi() : undefined}
        refreshTitle="Let go to ask Lixi"
      >
        <Text variant="h2" style={{ marginBottom: 2 }}>
          {greeting()}, {user?.name?.split(' ')[0] ?? 'there'}
        </Text>
        <Text variant="small" tone="muted">
          Here&apos;s how the business is doing this month.
        </Text>

        <View style={{ marginTop: t.spacing.xl, marginHorizontal: -t.spacing.lg, paddingLeft: t.spacing.lg }}>
          <QuickActions />
        </View>

        <SectionHeader title="This month" />
        <View style={{ gap: t.spacing.md }}>
          <StatRow>
            <StatTile
              label="Sales"
              value={monthSales}
              icon="trending-up"
              caption={`${invoices.filter((d) => inRange(d.date, thisMonth) && d.status !== 'draft').length} invoices`}
              onPress={() => router.push('/(app)/reports/sales-summary')}
            />
            <StatTile
              label="Collected"
              value={monthCollected}
              tone="good"
              icon="cash-check"
              caption="Payments received"
              onPress={() => router.push('/(app)/payments/received')}
            />
          </StatRow>
          {full ? (
          <StatRow>
            <StatTile
              label="Expenses"
              value={monthExpenses}
              tone="warn"
              icon="receipt-text-outline"
              caption={`${expenses.filter((e) => inRange(e.date, thisMonth)).length} entries`}
              onPress={() => router.push('/(app)/expenses')}
            />
            <StatTile
              label="Net"
              value={netThisMonth}
              tone={netThisMonth.minor >= 0 ? 'good' : 'bad'}
              icon="scale-balance"
              caption="Sales less expenses"
              onPress={() => router.push('/(app)/reports/profit')}
            />
          </StatRow>
          ) : (
          <StatRow>
            <StatTile
              label="E-invoices"
              value={String(compliance.eInvoice.generated)}
              tone="good"
              icon="shield-check-outline"
              caption={compliance.eInvoice.failed ? `${compliance.eInvoice.failed} rejected` : 'Reported to IRP'}
              onPress={() => router.push('/(app)/(tabs)/gst')}
            />
            <StatTile
              label="E-way bills"
              value={String(compliance.eway.active)}
              tone={compliance.expiringSoon ? 'warn' : 'default'}
              icon="truck-fast-outline"
              caption={compliance.expiringSoon ? `${compliance.expiringSoon} expire in 24 h` : 'Active'}
              onPress={() => router.push('/(app)/(tabs)/gst')}
            />
          </StatRow>
          )}
        </View>

        <SectionHeader title="Sales trend" action="Reports" onAction={() => router.push('/(app)/reports/sales-summary')} />
        <Card>
          <BarChart data={salesTrend} caption="Invoiced value, last 6 months" />
        </Card>

        <SectionHeader title="Money owed to you" action="View all" onAction={() => router.push('/(app)/receivables')} />
        <Card style={{ gap: t.spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ gap: 3 }}>
              <Text variant="caption" tone="muted">
                Total receivable
              </Text>
              <Text variant="h2" weight="700">
                {formatMoney(receivables.summary.total)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 5 }}>
              <Badge label={`${formatMoney(receivables.summary.overdue)} overdue`} tone="danger" size="sm" />
              <Badge label={`${formatMoney(receivables.summary.dueSoon)} due soon`} tone="warning" size="sm" />
            </View>
          </View>
          <AgingBars
            buckets={receivables.summary.buckets.map((b) => ({
              key: b.key,
              label: b.label,
              amount: b.amount,
              count: b.count,
            }))}
          />
        </Card>

        {full ? (
        <>
        <SectionHeader title="You owe" action="View all" onAction={() => router.push('/(app)/payables')} />
        <Card
          onPress={() => router.push('/(app)/payables')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <View style={{ gap: 3 }}>
            <Text variant="caption" tone="muted">
              Total payable
            </Text>
            <Text variant="h3" weight="700">
              {formatMoney(payables.summary.total)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Badge label={`${formatMoney(payables.summary.overdue)} overdue`} tone="danger" size="sm" />
            <Text variant="micro" tone="muted">
              {payables.outstanding.length} open bills
            </Text>
          </View>
        </Card>
        </>
        ) : null}

        {attention.length > 0 ? (
          <>
            <SectionHeader title="Needs your attention" />
            <Card padded={false}>
              {attention.map((a, i) => (
                <Pressable
                  key={a.label}
                  onPress={() => router.push(a.route as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`${a.count} ${a.label}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: t.spacing.md,
                    padding: t.spacing.lg,
                    borderBottomWidth: i < attention.length - 1 ? 0.5 : 0,
                    borderBottomColor: t.c.line,
                    backgroundColor: pressed ? t.c.card2 : 'transparent',
                  })}
                >
                  <MaterialCommunityIcons
                    name={a.icon}
                    size={20}
                    color={a.tone === 'danger' ? t.c.bad : a.tone === 'warning' ? t.c.warn : t.c.primary}
                  />
                  <Text variant="body" style={{ flex: 1 }}>
                    {a.label}
                  </Text>
                  <Badge label={String(a.count)} tone={a.tone} size="sm" />
                  <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
                </Pressable>
              ))}
            </Card>
          </>
        ) : null}

        {overdueInvoices.length > 0 ? (
          <>
            <SectionHeader title="Chase these first" action="Receivables" onAction={() => router.push('/(app)/receivables')} />
            <Card padded={false}>
              {overdueInvoices.map((o, i) => (
                <DocumentRow
                  key={o.document.id}
                  document={o.document}
                  partyName={nameOf(o.document.partyId)}
                  outstandingLabel={`${o.daysOverdue}d overdue`}
                  divider={i < overdueInvoices.length - 1}
                  onPress={() => router.push(`/(app)/sales/invoices/${o.document.id}`)}
                />
              ))}
            </Card>
          </>
        ) : null}

        <SectionHeader title="Recent invoices" action="See all" onAction={() => router.push('/(app)/sales/invoices')} />
        <Card padded={false}>
          {recent.length === 0 ? (
            <EmptyState
              illustration="no-documents"
              icon="file-document-outline"
              title="No invoices yet"
              message="Create your first invoice and it will show up here."
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
      </Screen>

      <Fab icon="plus" onPress={() => setActionsOpen(true)} bottom={0} />

      <Sheet visible={actionsOpen} onClose={() => setActionsOpen(false)} title="Create">
        {quickActions(tr, t.c.primary).filter((a) => canOpen(a.route)).map((a) => (
          <Pressable
            key={a.key}
            onPress={() => {
              setActionsOpen(false);
              router.push(a.route as never);
            }}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              paddingVertical: t.spacing.md,
              paddingHorizontal: t.spacing.lg,
              backgroundColor: pressed ? t.c.card2 : 'transparent',
            })}
          >
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: t.radius.sm,
                backgroundColor: t.c.chip,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name={a.icon} size={20} color={t.c.primary} />
            </View>
            <Text variant="body" weight="500" style={{ flex: 1 }}>
              {a.label}
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
