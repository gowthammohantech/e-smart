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
import { useBaseCurrency, useCanOpen, useComplianceSummary, useCurrentUser, useDashboardScope, useHasModule, useModuleSet } from '../../../store/selectors';
import { useHomeHub } from '../../../remote/queries';
import { money, type Money } from '@esmart/core/lib/money';
import { formatCompactMoney, formatMoney } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import { AGING_BUCKETS } from '@esmart/core/domain/receivables';
import type { DocStatus } from '@esmart/core/types';
import { statusLabel } from '@esmart/core/labels';
import { PairedBars } from '@esmart/ui/components/charts/PairedBars';
import { StatusBar } from '@esmart/ui/components/charts/StatusBar';
import { seriesColor } from '@esmart/ui/theme/chartColors';
import { HubState } from '../../../features/dashboard/HubState';
import { PeriodBar } from '../../../features/dashboard/PeriodBar';
import { FilingCards } from '../../../features/dashboard/FilingCards';
import { bucketLabel, delta, periodTitle } from '../../../features/dashboard/labels';
import { major, useCardExport } from '../../../features/dashboard/exportCard';
import { useUiStore } from '../../../store/uiStore';
import { openLixi } from '../../../features/lixi/open';
import { FirstRunDesktop } from '../../../features/reports/FirstRunDesktop';
import { SetupChecklist } from '../../../features/reports/SetupChecklist';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';

