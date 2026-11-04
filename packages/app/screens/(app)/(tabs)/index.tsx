import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { AppHeader } from '../../../components/AppHeader';
import { Screen, SectionHeader } from '@esmart/ui/components/Screen';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { Columns, StatGrid } from '@esmart/ui/components/Layout';
import { QuickActions , quickActions } from '../../../components/QuickActions';
import { BarChart } from '@esmart/ui/components/charts/BarChart';
import { AgingBars } from '@esmart/ui/components/charts/AgingBars';
import { DocumentRow } from '@esmart/ui/components/DocumentRow';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Badge } from '@esmart/ui/components/Badge';
import { Fab } from '@esmart/ui/components/Fab';
import { Illustration } from '@esmart/ui/components/Illustration';
import { Sheet } from '@esmart/ui/components/Sheet';
import { useBaseCurrency, useCanOpen, useComplianceSummary, useCurrentUser, useModuleSet } from '../../../store/selectors';
import { useAppStore } from '../../../store/appStore';
import { useHomeHub } from '../../../remote/queries';
import { LoadingView } from '../../../components/LoadingView';
import { money, subtract } from '@esmart/core/lib/money';
import { formatMoney } from '@esmart/core/lib/format';
import { monthLabelNarrow } from '@esmart/core/lib/date';
import { AGING_BUCKETS } from '@esmart/core/domain/receivables';
import type { BusinessDocument } from '@esmart/core/types';
import { useUiStore } from '../../../store/uiStore';
import { openLixi } from '../../../features/lixi/open';
import { FirstRunDesktop } from '../../../features/reports/FirstRunDesktop';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';

