import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { StatTile } from '@esmart/ui/components/StatTile';
import { Cell, Column, DataTable, TABLE_PAGE_SIZE } from '@esmart/ui/components/DataTable';
import { BarChart, RankedBars } from '@esmart/ui/components/charts/BarChart';
import { DonutChart } from '@esmart/ui/components/charts/DonutChart';
import { AgingBars } from '@esmart/ui/components/charts/AgingBars';
import { seriesColor } from '@esmart/ui/theme/chartColors';
import type {
  AdvanceSummary,
  ExpenseSummary,
  PaymentSummary,
  ProfitSnapshot,
  StockReport,
  TaxSummary,
  TaxSummaryRow,
  TransactionSummary,
} from '@esmart/core/domain/reports';
import type { OutstandingDoc } from '@esmart/core/domain/receivables';
import type { Branch, ExpenseCategory, Party } from '@esmart/core/types';
import { paymentMethodLabel } from '@esmart/core/labels';
import { formatDate, monthLabel, monthLabelNarrow } from '@esmart/core/lib/date';
import { formatMoney, formatPercent, formatQty } from '@esmart/core/lib/format';
import { Money } from '@esmart/core/lib/money';
import { detailRouteFor } from '../documents/DocumentEditor';
import { useReceivables } from '../../store/selectors';
import { KeyFigures, ReportRow, ReportSection, SectionCard } from './reportParts';

type Aging = ReturnType<typeof useReceivables>;

export type ReportData = {
  sales: TransactionSummary;
  purchases: TransactionSummary;
  expenseSummary: ExpenseSummary;
  receivables: Aging;
  payables: Aging;
  stock: StockReport;
  tax: TaxSummary;
  paymentSummary: PaymentSummary;
  advances: AdvanceSummary;
  profit: ProfitSnapshot;
  parties: Party[];
  branches: Branch[];
  expenseCategories: ExpenseCategory[];
};

/**
 * A report laid out for a desktop browser: the headline figures in a row
 * across the top, charts and short lists side by side, and anything that
 * grows with the books (documents, items, payments) in one full-width table
 * that sorts and pages, so a long list never leaves half the page empty.
 * The phone keeps its own single column; this never renders there.
 */
