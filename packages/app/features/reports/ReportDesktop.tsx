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
  const { t: tr } = useTranslation(['domain', 'reports']);
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
      { key: 'number', header: 'Number', flex: 1.2, render: (r) => <Cell weight="600">{r.number}</Cell>, sortValue: (r) => r.number },
      { key: 'date', header: 'Date', flex: 1, render: (r) => <Cell tone="muted">{formatDate(r.date)}</Cell>, sortValue: (r) => r.date },
      { key: 'party', header: isSales ? 'Customer' : 'Supplier', flex: 2, render: (r) => <Cell>{partyName(r.partyId)}</Cell>, sortValue: (r) => partyName(r.partyId) },
      { key: 'taxable', header: 'Taxable', flex: 1.2, align: 'right', secondary: true, render: (r) => <Cell mono>{money(r.totals.taxableAmount)}</Cell>, sortValue: (r) => sortMoney(r.totals.taxableAmount) },
      { key: 'tax', header: 'Tax', flex: 1, align: 'right', secondary: true, render: (r) => <Cell mono tone="muted">{money(r.totals.totalTax)}</Cell>, sortValue: (r) => sortMoney(r.totals.totalTax) },
      { key: 'total', header: 'Total', flex: 1.2, align: 'right', render: (r) => <Cell mono weight="600">{money(r.totals.grandTotal)}</Cell>, sortValue: (r) => sortMoney(r.totals.grandTotal) },
    ];
    return (
      <>
        <Kpis>
          <StatTile label={isSales ? 'Total invoiced' : 'Total purchased'} value={d.total} icon={isSales ? 'trending-up' : 'cart-outline'} caption={`${d.count} documents · avg ${money(avg)}`} />
          <StatTile label="Taxable value" value={d.taxable} icon="calculator-variant-outline" caption={money(d.taxable)} />
          <StatTile label="Tax" value={d.tax} icon="percent-outline" caption={money(d.tax)} />
          <StatTile label={isSales ? 'Discounts given' : 'Discounts received'} value={d.discount} tone="good" icon="tag-outline" caption={money(d.discount)} />
        </Kpis>
        <ReportRow>
          <ReportSection title={tr('reports:detail.byMonth')}>
            <SectionCard>
              <BarChart data={monthBars(d.byMonth)} caption={isSales ? 'Invoiced value' : 'Purchase value'} />
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
          <ReportSection title={isSales ? 'Top customers' : 'Top suppliers'}>
            <SectionCard>
              <RankedBars rows={d.byParty.slice(0, 8).map((r) => ({ label: r.label, value: r.value, sublabel: `${r.count} documents` }))} colorFor={colorFor} />
            </SectionCard>
          </ReportSection>
          <ReportSection title={tr('reports:detail.topItems')}>
            <SectionCard>
              <RankedBars rows={d.byItem.slice(0, 8).map((r) => ({ label: r.label, value: r.value, sublabel: `${formatQty(r.count)} units` }))} colorFor={colorFor} />
            </SectionCard>
          </ReportSection>
        </ReportRow>
        <TableSection
          title={`${isSales ? 'Invoices' : 'Bills'} (${d.documents.length})`}
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
      { key: 'number', header: 'Number', flex: 1.2, render: (r) => <Cell weight="600">{r.number}</Cell>, sortValue: (r) => r.number },
      { key: 'date', header: 'Date', flex: 1, render: (r) => <Cell tone="muted">{formatDate(r.date)}</Cell>, sortValue: (r) => r.date },
      { key: 'category', header: 'Category', flex: 2, render: (r) => <Cell>{categoryName(r.categoryId)}</Cell>, sortValue: (r) => categoryName(r.categoryId) },
      { key: 'tax', header: 'Input tax', flex: 1, align: 'right', secondary: true, render: (r) => <Cell mono tone="muted">{money(r.taxAmount)}</Cell>, sortValue: (r) => sortMoney(r.taxAmount) },
      { key: 'amount', header: 'Amount', flex: 1.2, align: 'right', render: (r) => <Cell mono weight="600">{money(r.amount)}</Cell>, sortValue: (r) => sortMoney(r.amount) },
    ];
    return (
      <>
        <Kpis>
          <StatTile label={tr('reports:detail.totalSpent')} value={e.total} tone="warn" icon="receipt-text-outline" caption={money(e.total)} />
          <StatTile label="Entries" value={String(e.count)} icon="format-list-numbered" caption={`${e.byCategory.length} categories`} />
          <StatTile label="Input tax" value={e.tax} icon="percent-outline" caption={money(e.tax)} />
          <StatTile label="Largest category" value={top ? top.label : '—'} icon="chart-donut" caption={top ? money(top.value) : undefined} />
        </Kpis>
        <ReportRow>
          <ReportSection title={tr('reports:detail.byCategory')}>
            <SectionCard>
              <DonutChart slices={e.byCategory.map((c) => ({ label: c.label, value: c.value }))} centerLabel="Total" />
            </SectionCard>
          </ReportSection>
          <ReportSection title={tr('reports:detail.byMonth')}>
            <SectionCard>
              <BarChart data={monthBars(e.byMonth)} caption={tr('reports:detail.expenseValue')} color={t.c.warn} />
            </SectionCard>
          </ReportSection>
        </ReportRow>
        <TableSection
          title={`Expenses (${e.expenses.length})`}
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
      { key: 'number', header: 'Document', flex: 1.2, render: (r) => <Cell weight="600">{r.document.number}</Cell>, sortValue: (r) => r.document.number },
      { key: 'party', header: isReceivable ? 'Customer' : 'Supplier', flex: 2, render: (r) => <Cell>{partyName(r.document.partyId)}</Cell>, sortValue: (r) => partyName(r.document.partyId) },
      { key: 'date', header: 'Date', flex: 1, secondary: true, render: (r) => <Cell tone="muted">{formatDate(r.document.date)}</Cell>, sortValue: (r) => r.document.date },
      { key: 'due', header: 'Due', flex: 1, render: (r) => <Cell tone="muted">{r.document.dueDate ? formatDate(r.document.dueDate) : '—'}</Cell>, sortValue: (r) => r.document.dueDate ?? '' },
      {
        key: 'days',
        header: 'Overdue',
        flex: 1,
        align: 'right',
        render: (r) => <Cell tone={r.daysOverdue > 60 ? 'bad' : r.daysOverdue > 0 ? 'warn' : 'muted'}>{r.daysOverdue > 0 ? `${r.daysOverdue} days` : 'Not due'}</Cell>,
        sortValue: (r) => r.daysOverdue,
      },
      { key: 'outstanding', header: 'Outstanding', flex: 1.3, align: 'right', render: (r) => <Cell mono weight="600">{money(r.outstanding)}</Cell>, sortValue: (r) => sortMoney(r.outstanding) },
    ];
    return (
      <>
        <Kpis>
          <StatTile label={isReceivable ? 'Total receivable' : 'Total payable'} value={a.summary.total} icon={isReceivable ? 'clock-alert-outline' : 'file-clock-outline'} caption={money(a.summary.total)} />
          <StatTile label="Overdue" value={a.summary.overdue} tone={a.summary.overdue.minor > 0 ? 'bad' : 'good'} icon="alert-circle-outline" caption={`${overdueCount} documents late`} />
          <StatTile label="Open documents" value={String(a.outstanding.length)} icon="file-document-multiple-outline" caption={`${a.outstanding.length - overdueCount} not yet due`} />
        </Kpis>
        <ReportSection title={tr('reports:detail.aging')}>
          <Card>
            <AgingBars buckets={a.summary.buckets.map((b) => ({ key: b.key, label: b.label, amount: b.amount, count: b.count }))} />
          </Card>
        </ReportSection>
        <TableSection
          title={`Open documents (${a.outstanding.length})`}
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
      { key: 'name', header: 'Item', flex: 2.2, render: (r) => <Cell weight="600">{r.item.name}</Cell>, sortValue: (r) => r.item.name },
      { key: 'sku', header: 'SKU', flex: 1.2, secondary: true, render: (r) => <Cell tone="muted">{r.item.sku}</Cell>, sortValue: (r) => r.item.sku ?? '' },
      {
        key: 'onHand',
        header: 'On hand',
        flex: 1,
        align: 'right',
        render: (r) => <Cell mono tone={r.onHand <= 0 ? 'bad' : r.low ? 'warn' : 'default'}>{`${formatQty(r.onHand)} ${r.item.unit}`}</Cell>,
        sortValue: (r) => r.onHand,
      },
      { key: 'reorder', header: 'Reorder at', flex: 1, align: 'right', secondary: true, render: (r) => <Cell mono tone="muted">{r.item.reorderLevel ? formatQty(r.item.reorderLevel) : '—'}</Cell>, sortValue: (r) => r.item.reorderLevel ?? 0 },
      { key: 'value', header: 'Value', flex: 1.3, align: 'right', render: (r) => <Cell mono weight="600">{money(r.value)}</Cell>, sortValue: (r) => sortMoney(r.value) },
    ];
    return (
      <>
        <Kpis>
          <StatTile label={tr('reports:detail.stockValue')} value={s.totalValue} icon="warehouse" caption={money(s.totalValue)} />
          <StatTile label="Tracked items" value={String(s.trackedCount)} icon="package-variant-closed" />
          <StatTile label="Low stock" value={String(s.lowCount)} tone={s.lowCount > 0 ? 'warn' : 'default'} icon="alert-outline" caption="At or below reorder level" />
          <StatTile label="Out of stock" value={String(s.outCount)} tone={s.outCount > 0 ? 'bad' : 'default'} icon="package-variant-remove" caption="Nothing on hand" />
        </Kpis>
        <ReportSection title={tr('reports:detail.mostValuable')}>
          <Card>
            <RankedBars
              rows={s.rows.slice(0, 8).map((r) => ({ label: r.item.name, value: r.value, sublabel: `${formatQty(r.onHand)} ${r.item.unit} on hand` }))}
              colorFor={colorFor}
            />
          </Card>
        </ReportSection>
        <TableSection
          title={`${tr('reports:detail.allTracked')} (${s.rows.length})`}
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
      { key: 'rate', header: 'Rate', flex: 0.8, render: (r) => <Cell weight="600">{formatPercent(r.rate)}</Cell> },
      { key: 'taxable', header: 'Taxable', flex: 1.4, align: 'right', render: (r) => <Cell mono>{money(r.taxable)}</Cell> },
      { key: 'cgst', header: 'CGST', flex: 1, align: 'right', render: (r) => <Cell mono>{money(r.cgst)}</Cell> },
      { key: 'sgst', header: 'SGST', flex: 1, align: 'right', render: (r) => <Cell mono>{money(r.sgst)}</Cell> },
      { key: 'igst', header: 'IGST', flex: 1, align: 'right', render: (r) => <Cell mono>{money(r.igst)}</Cell> },
      { key: 'total', header: 'Total tax', flex: 1.2, align: 'right', render: (r) => <Cell mono weight="600">{money(r.total)}</Cell> },
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
          <StatTile label="Output tax on sales" value={x.outwardTotal} icon="arrow-top-right" caption={money(x.outwardTotal)} />
          <StatTile label="Input tax credit" value={x.inwardTotal} tone="good" icon="arrow-bottom-left" caption={money(x.inwardTotal)} />
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
      { key: 'number', header: 'Number', flex: 1.2, render: (r) => <Cell weight="600">{r.number}</Cell>, sortValue: (r) => r.number },
      { key: 'date', header: 'Date', flex: 1, render: (r) => <Cell tone="muted">{formatDate(r.date)}</Cell>, sortValue: (r) => r.date },
      { key: 'party', header: 'Contact', flex: 2, render: (r) => <Cell>{partyName(r.partyId)}</Cell>, sortValue: (r) => partyName(r.partyId) },
      { key: 'method', header: 'Method', flex: 1.2, secondary: true, render: (r) => <Cell tone="muted">{paymentMethodLabel(tr, r.method)}</Cell>, sortValue: (r) => r.method },
      {
        key: 'amount',
        header: 'Amount',
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
          <StatTile label="Money in" value={p.received} tone="good" icon="arrow-bottom-left" caption={money(p.received)} />
          <StatTile label="Money out" value={p.paid} icon="arrow-top-right" caption={money(p.paid)} />
          <StatTile label="Payments" value={String(p.payments.length)} icon="format-list-numbered" caption={`${p.byAccount.length} accounts`} />
        </Kpis>
        <ReportRow>
          <ReportSection title={tr('reports:detail.byMonth')}>
            <SectionCard>
              <BarChart data={p.byMonth.map((m) => ({ label: monthLabelNarrow(m.key), value: m.received }))} caption={tr('reports:detail.moneyReceived')} color={t.c.good} />
            </SectionCard>
          </ReportSection>
          <ReportSection title={tr('reports:detail.byMethod')}>
            <SectionCard>
              <DonutChart slices={p.byMethod.map((m) => ({ label: m.label, value: m.value }))} centerLabel="All payments" />
            </SectionCard>
          </ReportSection>
        </ReportRow>
        <ReportSection title={tr('reports:detail.byAccount')}>
          <Card>
            <RankedBars rows={p.byAccount} colorFor={colorFor} />
          </Card>
        </ReportSection>
        <TableSection
          title={`Payments (${p.payments.length})`}
          columns={columns}
          rows={p.payments}
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
      { key: 'month', header: 'Month', flex: 1.2, render: (r) => <Cell weight="600">{monthLabel(r.key)}</Cell>, sortValue: (r) => r.key },
      { key: 'revenue', header: 'Revenue', flex: 1.2, align: 'right', render: (r) => <Cell mono>{money(r.revenue)}</Cell>, sortValue: (r) => sortMoney(r.revenue) },
      { key: 'cost', header: 'Cost of goods', flex: 1.2, align: 'right', render: (r) => <Cell mono tone="muted">{money(r.cost)}</Cell>, sortValue: (r) => sortMoney(r.cost) },
      { key: 'expenses', header: 'Expenses', flex: 1.2, align: 'right', render: (r) => <Cell mono tone="muted">{money(r.expenses)}</Cell>, sortValue: (r) => sortMoney(r.expenses) },
      {
        key: 'profit',
        header: 'Profit',
        flex: 1.2,
        align: 'right',
        render: (r) => <Cell mono weight="600" tone={r.profit.minor >= 0 ? 'good' : 'bad'}>{money(r.profit)}</Cell>,
        sortValue: (r) => sortMoney(r.profit),
      },
    ];
    return (
      <>
        <Kpis>
          <StatTile label="Revenue" value={pr.revenue} icon="trending-up" caption="Taxable value" />
          <StatTile label="Gross profit" value={pr.grossProfit} tone="good" icon="chart-areaspline" caption={`After ${formatMoney(pr.costOfGoods)} cost of goods`} />
          <StatTile label="Operating expenses" value={pr.expenses} tone="warn" icon="receipt-text-outline" caption={money(pr.expenses)} />
          <StatTile label={tr('reports:detail.netProfit')} value={pr.netProfit} tone={pr.netProfit.minor >= 0 ? 'good' : 'bad'} icon="chart-line" caption={`${formatPercent(pr.margin)} of revenue`} />
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
                { label: 'Revenue (taxable value)', value: money(pr.revenue) },
                { label: 'Cost of goods sold', value: `− ${money(pr.costOfGoods)}` },
                { label: 'Gross profit', value: money(pr.grossProfit), tone: 'good' },
                { label: 'Operating expenses', value: `− ${money(pr.expenses)}`, tone: 'warn' },
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
              Nothing in this period.
            </Text>
          </View>
        }
      />
    </ReportSection>
  );
}