export default function Home() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'reports', 'nav', 'lixi']);
  const router = useRouter();
  const pullToLixi = useUiStore((s) => s.lixiAccess.pullDown);

  const user = useCurrentUser();
  const baseCurrency = useBaseCurrency();
  const compliance = useComplianceSummary();
  const canOpen = useCanOpen();
  const full = useModuleSet() === 'full';
  // Every figure comes from the server in one call, already in base currency.
  const branchId = useAppStore((s) => s.activeBranchId) || undefined;
  const hub = useHomeHub(branchId).data;

  const [actionsOpen, setActionsOpen] = useState(false);
  // Always false in the native apps.
  const desktop = useIsDesktop();

  const zero = money(0, baseCurrency);
  const monthSales = hub?.salesThisMonth ?? zero;
  const monthExpenses = hub?.expensesThisMonth ?? zero;
  const monthCollected = hub?.collectedThisMonth ?? zero;
  const salesTrend = useMemo(() => (hub?.salesTrend ?? []).map((m) => ({ label: monthLabelNarrow(m.key!), value: m.value! })), [hub?.salesTrend]);
  const overdueInvoices = hub?.overdueInvoices ?? [];
  const recent = hub?.recentInvoices ?? [];
  const receivable = hub?.receivable;
  const nameOf = (d: { partyName?: string }) => d.partyName ?? tr('common:placeholder.unknown');

  type AttentionItem = {
    icon: IconName;
    label: string;
    count: number;
    route: string;
    tone: 'danger' | 'warning' | 'info';
  };

  const attention: AttentionItem[] = ([
    { icon: 'alert-circle-outline', label: tr('reports:home.attn.overdueInvoices'), count: receivable?.overdueCount ?? 0, route: '/(app)/receivables', tone: 'danger' },
    { icon: 'file-document-outline', label: tr('reports:home.attn.draftInvoices'), count: hub?.draftInvoices ?? 0, route: '/(app)/sales/invoices?status=draft', tone: 'warning' },
    { icon: 'file-percent-outline', label: tr('reports:home.attn.openQuotes'), count: hub?.openQuotes ?? 0, route: '/(app)/sales/quotes', tone: 'info' },
    { icon: 'package-variant', label: tr('reports:home.attn.lowStock'), count: hub?.lowStockCount ?? 0, route: '/(app)/inventory/low-stock', tone: 'warning' },
    { icon: 'shield-alert-outline', label: tr('reports:home.attn.eInvoiceRejected'), count: compliance.eInvoice.failed, route: '/(app)/compliance', tone: 'danger' },
    { icon: 'clock-alert-outline', label: tr('reports:home.attn.ewbExpiring'), count: compliance.expiringSoon, route: '/(app)/compliance?tab=eway', tone: 'warning' },
  ] as AttentionItem[]).filter((a) => a.count > 0 && canOpen(a.route));

  const netThisMonth = subtract(monthSales, monthExpenses);

  // A business created moments ago has nothing to summarise — a wall of zeroes
  // and empty charts reads as broken, so show a first-run block instead.
  const isFirstRun = !!hub?.firstRun;

  if (!hub) {
    return (
      <View style={{ flex: 1 }}>
        <AppHeader />
        <LoadingView />
      </View>
    );
  }

  // A desktop browser has the room for its own first-run layout; a phone keeps the one below.
  if (isFirstRun && desktop) {
    return (
      <View style={{ flex: 1 }}>
        <AppHeader />
        <Screen bottomInset={80}>
          <FirstRunDesktop />
        </Screen>

        <Fab icon="plus" label={tr('reports:home.invoice')} onPress={() => router.push('/(app)/sales/invoices/new')} />
      </View>
    );
  }

  if (isFirstRun) {
    return (
      <View style={{ flex: 1 }}>
        <AppHeader />
        <Screen bottomInset={80}>
          <View style={{ alignItems: 'center', gap: t.spacing.md, paddingTop: t.spacing.xl }}>
            <Illustration name="empty-dashboard" size="hero" />
            <Text variant="h2" center>
              {tr('nav:home.emptyTitle')}
            </Text>
            <Text variant="small" tone="muted" center style={{ maxWidth: 300, lineHeight: 20 }}>
              {tr('nav:home.emptyBody')}
            </Text>
          </View>

          <View style={{ marginTop: t.spacing.xxl, marginHorizontal: -t.spacing.lg, paddingLeft: t.spacing.lg }}>
            <QuickActions />
          </View>

          <SectionHeader title={tr('reports:home.firstSteps')} />
          <Card padded={false}>
            {[
              { label: tr('reports:home.step.customer.title'), icon: 'account-plus-outline' as const, route: '/(app)/contacts/customers/new' },
              { label: tr('reports:home.step.item.title'), icon: 'tag-plus-outline' as const, route: '/(app)/catalog/items/new' },
              { label: tr('reports:home.step.invoice.title'), icon: 'file-document-edit-outline' as const, route: '/(app)/sales/invoices/new' },
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
                  <Icon name={step.icon} size={19} color={t.c.primary} />
                </View>
                <Text variant="body" weight="500" style={{ flex: 1 }}>
                  {step.label}
                </Text>
                <Icon name="chevron-right" size={18} color={t.c.muted} />
              </Pressable>
            ))}
          </Card>
        </Screen>

        <Fab icon="plus" label={tr('reports:home.invoice')} onPress={() => router.push('/(app)/sales/invoices/new')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <AppHeader />

      <Screen
        bottomInset={80}
        onRefresh={pullToLixi ? () => openLixi() : undefined}
        refreshTitle={tr('lixi:ui.letGo')}
      >
        <Text variant="h2" style={{ marginBottom: 2 }}>
          {tr(greetingKey(), { name: user?.name?.split(' ')[0] ?? tr('nav:home.there') })}
        </Text>
        <Text variant="small" tone="muted">
          {tr('nav:home.subtitle')}
        </Text>

        <View style={{ marginTop: t.spacing.xl, marginHorizontal: -t.spacing.lg, paddingLeft: t.spacing.lg }}>
          <QuickActions />
        </View>

        <SectionHeader title={tr('reports:home.thisMonth')} />
        <StatGrid>
          <StatRow>
            <StatTile
              label={tr('reports:home.sales')}
              value={monthSales}
              icon="trending-up"
              caption={`${hub.invoicesThisMonth} invoices`}
              onPress={() => router.push('/(app)/reports/sales-summary')}
            />
            <StatTile
              label={tr('reports:home.collected')}
              value={monthCollected}
              tone="good"
              icon="cash-check"
              caption={tr('reports:home.paymentsReceived')}
              onPress={() => router.push('/(app)/payments/received')}
            />
          </StatRow>
          {full ? (
          <StatRow>
            <StatTile
              label={tr('reports:home.expenses')}
              value={monthExpenses}
              tone="warn"
              icon="receipt-text-outline"
              caption={`${hub.expenseEntriesThisMonth ?? 0} entries`}
              onPress={() => router.push('/(app)/expenses')}
            />
            <StatTile
              label={tr('reports:home.net')}
              value={netThisMonth}
              tone={netThisMonth.minor >= 0 ? 'good' : 'bad'}
              icon="scale-balance"
              caption={tr('reports:home.netCaption')}
              onPress={() => router.push('/(app)/reports/profit')}
            />
          </StatRow>
          ) : (
          <StatRow>
            <StatTile
              label={tr('reports:home.eInvoices')}
              value={String(compliance.eInvoice.generated)}
              tone="good"
              icon="shield-check-outline"
              caption={compliance.eInvoice.failed ? tr('nav:home.eInvoiceRejected', { count: compliance.eInvoice.failed }) : tr('nav:home.eInvoiceReported')}
              // Both cards name their tab: the GST tab stays mounted and would keep the last one.
              onPress={() => router.push('/(app)/(tabs)/gst?tab=eInvoice')}
            />
            <StatTile
              label={tr('reports:home.ewayBills')}
              value={String(compliance.eway.active)}
              tone={compliance.expiringSoon ? 'warn' : 'default'}
              icon="truck-fast-outline"
              caption={compliance.expiringSoon ? tr('nav:home.ewbExpiring', { count: compliance.expiringSoon }) : tr('nav:home.ewbActive')}
              onPress={() => router.push('/(app)/(tabs)/gst?tab=eway')}
            />
          </StatRow>
          )}
        </StatGrid>

        <Columns
          left={
            <>
              <SectionHeader title={tr('reports:home.salesTrend')} action={tr('nav:tab.reports')} onAction={() => router.push('/(app)/reports/sales-summary')} />
              <Card>
                <BarChart data={salesTrend} caption={tr('reports:home.salesTrendCaption')} />
              </Card>

              <SectionHeader title={tr('reports:home.owedToYou')} action={tr('nav:shell.viewAll')} onAction={() => router.push('/(app)/receivables')} />
              <Card style={{ gap: t.spacing.lg }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ gap: 3 }}>
                    <Text variant="caption" tone="muted">{tr('reports:home.totalReceivable')}</Text>
                    <Text variant="h2" weight="700">
                      {formatMoney(hub.receivable.total)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <Badge label={tr('nav:home.amountOverdue', { amount: formatMoney(hub.receivable.overdue) })} tone="danger" size="sm" />
                    <Badge label={tr('nav:home.amountDueSoon', { amount: formatMoney(hub.receivable.dueSoon) })} tone="warning" size="sm" />
                  </View>
                </View>
                <AgingBars
                  buckets={hub.receivable.buckets.map((b) => ({
                    key: b.key,
                    label: AGING_BUCKETS.find((x) => x.key === b.key)?.label ?? b.key,
                    amount: b.amount,
                    count: b.count,
                  }))}
                />
              </Card>

              {full ? (
                <>
              <SectionHeader title={tr('reports:home.youOwe')} action={tr('nav:shell.viewAll')} onAction={() => router.push('/(app)/payables')} />
              <Card
                onPress={() => router.push('/(app)/payables')}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <View style={{ gap: 3 }}>
                  <Text variant="caption" tone="muted">{tr('reports:home.totalPayable')}</Text>
                  <Text variant="h3" weight="700">
                    {formatMoney(hub.payable?.total ?? zero)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge label={tr('nav:home.amountOverdue', { amount: formatMoney(hub.payable?.overdue ?? zero) })} tone="danger" size="sm" />
                  <Text variant="micro" tone="muted">
                    {tr('nav:home.openBills', { count: hub.payable?.count ?? 0 })}
                  </Text>
                </View>
              </Card>
                </>
              ) : null}
            </>
          }
          right={
            <>
              {attention.length > 0 ? (
                <>
                  <SectionHeader title={tr('reports:home.attention')} />
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
                        <Icon
                          name={a.icon}
                          size={20}
                          color={a.tone === 'danger' ? t.c.bad : a.tone === 'warning' ? t.c.warn : t.c.primary}
                        />
                        <Text variant="body" style={{ flex: 1 }}>
                          {a.label}
                        </Text>
                        <Badge label={String(a.count)} tone={a.tone} size="sm" />
                        <Icon name="chevron-right" size={18} color={t.c.muted} />
                      </Pressable>
                    ))}
                  </Card>
                </>
              ) : null}

              {overdueInvoices.length > 0 ? (
                <>
                  <SectionHeader title={tr('reports:home.attentionCaption')} action={tr('nav:title.receivables')} onAction={() => router.push('/(app)/receivables')} />
                  <Card padded={false}>
                    {overdueInvoices.map((o, i) => (
                      <DocumentRow
                        key={o.document.id}
                        document={o.document as unknown as BusinessDocument}
                        partyName={nameOf(o.document)}
                        outstandingLabel={tr('nav:home.daysOverdue', { count: o.daysOverdue })}
                        divider={i < overdueInvoices.length - 1}
                        onPress={() => router.push(`/(app)/sales/invoices/${o.document.id}`)}
                      />
                    ))}
                  </Card>
                </>
              ) : null}

              <SectionHeader title={tr('reports:home.recentInvoices')} action={tr('common:action.seeAll')} onAction={() => router.push('/(app)/sales/invoices')} />
              <Card padded={false}>
                {recent.length === 0 ? (
                  <EmptyState
                    illustration="no-documents"
                    icon="file-document-outline"
                    title={tr('reports:home.noInvoices')}
                    message={tr('reports:home.noInvoicesBody')}
                    actionLabel={tr('reports:home.newInvoice')}
                    onAction={() => router.push('/(app)/sales/invoices/new')}
                    compact
                  />
                ) : (
                  recent.map((d, i) => (
                    <DocumentRow
                      key={d.id}
                      document={d as unknown as BusinessDocument}
                      partyName={nameOf(d)}
                      divider={i < recent.length - 1}
                      onPress={() => router.push(`/(app)/sales/invoices/${d.id}`)}
                    />
                  ))
                )}
              </Card>
            </>
          }
        />
      </Screen>

      <Fab icon="plus" onPress={() => setActionsOpen(true)} bottom={0} />

      <Sheet visible={actionsOpen} onClose={() => setActionsOpen(false)} title={tr('reports:home.create')}>
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
              <Icon name={a.icon} size={20} color={t.c.primary} />
            </View>
            <Text variant="body" weight="500" style={{ flex: 1 }}>
              {a.label}
            </Text>
            <Icon name="chevron-right" size={18} color={t.c.muted} />
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'nav:home.greetMorning' as const;
  if (h < 17) return 'nav:home.greetAfternoon' as const;
  return 'nav:home.greetEvening' as const;
}
