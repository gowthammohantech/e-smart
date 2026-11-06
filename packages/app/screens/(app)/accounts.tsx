import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Screen, SectionHeader } from '@esmart/ui/components/Screen';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { Icon } from '@esmart/ui/components/Icon';
import { Columns, StatGrid } from '@esmart/ui/components/Layout';
import { StatRow, StatTile } from '@esmart/ui/components/StatTile';
import { BarChart } from '@esmart/ui/components/charts/BarChart';
import { Waterfall } from '@esmart/ui/components/charts/Waterfall';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money, type Money } from '@esmart/core/lib/money';
import { useAccountsHub } from '../../remote/queries';
import { useDashboardScope } from '../../store/selectors';
import { HubState } from '../../features/dashboard/HubState';
import { PeriodBar } from '../../features/dashboard/PeriodBar';
import { bucketLabel, delta, periodTitle } from '../../features/dashboard/labels';
import { major, useCardExport } from '../../features/dashboard/exportCard';

/**
 * Accounts & P&L: the period's profit as the profit report gives it, where the cash went, the GST
 * position, and, for someone who sees every branch, the balance sheet and the accounts that moved.
 */
export default function AccountsHub() {
  const t = useTheme();
  const { t: tr } = useTranslation(['reports', 'books', 'common']);
  const router = useRouter();
  const scope = useDashboardScope();
  const query = useAccountsHub(scope);
  const exportCsv = useCardExport();

  return (
    <>
      <Stack.Screen options={{ title: tr('reports:dash.accounts.title') }} />
      <Screen bottomInset={40}>
        <Text variant="small" tone="muted" style={{ marginTop: t.spacing.md }}>
          {tr('reports:dash.accounts.subtitle')}
        </Text>
        <PeriodBar />
        <HubState query={query} tiles={4}>
          {(hub) => {
            const p = hub.profit;
            const prev = hub.previousProfit;
            const base = p.netProfit.currency;
            const neg = (m: Money) => money(-m.minor, m.currency);
            const cash = hub.cash;
            const taxNet = hub.tax.netPayable;
            const rows: [string, Money | undefined][] = [
              [tr('reports:dash.accounts.opening'), cash.opening],
              [tr('reports:dash.accounts.receipts'), cash.receipts],
              [tr('reports:dash.accounts.payments'), cash.payments],
              [tr('reports:dash.accounts.cashExpenses'), cash.expenses],
              [tr('reports:dash.accounts.taxPaid'), cash.tax],
              [tr('reports:dash.accounts.other'), cash.other],
              [tr('reports:dash.accounts.closing'), cash.closing],
            ];
            return (
              <>
                <SectionHeader title={periodTitle(tr, hub.period)} />
                <StatGrid>
                  <StatRow>
                    <StatTile label={tr('reports:dash.accounts.revenue')} value={p.revenue} icon="trending-up" delta={delta(p.revenue, prev?.revenue)} />
                    <StatTile label={tr('reports:dash.accounts.grossProfit')} value={p.grossProfit} tone={p.grossProfit.minor >= 0 ? 'good' : 'bad'} icon="chart-box-outline" delta={delta(p.grossProfit, prev?.grossProfit)} />
                  </StatRow>
                  <StatRow>
                    <StatTile
                      label={tr('reports:dash.accounts.netProfit')}
                      value={p.netProfit}
                      tone={p.netProfit.minor >= 0 ? 'good' : 'bad'}
                      icon="scale-balance"
                      caption={tr('reports:dash.accounts.margin', { pct: p.margin.toLocaleString(undefined, { maximumFractionDigits: 1 }) })}
                      delta={delta(p.netProfit, prev?.netProfit)}
                      onPress={() => router.push('/(app)/reports/profit')}
                    />
                    <StatTile label={tr('reports:dash.home.cash')} value={cash.net} tone={cash.net.minor >= 0 ? 'good' : 'bad'} icon="wallet-outline" caption={tr('reports:dash.home.net')} />
                  </StatRow>
                </StatGrid>

                <Columns
                  left={
                    <>
                      <SectionHeader
                        title={tr('reports:dash.accounts.waterfall')}
                        action={tr('reports:dash.export.csv')}
                        onAction={() =>
                          exportCsv(tr('reports:dash.accounts.waterfall'), hub.period, {
                            headers: [tr('reports:dash.accounts.waterfall'), tr('reports:dash.home.amount')],
                            rows: [
                              [tr('reports:dash.accounts.revenue'), major(p.revenue)],
                              [tr('reports:dash.accounts.costOfGoods'), -major(p.costOfGoods)],
                              [tr('reports:dash.accounts.grossProfit'), major(p.grossProfit)],
                              [tr('reports:dash.accounts.expenses'), -major(p.expenses)],
                              [tr('reports:dash.accounts.netProfit'), major(p.netProfit)],
                            ],
                          })
                        }
                      />
                      <Card onPress={() => router.push('/(app)/reports/profit')}>
                        <Waterfall
                          steps={[
                            { label: tr('reports:dash.accounts.revenue'), value: p.revenue, kind: 'total' },
                            { label: tr('reports:dash.accounts.costOfGoods'), value: neg(p.costOfGoods), kind: 'change' },
                            { label: tr('reports:dash.accounts.grossProfit'), value: p.grossProfit, kind: 'total' },
                            { label: tr('reports:dash.accounts.expenses'), value: neg(p.expenses), kind: 'change' },
                            { label: tr('reports:dash.accounts.netProfit'), value: p.netProfit, kind: 'total' },
                          ]}
                        />
                      </Card>

                      <SectionHeader title={tr('reports:dash.accounts.profitTrend')} />
                      <Card>
                        <BarChart data={hub.profitTrend.map((r) => ({ label: bucketLabel(r.key!, hub.period.grain), value: r.value as Money }))} caption={tr('reports:dash.accounts.profitTrendCaption')} />
                      </Card>

                      <SectionHeader
                        title={tr('reports:dash.accounts.cash')}
                        action={tr('reports:dash.export.csv')}
                        onAction={() => exportCsv(tr('reports:dash.accounts.cash'), hub.period, { headers: [tr('reports:dash.accounts.cash'), tr('reports:dash.home.amount')], rows: rows.filter(([, v]) => v).map(([k, v]) => [k, major(v)]) })}
                      />
                      <Card padded={false}>
                        {rows.map(([label, value], i) =>
                          value ? (
                            <View
                              key={label}
                              style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md, borderBottomWidth: i < rows.length - 1 ? 0.5 : 0, borderBottomColor: t.c.line }}
                            >
                              <Text variant="small" weight={i === 0 || i === rows.length - 1 ? '600' : '400'} tone={i === 0 || i === rows.length - 1 ? 'default' : 'muted'}>
                                {label}
                              </Text>
                              <Text variant="small" weight="600" tone={i > 0 && i < rows.length - 1 ? (value.minor >= 0 ? 'good' : 'bad') : 'default'}>
                                {formatMoney(value)}
                              </Text>
                            </View>
                          ) : null,
                        )}
                        {cash.opening === undefined ? (
                          <Text variant="micro" tone="muted" style={{ padding: t.spacing.lg }}>
                            {tr('reports:dash.accounts.branchNote')}
                          </Text>
                        ) : null}
                      </Card>
                    </>
                  }
                  right={
                    <>
                      <SectionHeader title={tr('reports:dash.accounts.tax')} action={tr('common:action.seeAll')} onAction={() => router.push('/(app)/reports/tax-summary')} />
                      <Card style={{ gap: t.spacing.md }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="small" tone="muted">{tr('reports:dash.accounts.output')}</Text>
                          <Text variant="small" weight="600">{formatMoney(hub.tax.output)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="small" tone="muted">{tr('reports:dash.accounts.input')}</Text>
                          <Text variant="small" weight="600">{formatMoney(hub.tax.input)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: t.c.line, paddingTop: t.spacing.md }}>
                          <Text variant="body" weight="600">{taxNet.minor >= 0 ? tr('reports:dash.accounts.netPayable') : tr('reports:dash.accounts.netCredit')}</Text>
                          <Text variant="body" weight="700" tone={taxNet.minor > 0 ? 'warn' : 'good'}>{formatMoney(money(Math.abs(taxNet.minor), base))}</Text>
                        </View>
                      </Card>

                      {hub.books ? (
                        <>
                          <SectionHeader title={tr('reports:dash.accounts.balanceSheet')} action={tr('common:action.seeAll')} onAction={() => router.push('/(app)/books/balance-sheet')} />
                          {hub.balanceSheet ? (
                            <Card style={{ gap: t.spacing.md }} onPress={() => router.push('/(app)/books/balance-sheet')}>
                              <Text variant="caption" tone="muted">{tr('reports:dash.accounts.asOf', { date: formatDate(hub.balanceSheet.asOf) })}</Text>
                              {(
                                [
                                  [tr('books:bs.assets'), hub.balanceSheet.assets, hub.balanceSheet.totalAssets],
                                  [tr('books:bs.liabilities'), hub.balanceSheet.liabilities, hub.balanceSheet.totalLiabilities],
                                ] as const
                              ).map(([side, lines, total]) => (
                                <View key={side} style={{ gap: 6 }}>
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text variant="small" weight="700">{side}</Text>
                                    <Text variant="small" weight="700">{formatMoney(total)}</Text>
                                  </View>
                                  {lines.map((l) => (
                                    <View key={l.heading} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: t.spacing.md }}>
                                      <Text variant="caption" tone="muted">{tr(`books:bs.heading.${l.heading}` as never)}</Text>
                                      <Text variant="caption">{formatMoney(l.total)}</Text>
                                    </View>
                                  ))}
                                </View>
                              ))}
                            </Card>
                          ) : null}

                          <SectionHeader
                            title={tr('reports:dash.accounts.movement')}
                            action={hub.accountMovement?.length ? tr('reports:dash.export.csv') : undefined}
                            onAction={() =>
                              exportCsv(tr('reports:dash.accounts.movement'), hub.period, {
                                headers: [tr('books:tb.account'), tr('reports:dash.accounts.opening'), tr('reports:dash.accounts.debit'), tr('reports:dash.accounts.credit'), tr('reports:dash.accounts.closingBalance')],
                                rows: (hub.accountMovement ?? []).map((r) => [r.name, major(r.opening), major(r.debit), major(r.credit), major(r.closing)]),
                              })
                            }
                          />
                          <Card padded={false}>
                            {(hub.accountMovement ?? []).map((r, i, arr) => (
                              <Pressable
                                key={r.account}
                                onPress={() => router.push(`/(app)/books/accounts/${encodeURIComponent(r.account)}` as never)}
                                accessibilityRole="button"
                                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.md, borderBottomWidth: i < arr.length - 1 ? 0.5 : 0, borderBottomColor: t.c.line, backgroundColor: pressed ? t.c.card2 : 'transparent' })}
                              >
                                <View style={{ flex: 1, gap: 2 }}>
                                  <Text variant="small" weight="500" numberOfLines={1}>{r.name}</Text>
                                  <Text variant="micro" tone="muted" numberOfLines={1}>
                                    {`${tr('reports:dash.accounts.debit')} ${formatMoney(r.debit)} · ${tr('reports:dash.accounts.credit')} ${formatMoney(r.credit)}`}
                                  </Text>
                                </View>
                                <Text variant="small" weight="600">{formatMoney(r.closing)}</Text>
                                <Icon name="chevron-right" size={16} color={t.c.muted} />
                              </Pressable>
                            ))}
                          </Card>
                        </>
                      ) : (
                        <Card style={{ marginTop: t.spacing.xl }}>
                          <Text variant="small" tone="muted">{tr('reports:dash.accounts.booksAllBranches')}</Text>
                        </Card>
                      )}
                    </>
                  }
                />
              </>
            );
          }}
        </HubState>
      </Screen>
    </>
  );
}