export default function Home() {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'reports', 'nav', 'lixi', 'domain']);
  const router = useRouter();
  const pullToLixi = useUiStore((s) => s.lixiAccess.pullDown);

  const user = useCurrentUser();
  const baseCurrency = useBaseCurrency();
  const compliance = useComplianceSummary();
  const canOpen = useCanOpen();
  const full = useModuleSet() === 'full';
  const withStock = useHasModule('inventory');
  const exportCsv = useCardExport();
  // Every figure comes from the server in one call, already in base currency, for the branch and
  // period the header and period bar name.
  const scope = useDashboardScope();
  const query = useHomeHub(scope);
  const hub = query.data;

  const [actionsOpen, setActionsOpen] = useState(false);
  // Always false in the native apps.
  const desktop = useIsDesktop();

  const zero = money(0, baseCurrency);
  const monthSales = hub?.salesThisMonth ?? zero;
  const monthExpenses = hub?.expensesThisMonth ?? zero;
  const monthCollected = hub?.collectedThisMonth ?? zero;
  const grain = hub?.period.grain ?? 'month';
  const salesTrend = useMemo(() => (hub?.salesTrend ?? []).map((m) => ({ label: bucketLabel(m.key!, grain), value: m.value! })), [hub?.salesTrend, grain]);
  const cashFlow = useMemo(() => (hub?.cashFlow ?? []).map((r) => ({ label: bucketLabel(r.key, grain), inflow: r.inflow, outflow: r.outflow })), [hub?.cashFlow, grain]);
  const prev = hub?.previous;
  const title = periodTitle(tr, hub?.period);
  const overdueInvoices = hub?.overdueInvoices ?? [];
  const recent = hub?.recentInvoices ?? [];
  const receivable = hub?.receivable;
  const nameOf = (d: { partyName?: string }) => d.partyName ?? tr('common:placeholder.unknown');
  const movementLabel = (r: { kind: 'received' | 'paid' | 'expense'; label: string }) =>
    tr(r.kind === 'received' ? 'reports:dash.home.received' : r.kind === 'paid' ? 'reports:dash.home.paid' : 'reports:dash.home.spent', { name: r.label || tr('common:placeholder.unknown') });

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

  // The profit report's own figure for the same period and branch, not sales less expenses.
  const profit = hub?.profit ?? zero;
  const STATUS_COLOR: Record<string, string> = { paid: t.c.good, partiallyPaid: seriesColor(t.scheme, 0), issued: seriesColor(t.scheme, 2), overdue: t.c.bad };

  // A business created moments ago has nothing to summarise — a wall of zeroes
  // and empty charts reads as broken, so show a first-run block instead.
  const isFirstRun = !!hub?.firstRun;

  // One "+" everywhere on Home, first run or not: it offers every kind of new entry.
  const createSheet = (
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
  );
  const fab = <Fab icon="plus" label={tr('reports:home.create')} onPress={() => setActionsOpen(true)} />;

  if (!hub) {
    return (
      <View style={{ flex: 1 }}>
        <AppHeader />
        <Screen bottomInset={80}>
          <HubState query={query}>{() => null}</HubState>
        </Screen>
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

        {fab}
        {createSheet}
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

          <View style={{ marginTop: t.spacing.xl }}>
            <SetupChecklist />
          </View>
        </Screen>

        {fab}
        {createSheet}
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

        {/* Until the business is set up (or the person hides it). */}
        <View style={{ marginTop: t.spacing.lg }}>
          <SetupChecklist />
        </View>

        <View style={{ marginTop: t.spacing.xl, marginHorizontal: -t.spacing.lg, paddingLeft: t.spacing.lg }}>
          <QuickActions />
        </View>

        <PeriodBar />

        <SectionHeader title={title} />
        <StatGrid>
          <StatRow>
            <StatTile
              label={tr('reports:home.sales')}
              value={monthSales}
              icon="trending-up"
              caption={tr('reports:home.invoicesCount', { count: hub.invoicesThisMonth })}
              delta={delta(hub.salesThisMonth, prev?.sales)}
              onPress={() => router.push('/(app)/reports/sales-summary')}
            />
            <StatTile
              label={tr('reports:home.collected')}
              value={monthCollected}
              tone="good"
              icon="cash-check"
              caption={tr('reports:home.paymentsReceived')}
              delta={delta(hub.collectedThisMonth, prev?.collected)}
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
              caption={tr('reports:home.entriesCount', { count: hub.expenseEntriesThisMonth ?? 0 })}
              delta={delta(hub.expensesThisMonth, prev?.expenses, true)}
              onPress={() => router.push('/(app)/expenses')}
            />
            <StatTile
              label={tr('reports:dash.home.profit')}
              value={profit}
              tone={profit.minor >= 0 ? 'good' : 'bad'}
              icon="scale-balance"
              caption={tr('reports:dash.home.profitCaption')}
              delta={delta(hub.profit, prev?.profit)}
              onPress={() => router.push('/(app)/accounts')}
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
              <SectionHeader
                title={tr('reports:home.salesTrend')}
                action={tr('reports:dash.export.csv')}
                onAction={() => exportCsv(tr('reports:home.salesTrend'), hub.period, { headers: [tr('reports:dash.period.label'), tr('reports:home.sales')], rows: (hub.salesTrend ?? []).map((r) => [r.key!, major(r.value)]) })}
              />
              <Card>
                <BarChart data={salesTrend} caption={tr('reports:dash.sales.trendCaption')} />
              </Card>

              <SectionHeader
                title={tr('reports:dash.home.cashFlow')}
                action={tr('reports:dash.export.csv')}
                onAction={() =>
                  exportCsv(tr('reports:dash.home.cashFlow'), hub.period, {
                    headers: [tr('reports:dash.period.label'), tr('reports:dash.home.moneyIn'), tr('reports:dash.home.moneyOut'), tr('reports:dash.home.net')],
                    rows: hub.cashFlow.map((r) => [r.key, major(r.inflow), major(r.outflow), major(r.inflow) - major(r.outflow)]),
                  })
                }
              />
              <Card>
                <PairedBars data={cashFlow} caption={tr('reports:dash.home.cashFlowCaption')} inLabel={tr('reports:dash.home.moneyIn')} outLabel={tr('reports:dash.home.moneyOut')} netLabel={tr('reports:dash.home.net')} />
              </Card>

              <SectionHeader
                title={tr('reports:dash.home.invoiceStatus')}
                action={tr('reports:dash.export.csv')}
                onAction={() =>
                  exportCsv(tr('reports:dash.home.invoiceStatus'), hub.period, {
                    headers: [tr('reports:dash.home.invoiceStatus'), tr('reports:dash.home.count'), tr('reports:home.sales')],
                    rows: hub.invoiceStatus.map((r) => [statusLabel(tr, r.status as DocStatus), r.count, major(r.total)]),
                  })
                }
              />
              <Card>
                <StatusBar
                  emptyLabel={tr('reports:dash.home.noInvoices')}
                  segments={hub.invoiceStatus.map((r) => ({
                    key: r.status,
                    label: statusLabel(tr, r.status as DocStatus),
                    count: r.count,
                    total: r.total,
                    color: STATUS_COLOR[r.status] ?? t.c.muted,
                    onPress: () => router.push(`/(app)/sales/invoices?status=${r.status}` as never),
                  }))}
                />
              </Card>

              <SectionHeader title={tr('reports:home.owedToYou')} action={tr('nav:shell.viewAll')} onAction={() => router.push('/(app)/receivables')} />
              <Card style={{ gap: t.spacing.lg }}>
                {/* On a narrow phone the badges drop under the amount rather than squeezing it. */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: t.spacing.sm }}>
                  <View style={{ gap: 3, flexShrink: 1, minWidth: 0 }}>
                    <Text variant="caption" tone="muted">{tr('reports:home.totalReceivable')}</Text>
                    <Text variant="h2" weight="700" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {formatMoney(hub.receivable.total)}
                    </Text>
                  </View>
                  <View style={{ alignItems: desktop ? 'flex-end' : 'flex-start', gap: 5 }}>
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
                style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: t.spacing.sm }}
              >
                <View style={{ gap: 3, flexShrink: 1, minWidth: 0 }}>
                  <Text variant="caption" tone="muted">{tr('reports:home.totalPayable')}</Text>
                  <Text variant="h3" weight="700" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
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
              <SectionHeader title={tr('reports:dash.home.cash')} />
              <Card style={{ gap: t.spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <Text variant="h2" weight="700" tone={hub.cash.total.minor < 0 ? 'bad' : 'default'}>
                    {formatMoney(hub.cash.total)}
                  </Text>
                  <Text variant="caption" tone="muted">{tr('reports:dash.home.cashAccounts', { count: hub.cash.accounts.length })}</Text>
                </View>
                {hub.cash.accounts.slice(0, 4).map((a) => (
                  <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                    <Icon name={a.type === 'cash' ? 'cash-multiple' : 'bank'} size={16} color={t.c.muted} />
                    <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>{a.name}</Text>
                    <Text variant="small" weight="600" tone={a.balance.minor < 0 ? 'bad' : 'default'}>{formatMoney(a.balance)}</Text>
                  </View>
                ))}
              </Card>

              {hub.inventory && withStock ? (
                <>
                  <SectionHeader title={tr('reports:dash.home.stock')} action={tr('nav:shell.viewAll')} onAction={() => router.push('/(app)/reports/stock')} />
                  <Card style={{ gap: t.spacing.md }} onPress={() => router.push('/(app)/reports/stock')}>
                    <View style={{ gap: 3 }}>
                      <Text variant="caption" tone="muted">{tr('reports:dash.home.stockValue')}</Text>
                      <Text variant="h3" weight="700">{formatMoney(hub.inventory.value)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
                      {hub.inventory.low ? <Badge label={tr('reports:dash.home.lowCount', { count: hub.inventory.low })} tone="warning" size="sm" /> : null}
                      {hub.inventory.out ? <Badge label={tr('reports:dash.home.outCount', { count: hub.inventory.out })} tone="danger" size="sm" /> : null}
                      {hub.inventory.dead ? <Badge label={tr('reports:dash.home.deadCount', { count: hub.inventory.dead })} tone="neutral" size="sm" /> : null}
                    </View>
                    {hub.inventory.dead && hub.inventory.deadValue ? (
                      <Text variant="micro" tone="muted">{tr('reports:dash.home.deadValue', { amount: formatCompactMoney(hub.inventory.deadValue) })}</Text>
                    ) : null}
                  </Card>
                </>
              ) : null}

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
                  <SectionHeader title={tr('reports:home.attentionCaption')} action={tr('nav:shell.viewAll')} onAction={() => router.push('/(app)/receivables')} />
                  <Card padded={false}>
                    {overdueInvoices.map((o, i) => (
                      <DocumentRow
                        key={o.document.id}
                        document={{ number: o.document.number ?? '', date: o.document.date!, status: o.document.status as DocStatus, totals: { grandTotal: o.document.grandTotal as Money } }}
                        partyName={nameOf(o.document)}
                        outstandingLabel={tr('nav:home.daysOverdue', { count: o.daysOverdue })}
                        divider={i < overdueInvoices.length - 1}
                        onPress={() => router.push(`/(app)/sales/invoices/${o.document.id}`)}
                      />
                    ))}
                  </Card>
                </>
              ) : null}

              <FilingCards branchId={scope.branchId} limit={4} />

              <SectionHeader
                title={tr('reports:dash.home.movement')}
                action={hub.moneyMovement.length ? tr('reports:dash.export.csv') : undefined}
                onAction={() =>
                  exportCsv(tr('reports:dash.home.movement'), hub.period, {
                    headers: [tr('reports:dash.home.date'), tr('reports:dash.home.movement'), tr('reports:dash.home.amount')],
                    rows: hub.moneyMovement.map((r) => [r.date, movementLabel(r), (r.kind === 'received' ? 1 : -1) * major(r.amount)]),
                  })
                }
              />
              <Card padded={false}>
                {hub.moneyMovement.length === 0 ? (
                  <Text variant="small" tone="muted" style={{ padding: t.spacing.lg }}>{tr('reports:dash.home.noMovement')}</Text>
                ) : (
                  hub.moneyMovement.map((r, i) => (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md, borderBottomWidth: i < hub.moneyMovement.length - 1 ? 0.5 : 0, borderBottomColor: t.c.line }}>
                      <Icon name={r.kind === 'received' ? 'cash-plus' : r.kind === 'paid' ? 'cash-minus' : 'receipt-text-outline'} size={18} color={r.kind === 'received' ? t.c.good : t.c.muted} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="small" weight="500" numberOfLines={1}>{movementLabel(r)}</Text>
                        <Text variant="micro" tone="muted" numberOfLines={1}>{[formatDate(r.date, 'd MMM'), r.accountName].filter(Boolean).join(' · ')}</Text>
                      </View>
                      <Text variant="small" weight="600" tone={r.kind === 'received' ? 'good' : 'default'}>
                        {tr(r.kind === 'received' ? 'reports:dash.home.plus' : 'reports:dash.home.minus', { amount: formatMoney(r.amount) })}
                      </Text>
                    </View>
                  ))
                )}
              </Card>

              <SectionHeader title={tr('reports:home.recentInvoices')} action={tr('nav:shell.viewAll')} onAction={() => router.push('/(app)/sales/invoices')} />
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
                      document={{ number: d.number ?? '', date: d.date!, status: d.status as DocStatus, totals: { grandTotal: d.grandTotal as Money } }}
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

      {fab}

      {createSheet}
    </View>
  );
}

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'nav:home.greetMorning' as const;
  if (h < 17) return 'nav:home.greetAfternoon' as const;
  return 'nav:home.greetEvening' as const;
}