export function ReportDesktop({ report, data }: { report: string; data: ReportData }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain', 'reports', 'common']);
  const router = useRouter();
  const partyName = (id?: string | null) => data.parties.find((p) => p.id === id)?.name ?? '';
  const colorFor = (i: number) => seriesColor(t.scheme, i);
  const monthBars = (rows: { key: string; value: Money }[]) => rows.map((r) => ({ label: monthLabelNarrow(r.key), value: r.value }));
  const money = (m: Money) => formatMoney(m);
  const sortMoney = (m: Money) => m.minor;

  if (report === 'sales-summary' || report === 'purchase-summary') {
    const isSales = report === 'sales-summary';
    const d = isSales ? data.sales : data.purchases;
    const avg: Money = { minor: d.count ? Math.round(d.total.minor / d.count) : 0, currency: d.total.currency };
    const columns: Column<TransactionSummary['documents'][number]>[] = [
      { key: 'number', header: tr('common:table.number'), flex: 1.2, render: (r) => <Cell weight="600">{r.number}</Cell>, sortValue: (r) => r.number },
      { key: 'date', header: tr('common:table.date'), flex: 1, render: (r) => <Cell tone="muted">{formatDate(r.date)}</Cell>, sortValue: (r) => r.date },
      { key: 'party', header: isSales ? tr('common:table.customer') : tr('common:table.supplier'), flex: 2, render: (r) => <Cell>{partyName(r.partyId)}</Cell>, sortValue: (r) => partyName(r.partyId) },
      { key: 'taxable', header: tr('reports:column.taxable'), flex: 1.2, align: 'right', secondary: true, render: (r) => <Cell mono>{money(r.totals.taxableAmount)}</Cell>, sortValue: (r) => sortMoney(r.totals.taxableAmount) },
      { key: 'tax', header: tr('common:table.tax'), flex: 1, align: 'right', secondary: true, render: (r) => <Cell mono tone="muted">{money(r.totals.totalTax)}</Cell>, sortValue: (r) => sortMoney(r.totals.totalTax) },
      { key: 'total', header: tr('common:table.total'), flex: 1.2, align: 'right', render: (r) => <Cell mono weight="600">{money(r.totals.grandTotal)}</Cell>, sortValue: (r) => sortMoney(r.totals.grandTotal) },
    ];
    return (
      <>
        <Kpis>
          <StatTile label={isSales ? tr('reports:figure.totalInvoiced') : tr('reports:figure.totalPurchased')} value={d.total} icon={isSales ? 'trending-up' : 'cart-outline'} caption={tr('reports:caption.documentsAvg', { count: d.count, amount: money(avg) })} />
          <StatTile label={tr('common:totals.taxableValue')} value={d.taxable} icon="calculator-variant-outline" caption={money(d.taxable)} />
          <StatTile label={tr('common:table.tax')} value={d.tax} icon="percent-outline" caption={money(d.tax)} />
          <StatTile label={isSales ? tr('reports:figure.discountsGiven') : tr('reports:figure.discountsReceived')} value={d.discount} tone="good" icon="tag-outline" caption={money(d.discount)} />
        </Kpis>
        <ReportRow>
          <ReportSection title={tr('reports:detail.byMonth')}>
            <SectionCard>
              <BarChart data={monthBars(d.byMonth)} caption={isSales ? tr('reports:figure.invoicedValue') : tr('reports:figure.purchaseValue')} />
            </SectionCard>
          </ReportSection>
          {data.branches.length > 1 ? (
            <ReportSection title={tr('reports:detail.byBranch')}>
              <SectionCard>
                <RankedBars rows={d.byBranch} colorFor={colorFor} />
              </SectionCard>
            </ReportSection>
          ) : null}
        </ReportRow>
        <ReportRow>
          <ReportSection title={isSales ? tr('reports:detail.topCustomers') : tr('reports:detail.topSuppliers')}>
            <SectionCard>
              <RankedBars rows={d.byParty.slice(0, 8).map((r) => ({ label: r.label, value: r.value, sublabel: tr('reports:caption.documents', { count: r.count }) }))} colorFor={colorFor} />
            </SectionCard>
          </ReportSection>
          <ReportSection title={tr('reports:detail.topItems')}>
            <SectionCard>
              <RankedBars rows={d.byItem.slice(0, 8).map((r) => ({ label: r.label, value: r.value, sublabel: tr('reports:caption.units', { qty: formatQty(r.count) }) }))} colorFor={colorFor} />
            </SectionCard>
          </ReportSection>
        </ReportRow>
        <TableSection
          title={tr('reports:detail.withCount', { title: isSales ? tr('reports:detail.invoices') : tr('reports:detail.bills'), count: d.documents.length })}
          columns={columns}
          rows={d.documents}
          rowKey={(r) => r.id}
          onRowPress={(r) => router.push(detailRouteFor(r.kind, r.id) as never)}
          initialSort={{ key: 'date', dir: 'desc' }}
        />
      </>
    );
  }

  if (report === 'expense-summary') {
    const e = data.expenseSummary;
    const top = e.byCategory[0];
    const categoryName = (id?: string | null) => data.expenseCategories.find((c) => c.id === id)?.name ?? '';
    const columns: Column<ExpenseSummary['expenses'][number]>[] = [
      { key: 'number', header: tr('common:table.number'), flex: 1.2, render: (r) => <Cell weight="600">{r.number}</Cell>, sortValue: (r) => r.number },
      { key: 'date', header: tr('common:table.date'), flex: 1, render: (r) => <Cell tone="muted">{formatDate(r.date)}</Cell>, sortValue: (r) => r.date },
      { key: 'category', header: tr('common:table.category'), flex: 2, render: (r) => <Cell>{categoryName(r.categoryId)}</Cell>, sortValue: (r) => categoryName(r.categoryId) },
      { key: 'tax', header: tr('reports:figure.inputTax'), flex: 1, align: 'right', secondary: true, render: (r) => <Cell mono tone="muted">{money(r.taxAmount)}</Cell>, sortValue: (r) => sortMoney(r.taxAmount) },
      { key: 'amount', header: tr('common:table.amount'), flex: 1.2, align: 'right', render: (r) => <Cell mono weight="600">{money(r.amount)}</Cell>, sortValue: (r) => sortMoney(r.amount) },
    ];
    return (
      <>
        <Kpis>
          <StatTile label={tr('reports:detail.totalSpent')} value={e.total} tone="warn" icon="receipt-text-outline" caption={money(e.total)} />
          <StatTile label={tr('reports:figure.entries')} value={String(e.count)} icon="format-list-numbered" caption={tr('reports:caption.categories', { count: e.byCategory.length })} />
          <StatTile label={tr('reports:figure.inputTax')} value={e.tax} icon="percent-outline" caption={money(e.tax)} />
          <StatTile label={tr('reports:figure.largestCategory')} value={top ? top.label : '—'} icon="chart-donut" caption={top ? money(top.value) : undefined} />
        </Kpis>
        <ReportRow>
          <ReportSection title={tr('reports:detail.byCategory')}>
            <SectionCard>
              <DonutChart slices={e.byCategory.map((c) => ({ label: c.label, value: c.value }))} centerLabel={tr('common:table.total')} />
            </SectionCard>
          </ReportSection>
          <ReportSection title={tr('reports:detail.byMonth')}>
            <SectionCard>
              <BarChart data={monthBars(e.byMonth)} caption={tr('reports:detail.expenseValue')} color={t.c.warn} />
            </SectionCard>
          </ReportSection>
        </ReportRow>
        <TableSection
          title={tr('reports:detail.withCount', { title: tr('reports:detail.expenses'), count: e.expenses.length })}
          columns={columns}
          rows={e.expenses}
          rowKey={(r) => r.id}
          onRowPress={(r) => router.push(`/(app)/expenses/${r.id}`)}
          initialSort={{ key: 'date', dir: 'desc' }}
        />
      </>
    );
  }

  if (report === 'receivables' || report === 'payables') {
    const isReceivable = report === 'receivables';
    const a = isReceivable ? data.receivables : data.payables;
    const overdueCount = a.outstanding.filter((o) => o.daysOverdue > 0).length;
    const columns: Column<OutstandingDoc>[] = [
      { key: 'number', header: tr('reports:column.document'), flex: 1.2, render: (r) => <Cell weight="600">{r.document.number}</Cell>, sortValue: (r) => r.document.number },
      { key: 'party', header: isReceivable ? tr('common:table.customer') : tr('common:table.supplier'), flex: 2, render: (r) => <Cell>{partyName(r.document.partyId)}</Cell>, sortValue: (r) => partyName(r.document.partyId) },
      { key: 'date', header: tr('common:table.date'), flex: 1, secondary: true, render: (r) => <Cell tone="muted">{formatDate(r.document.date)}</Cell>, sortValue: (r) => r.document.date },
      { key: 'due', header: tr('common:table.due'), flex: 1, render: (r) => <Cell tone="muted">{r.document.dueDate ? formatDate(r.document.dueDate) : '—'}</Cell>, sortValue: (r) => r.document.dueDate ?? '' },
      {
        key: 'days',
        header: tr('reports:column.overdue'),
        flex: 1,
        align: 'right',
        render: (r) => <Cell tone={r.daysOverdue > 60 ? 'bad' : r.daysOverdue > 0 ? 'warn' : 'muted'}>{r.daysOverdue > 0 ? tr('reports:cell.days', { count: r.daysOverdue }) : tr('reports:cell.notDue')}</Cell>,
        sortValue: (r) => r.daysOverdue,
      },
      { key: 'outstanding', header: tr('reports:column.outstanding'), flex: 1.3, align: 'right', render: (r) => <Cell mono weight="600">{money(r.outstanding)}</Cell>, sortValue: (r) => sortMoney(r.outstanding) },
    ];
    return (
      <>
        <Kpis>
          <StatTile label={isReceivable ? tr('reports:home.totalReceivable') : tr('reports:home.totalPayable')} value={a.summary.total} icon={isReceivable ? 'clock-alert-outline' : 'file-clock-outline'} caption={money(a.summary.total)} />
          <StatTile label={tr('reports:figure.overdue')} value={a.summary.overdue} tone={a.summary.overdue.minor > 0 ? 'bad' : 'good'} icon="alert-circle-outline" caption={tr('reports:caption.documentsLate', { count: overdueCount })} />
          <StatTile label={tr('reports:figure.openDocuments')} value={String(a.outstanding.length)} icon="file-document-multiple-outline" caption={tr('reports:caption.notYetDue', { count: a.outstanding.length - overdueCount })} />
        </Kpis>
        <ReportSection title={tr('reports:detail.aging')}>
          <Card>
            <AgingBars buckets={a.summary.buckets.map((b) => ({ key: b.key, label: b.label, amount: b.amount, count: b.count }))} />
          </Card>
        </ReportSection>
        <TableSection
          title={tr('reports:detail.withCount', { title: tr('reports:figure.openDocuments'), count: a.outstanding.length })}
          columns={columns}
          rows={a.outstanding}
          rowKey={(r) => r.document.id}
          onRowPress={(r) => router.push(detailRouteFor(r.document.kind, r.document.id) as never)}
          initialSort={{ key: 'days', dir: 'desc' }}
        />
      </>
    );
  }

  if (report === 'stock') {
    const s = data.stock;
    const columns: Column<StockReport['rows'][number]>[] = [
      { key: 'name', header: tr('reports:column.item'), flex: 2.2, render: (r) => <Cell weight="600">{r.item.name}</Cell>, sortValue: (r) => r.item.name },
      { key: 'sku', header: tr('common:table.sku'), flex: 1.2, secondary: true, render: (r) => <Cell tone="muted">{r.item.sku}</Cell>, sortValue: (r) => r.item.sku ?? '' },
      {
        key: 'onHand',
        header: tr('common:table.onHand'),
        flex: 1,
        align: 'right',
        render: (r) => <Cell mono tone={r.onHand <= 0 ? 'bad' : r.low ? 'warn' : 'default'}>{`${formatQty(r.onHand)} ${r.item.unit}`}</Cell>,
        sortValue: (r) => r.onHand,
      },
      { key: 'reorder', header: tr('reports:column.reorderAt'), flex: 1, align: 'right', secondary: true, render: (r) => <Cell mono tone="muted">{r.item.reorderLevel ? formatQty(r.item.reorderLevel) : '—'}</Cell>, sortValue: (r) => r.item.reorderLevel ?? 0 },
      { key: 'value', header: tr('reports:column.value'), flex: 1.3, align: 'right', render: (r) => <Cell mono weight="600">{money(r.value)}</Cell>, sortValue: (r) => sortMoney(r.value) },
    ];
    return (
      <>
        <Kpis>
          <StatTile label={tr('reports:detail.stockValue')} value={s.totalValue} icon="warehouse" caption={money(s.totalValue)} />
          <StatTile label={tr('reports:figure.trackedItems')} value={String(s.trackedCount)} icon="package-variant-closed" />
          <StatTile label={tr('reports:figure.lowStock')} value={String(s.lowCount)} tone={s.lowCount > 0 ? 'warn' : 'default'} icon="alert-outline" caption={tr('reports:caption.atOrBelowReorder')} />
          <StatTile label={tr('reports:figure.outOfStock')} value={String(s.outCount)} tone={s.outCount > 0 ? 'bad' : 'default'} icon="package-variant-remove" caption={tr('reports:caption.nothingOnHand')} />
        </Kpis>
        <ReportSection title={tr('reports:detail.mostValuable')}>
          <Card>
            <RankedBars
              rows={s.rows.slice(0, 8).map((r) => ({ label: r.item.name, value: r.value, sublabel: tr('reports:caption.onHand', { qty: formatQty(r.onHand), unit: r.item.unit }) }))}
              colorFor={colorFor}
            />
          </Card>
        </ReportSection>
        <TableSection
          title={tr('reports:detail.withCount', { title: tr('reports:detail.allTracked'), count: s.rows.length })}
          columns={columns}
          rows={s.rows}
          rowKey={(r) => r.item.id}
          onRowPress={(r) => router.push(`/(app)/catalog/items/${r.item.id}`)}
          initialSort={{ key: 'value', dir: 'desc' }}
        />
      </>
    );
  }

  if (report === 'tax-summary') {
    const x = data.tax;
    const taxColumns: Column<TaxSummaryRow>[] = [
      { key: 'rate', header: tr('reports:column.rate'), flex: 0.8, render: (r) => <Cell weight="600">{formatPercent(r.rate)}</Cell> },
      { key: 'taxable', header: tr('reports:column.taxable'), flex: 1.4, align: 'right', render: (r) => <Cell mono>{money(r.taxable)}</Cell> },
      { key: 'cgst', header: 'CGST', flex: 1, align: 'right', render: (r) => <Cell mono>{money(r.cgst)}</Cell> },
      { key: 'sgst', header: 'SGST', flex: 1, align: 'right', render: (r) => <Cell mono>{money(r.sgst)}</Cell> },
      { key: 'igst', header: 'IGST', flex: 1, align: 'right', render: (r) => <Cell mono>{money(r.igst)}</Cell> },
      { key: 'total', header: tr('reports:column.totalTax'), flex: 1.2, align: 'right', render: (r) => <Cell mono weight="600">{money(r.total)}</Cell> },
    ];
    const empty = (message: string) => (
      <View style={{ padding: t.spacing.lg }}>
        <Text variant="small" tone="muted">{message}</Text>
      </View>
    );
    return (
      <>
        <Kpis>
          <StatTile label={tr('reports:detail.netTaxPayable')} value={x.netPayable} tone={x.netPayable.minor > 0 ? 'bad' : 'good'} icon="bank-outline" caption={money(x.netPayable)} />
          <StatTile label={tr('reports:figure.outputTaxOnSales')} value={x.outwardTotal} icon="arrow-top-right" caption={money(x.outwardTotal)} />
          <StatTile label={tr('reports:figure.inputTaxCredit')} value={x.inwardTotal} tone="good" icon="arrow-bottom-left" caption={money(x.inwardTotal)} />
        </Kpis>
        <ReportSection title={tr('reports:detail.outwardSupplies')}>
          <DataTable scroll={false} columns={taxColumns} rows={x.outward} rowKey={(r) => `out-${r.rate}`} empty={empty(tr('reports:detail.noTaxableSales'))} />
        </ReportSection>
        <ReportSection title={tr('reports:detail.inwardSupplies')}>
          <DataTable scroll={false} columns={taxColumns} rows={x.inward} rowKey={(r) => `in-${r.rate}`} empty={empty(tr('reports:detail.noTaxablePurchases'))} />
        </ReportSection>
      </>
    );
  }

  if (report === 'payments') {
    const p = data.paymentSummary;
    const columns: Column<PaymentSummary['payments'][number]>[] = [
      { key: 'number', header: tr('common:table.number'), flex: 1.2, render: (r) => <Cell weight="600">{r.number}</Cell>, sortValue: (r) => r.number },
      { key: 'date', header: tr('common:table.date'), flex: 1, render: (r) => <Cell tone="muted">{formatDate(r.date)}</Cell>, sortValue: (r) => r.date },
      { key: 'party', header: tr('reports:shell.contact'), flex: 2, render: (r) => <Cell>{partyName(r.partyId)}</Cell>, sortValue: (r) => partyName(r.partyId) },
      { key: 'method', header: tr('common:table.method'), flex: 1.2, secondary: true, render: (r) => <Cell tone="muted">{paymentMethodLabel(tr, r.method)}</Cell>, sortValue: (r) => r.method },
      {
        key: 'amount',
        header: tr('common:table.amount'),
        flex: 1.3,
        align: 'right',
        render: (r) => <Cell mono weight="600" tone={r.direction === 'received' ? 'good' : 'default'}>{`${r.direction === 'received' ? '+' : '−'} ${money(r.amount)}`}</Cell>,
        sortValue: (r) => (r.direction === 'received' ? 1 : -1) * r.amount.minor,
      },
    ];
    return (
      <>
        <Kpis>
          <StatTile label={tr('reports:detail.netCash')} value={p.net} tone={p.net.minor >= 0 ? 'good' : 'bad'} icon="cash-sync" caption={money(p.net)} />
          <StatTile label={tr('reports:figure.moneyIn')} value={p.received} tone="good" icon="arrow-bottom-left" caption={money(p.received)} />
          <StatTile label={tr('reports:figure.moneyOut')} value={p.paid} icon="arrow-top-right" caption={money(p.paid)} />
          <StatTile label={tr('reports:figure.payments')} value={String(p.payments.length)} icon="format-list-numbered" caption={tr('reports:caption.accounts', { count: p.byAccount.length })} />
        </Kpis>
        <ReportRow>
          <ReportSection title={tr('reports:detail.byMonth')}>
            <SectionCard>
              <BarChart data={p.byMonth.map((m) => ({ label: monthLabelNarrow(m.key), value: m.received }))} caption={tr('reports:detail.moneyReceived')} color={t.c.good} />
            </SectionCard>
          </ReportSection>
          <ReportSection title={tr('reports:detail.byMethod')}>
            <SectionCard>
              <DonutChart slices={p.byMethod.map((m) => ({ label: m.label, value: m.value }))} centerLabel={tr('reports:figure.allPayments')} />
            </SectionCard>
          </ReportSection>
        </ReportRow>
        <ReportSection title={tr('reports:detail.byAccount')}>
          <Card>
            <RankedBars rows={p.byAccount} colorFor={colorFor} />
          </Card>
        </ReportSection>
        <TableSection
          title={tr('reports:detail.withCount', { title: tr('reports:figure.payments'), count: p.payments.length })}
          columns={columns}
          rows={p.payments}
          rowKey={(r) => r.id}
          onRowPress={(r) => router.push(`/(app)/payments/${r.id}`)}
          initialSort={{ key: 'date', dir: 'desc' }}
        />
      </>
    );
  }

  if (report === 'advances') {
    const a = data.advances;
    const columns: Column<AdvanceSummary['rows'][number]>[] = [
      { key: 'number', header: tr('common:table.number'), flex: 1.2, render: (r) => <Cell weight="600">{r.number}</Cell>, sortValue: (r) => r.number },
      { key: 'date', header: tr('common:table.date'), flex: 1, render: (r) => <Cell tone="muted">{formatDate(r.date)}</Cell>, sortValue: (r) => r.date },
      { key: 'party', header: tr('reports:shell.contact'), flex: 2, render: (r) => <Cell>{partyName(r.partyId)}</Cell>, sortValue: (r) => partyName(r.partyId) },
      { key: 'direction', header: tr('reports:column.direction'), flex: 1, secondary: true, render: (r) => <Cell tone="muted">{tr(`domain:status.${r.direction}`)}</Cell>, sortValue: (r) => r.direction },
      { key: 'amount', header: tr('common:table.amount'), flex: 1.2, align: 'right', secondary: true, render: (r) => <Cell mono tone="muted">{money(r.amount)}</Cell>, sortValue: (r) => sortMoney(r.amount) },
      {
        key: 'unallocated',
        header: tr('reports:column.toAdjust'),
        flex: 1.3,
        align: 'right',
        render: (r) => <Cell mono weight="600" tone={r.direction === 'received' ? 'good' : 'default'}>{money(r.unallocated)}</Cell>,
        sortValue: (r) => sortMoney(r.unallocated),
      },
    ];
    return (
      <>
        <Kpis>
          <StatTile label={tr('reports:figure.advancesReceived')} value={a.received} tone="good" icon="arrow-bottom-left" caption={tr('reports:caption.advancesReceived')} />
          <StatTile label={tr('reports:figure.advancesPaid')} value={a.paid} tone="warn" icon="arrow-top-right" caption={tr('reports:caption.advancesPaid')} />
          <StatTile label={tr('reports:figure.payments')} value={String(a.rows.length)} icon="format-list-numbered" />
        </Kpis>
        <TableSection
          title={tr('reports:detail.withCount', { title: tr('reports:detail.openAdvances'), count: a.rows.length })}
          columns={columns}
          rows={a.rows}
          rowKey={(r) => r.id}
          onRowPress={(r) => router.push(`/(app)/payments/${r.id}`)}
          initialSort={{ key: 'date', dir: 'desc' }}
        />
      </>
    );
  }

  if (report === 'profit') {
    const pr = data.profit;
    const columns: Column<ProfitSnapshot['byMonth'][number]>[] = [
      { key: 'month', header: tr('reports:column.month'), flex: 1.2, render: (r) => <Cell weight="600">{monthLabel(r.key)}</Cell>, sortValue: (r) => r.key },
      { key: 'revenue', header: tr('reports:column.revenue'), flex: 1.2, align: 'right', render: (r) => <Cell mono>{money(r.revenue)}</Cell>, sortValue: (r) => sortMoney(r.revenue) },
      { key: 'cost', header: tr('reports:column.costOfGoods'), flex: 1.2, align: 'right', render: (r) => <Cell mono tone="muted">{money(r.cost)}</Cell>, sortValue: (r) => sortMoney(r.cost) },
      { key: 'expenses', header: tr('reports:column.expenses'), flex: 1.2, align: 'right', render: (r) => <Cell mono tone="muted">{money(r.expenses)}</Cell>, sortValue: (r) => sortMoney(r.expenses) },
      {
        key: 'profit',
        header: tr('reports:column.profit'),
        flex: 1.2,
        align: 'right',
        render: (r) => <Cell mono weight="600" tone={r.profit.minor >= 0 ? 'good' : 'bad'}>{money(r.profit)}</Cell>,
        sortValue: (r) => sortMoney(r.profit),
      },
    ];
    return (
      <>
        <Kpis>
          <StatTile label={tr('reports:figure.revenue')} value={pr.revenue} icon="trending-up" caption={tr('common:totals.taxableValue')} />
          <StatTile label={tr('reports:figure.grossProfit')} value={pr.grossProfit} tone="good" icon="chart-areaspline" caption={tr('reports:caption.afterCostOfGoods', { amount: formatMoney(pr.costOfGoods) })} />
          <StatTile label={tr('reports:figure.operatingExpenses')} value={pr.expenses} tone="warn" icon="receipt-text-outline" caption={money(pr.expenses)} />
          <StatTile label={tr('reports:detail.netProfit')} value={pr.netProfit} tone={pr.netProfit.minor >= 0 ? 'good' : 'bad'} icon="chart-line" caption={tr('reports:caption.ofRevenue', { percent: formatPercent(pr.margin) })} />
        </Kpis>
        <ReportRow>
          <ReportSection title={tr('reports:detail.byMonth')}>
            <SectionCard>
              <BarChart data={monthBars(pr.byMonth.map((m) => ({ key: m.key, value: m.profit })))} caption={tr('reports:detail.netProfit')} />
            </SectionCard>
          </ReportSection>
          <ReportSection title={tr('reports:detail.howItAddsUp')}>
            <KeyFigures
              rows={[
                { label: tr('reports:figure.revenueTaxable'), value: money(pr.revenue) },
                { label: tr('reports:figure.costOfGoodsSold'), value: `− ${money(pr.costOfGoods)}` },
                { label: tr('reports:figure.grossProfit'), value: money(pr.grossProfit), tone: 'good' },
                { label: tr('reports:figure.operatingExpenses'), value: `− ${money(pr.expenses)}`, tone: 'warn' },
                { label: tr('reports:detail.netProfit'), value: money(pr.netProfit), tone: pr.netProfit.minor >= 0 ? 'good' : 'bad' },
              ]}
            />
          </ReportSection>
        </ReportRow>
        <TableSection title={tr('reports:detail.monthlyDetail')} columns={columns} rows={pr.byMonth} rowKey={(r) => r.key} initialSort={{ key: 'month', dir: 'asc' }} />
      </>
    );
  }

  return null;
}

/** The headline figures, side by side across the top. */
function Kpis({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', gap: t.spacing.md }}>{children}</View>;
}

/** A full-width table that sorts by any column and pages through long lists. */
function TableSection<T>({
  title,
  columns,
  rows,
  rowKey,
  onRowPress,
  initialSort,
}: {
  title: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowPress?: (row: T) => void;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['reports']);
  return (
    <ReportSection title={title}>
      <DataTable
        scroll={false}
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        onRowPress={onRowPress}
        initialSort={initialSort}
        pageSize={TABLE_PAGE_SIZE}
        empty={
          <View style={{ padding: t.spacing.lg }}>
            <Text variant="small" tone="muted">
              {tr('reports:detail.empty')}
            </Text>
          </View>
        }
      />
    </ReportSection>
  );
}
