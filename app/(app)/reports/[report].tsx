import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { EmptyState } from '@/components/EmptyState';
import { BarChart, RankedBars } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { AgingBars } from '@/components/charts/AgingBars';
import { seriesColor } from '@/theme/chartColors';

import { ReportShell, toCsv, useReportScope } from '@/features/reports/ReportShell';
import { DataTable, HeroFigure, KeyFigures, ReportSection } from '@/features/reports/reportParts';

import {
  profitSnapshot,
  summarizeDocuments,
  summarizeExpenses,
  summarizePayments,
  summarizeStock,
  summarizeTax,
} from '@/domain/reports';
import { PAYMENT_METHODS } from '@/data/masters';
import { paymentMethodLabel } from '@/i18n/labels';
import { formatMoney, formatPercent, formatQty } from '@/lib/format';
import { monthLabel } from '@/lib/date';
import { toMajor } from '@/lib/money';

import {
  useBaseCurrency,
  useBranches,
  useDocuments,
  useExpenseCategories,
  useExpenses,
  useItems,
  useParties,
  usePayables,
  usePaymentAccounts,
  usePayments,
  useReceivables,
  useStockMovements,
} from '@/store/selectors';

const TITLES: Record<string, { title: string; subtitle?: string }> = {
  'sales-summary': { title: 'Sales summary' },
  'purchase-summary': { title: 'Purchase summary' },
  'expense-summary': { title: 'Expense summary' },
  receivables: { title: 'Receivables', subtitle: 'Outstanding = document total less allocated payments.' },
  payables: { title: 'Payables', subtitle: 'Outstanding = bill total less payments made.' },
  stock: { title: 'Stock report', subtitle: 'Quantity derived from every stock movement; value at weighted average cost.' },
  'tax-summary': { title: 'Tax summary', subtitle: 'Output tax on sales less input tax on purchases.' },
  payments: { title: 'Payments & cash' },
  profit: { title: 'Profit snapshot', subtitle: 'Revenue is taxable value, so tax collected is not counted as income.' },
};

export default function Report() {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain']);
  const { report } = useLocalSearchParams<{ report: string }>();
  const key = String(report);
  const meta = TITLES[key];

  const { scope, setScope } = useReportScope(key === 'profit' || key === 'tax-summary' ? 'thisFY' : 'last90');

  const baseCurrency = useBaseCurrency();
  const documents = useDocuments();
  const expenses = useExpenses();
  const expenseCategories = useExpenseCategories();
  const items = useItems();
  const movements = useStockMovements();
  const parties = useParties();
  const branches = useBranches();
  const payments = usePayments();
  const accounts = usePaymentAccounts();
  const receivables = useReceivables();
  const payables = usePayables();

  const branchNames = useMemo(
    () => Object.fromEntries(branches.map((b) => [b.id, b.name])),
    [branches],
  );
  const accountNames = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a.name])),
    [accounts],
  );

  const sales = useMemo(
    () => summarizeDocuments(documents.filter((d) => d.kind === 'invoice'), parties, items, branchNames, baseCurrency, scope.filters),
    [documents, parties, items, branchNames, baseCurrency, scope.filters],
  );
  const purchases = useMemo(
    () => summarizeDocuments(documents.filter((d) => d.kind === 'purchaseBill'), parties, items, branchNames, baseCurrency, scope.filters),
    [documents, parties, items, branchNames, baseCurrency, scope.filters],
  );
  const expenseSummary = useMemo(
    () => summarizeExpenses(expenses, expenseCategories, baseCurrency, scope.filters),
    [expenses, expenseCategories, baseCurrency, scope.filters],
  );
  const tax = useMemo(() => summarizeTax(documents, baseCurrency, scope.filters), [documents, baseCurrency, scope.filters]);
  // The reports engine takes method names as data, so it stays free of the
  // translator. Rebuilt when the language changes, or the chart keeps the old
  // one's labels.
  const methodLabels = useMemo(
    () => Object.fromEntries(PAYMENT_METHODS.map((m) => [m, paymentMethodLabel(tr, m)])),
    [tr],
  );
  const paymentSummary = useMemo(
    () => summarizePayments(payments, accountNames, methodLabels, baseCurrency, scope.filters),
    [payments, accountNames, methodLabels, baseCurrency, scope.filters],
  );
  const stock = useMemo(
    () => summarizeStock(items, movements, baseCurrency, scope.filters.branchId),
    [items, movements, baseCurrency, scope.filters.branchId],
  );
  const profit = useMemo(
    () => profitSnapshot(documents, expenses, items, baseCurrency, scope.filters),
    [documents, expenses, items, baseCurrency, scope.filters],
  );

  if (!meta) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: 'Report' }} />
        <EmptyState illustration="unknown-report" icon="chart-box-outline" title="Unknown report" message="Pick a report from the Reports tab." />
      </View>
    );
  }

  const monthBars = (rows: { key: string; value: { minor: number; currency: string } }[]) =>
    rows.map((r) => ({ label: monthLabel(r.key), value: r.value }));

  let body: React.ReactNode = null;
  let exportRows: (() => string) | undefined;

  if (key === 'sales-summary' || key === 'purchase-summary') {
    const data = key === 'sales-summary' ? sales : purchases;
    const isSales = key === 'sales-summary';
    body = (
      <>
        <HeroFigure
          label={isSales ? 'Total invoiced' : 'Total purchased'}
          value={data.total}
          caption={`${data.count} documents · avg ${formatMoney({ minor: data.count ? Math.round(data.total.minor / data.count) : 0, currency: baseCurrency })}`}
        />
        <ReportSection title="By month">
          <Card>
            <BarChart data={monthBars(data.byMonth)} caption={isSales ? 'Invoiced value' : 'Purchase value'} />
          </Card>
        </ReportSection>
        <ReportSection title="Breakdown">
          <KeyFigures
            rows={[
              { label: 'Taxable value', value: formatMoney(data.taxable) },
              { label: 'Tax', value: formatMoney(data.tax) },
              { label: 'Discounts given', value: formatMoney(data.discount), tone: 'good' },
              { label: 'Grand total', value: formatMoney(data.total) },
            ]}
          />
        </ReportSection>
        <ReportSection title={isSales ? 'Top customers' : 'Top suppliers'}>
          <Card>
            <RankedBars
              rows={data.byParty.slice(0, 8).map((r) => ({ label: r.label, value: r.value, sublabel: `${r.count} documents` }))}
              colorFor={(i) => seriesColor(t.scheme, i)}
            />
          </Card>
        </ReportSection>
        <ReportSection title="Top items">
          <Card>
            <RankedBars
              rows={data.byItem.slice(0, 8).map((r) => ({ label: r.label, value: r.value, sublabel: `${formatQty(r.count)} units` }))}
              colorFor={(i) => seriesColor(t.scheme, i)}
            />
          </Card>
        </ReportSection>
        {branches.length > 1 ? (
          <ReportSection title="By branch">
            <Card>
              <RankedBars rows={data.byBranch} colorFor={(i) => seriesColor(t.scheme, i)} />
            </Card>
          </ReportSection>
        ) : null}
      </>
    );
    exportRows = () =>
      toCsv(
        ['Number', 'Date', 'Contact', 'Taxable', 'Tax', 'Total'],
        data.documents.map((d) => [
          d.number,
          d.date,
          parties.find((p) => p.id === d.partyId)?.name ?? '',
          toMajor(d.totals.taxableAmount),
          toMajor(d.totals.totalTax),
          toMajor(d.totals.grandTotal),
        ]),
      );
  }

  if (key === 'expense-summary') {
    body = (
      <>
        <HeroFigure label="Total spent" value={expenseSummary.total} tone="warn" caption={`${expenseSummary.count} entries · input tax ${formatMoney(expenseSummary.tax)}`} />
        <ReportSection title="By category">
          <Card>
            <DonutChart slices={expenseSummary.byCategory.map((c) => ({ label: c.label, value: c.value }))} centerLabel="Total" />
          </Card>
        </ReportSection>
        <ReportSection title="By month">
          <Card>
            <BarChart data={monthBars(expenseSummary.byMonth)} caption="Expense value" color={t.c.warn} />
          </Card>
        </ReportSection>
        <ReportSection title="Detail">
          <DataTable
            headers={['Category', 'Entries', 'Amount']}
            rows={expenseSummary.byCategory.map((c) => [c.label, c.count, formatMoney(c.value)])}
            widths={[2, 1, 1.4]}
          />
        </ReportSection>
      </>
    );
    exportRows = () =>
      toCsv(
        ['Number', 'Date', 'Category', 'Amount', 'Tax'],
        expenseSummary.expenses.map((e) => [
          e.number,
          e.date,
          expenseCategories.find((c) => c.id === e.categoryId)?.name ?? '',
          toMajor(e.amount),
          toMajor(e.taxAmount),
        ]),
      );
  }

  if (key === 'receivables' || key === 'payables') {
    const data = key === 'receivables' ? receivables : payables;
    body = (
      <>
        <HeroFigure
          label={key === 'receivables' ? 'Total receivable' : 'Total payable'}
          value={data.summary.total}
          tone={data.summary.overdue.minor > 0 ? 'warn' : undefined}
          caption={`${data.outstanding.length} open · ${formatMoney(data.summary.overdue)} overdue`}
        />
        <ReportSection title="Aging">
          <Card>
            <AgingBars buckets={data.summary.buckets.map((b) => ({ key: b.key, label: b.label, amount: b.amount, count: b.count }))} />
          </Card>
        </ReportSection>
        <ReportSection title="Detail">
          <DataTable
            headers={['Document', 'Days', 'Outstanding']}
            rows={data.outstanding
              .slice()
              .sort((a, b) => b.daysOverdue - a.daysOverdue)
              .map((o) => [o.document.number, o.daysOverdue > 0 ? `${o.daysOverdue} late` : 'current', formatMoney(o.outstanding)])}
            widths={[1.6, 1, 1.3]}
          />
        </ReportSection>
      </>
    );
    exportRows = () =>
      toCsv(
        ['Document', 'Contact', 'Date', 'Due', 'Total', 'Paid', 'Outstanding', 'Days overdue'],
        data.outstanding.map((o) => [
          o.document.number,
          parties.find((p) => p.id === o.document.partyId)?.name ?? '',
          o.document.date,
          o.document.dueDate ?? '',
          toMajor(o.document.totals.grandTotal),
          toMajor(o.allocated),
          toMajor(o.outstanding),
          o.daysOverdue > 0 ? o.daysOverdue : 0,
        ]),
      );
  }

  if (key === 'stock') {
    body = (
      <>
        <HeroFigure label="Stock value" value={stock.totalValue} caption={`${stock.trackedCount} tracked items · ${stock.lowCount} low · ${stock.outCount} out`} />
        <ReportSection title="Most valuable">
          <Card>
            <RankedBars
              rows={stock.rows.slice(0, 8).map((r) => ({
                label: r.item.name,
                value: r.value,
                sublabel: `${formatQty(r.onHand)} ${r.item.unit} on hand`,
              }))}
              colorFor={(i) => seriesColor(t.scheme, i)}
            />
          </Card>
        </ReportSection>
        <ReportSection title="All tracked items">
          <DataTable
            headers={['Item', 'On hand', 'Value']}
            rows={stock.rows.map((r) => [r.item.name, `${formatQty(r.onHand)} ${r.item.unit}`, formatMoney(r.value)])}
            widths={[2, 1, 1.3]}
          />
        </ReportSection>
      </>
    );
    exportRows = () =>
      toCsv(
        ['SKU', 'Item', 'Unit', 'On hand', 'Reorder level', 'Value'],
        stock.rows.map((r) => [r.item.sku, r.item.name, r.item.unit, r.onHand, r.item.reorderLevel, toMajor(r.value)]),
      );
  }

  if (key === 'tax-summary') {
    body = (
      <>
        <HeroFigure
          label="Net tax payable"
          value={tax.netPayable}
          tone={tax.netPayable.minor > 0 ? 'bad' : 'good'}
          caption={`Output ${formatMoney(tax.outwardTotal)} less input ${formatMoney(tax.inwardTotal)}`}
        />
        <ReportSection title="Outward supplies (sales)">
          {tax.outward.length === 0 ? (
            <Card>
              <Text variant="small" tone="muted">
                No taxable sales in this period.
              </Text>
            </Card>
          ) : (
            <DataTable
              headers={['Rate', 'Taxable', 'CGST', 'SGST', 'IGST']}
              rows={tax.outward.map((r) => [
                formatPercent(r.rate),
                formatMoney(r.taxable, { symbol: false, noDecimals: true }),
                formatMoney(r.cgst, { symbol: false, noDecimals: true }),
                formatMoney(r.sgst, { symbol: false, noDecimals: true }),
                formatMoney(r.igst, { symbol: false, noDecimals: true }),
              ])}
              widths={[0.8, 1.4, 1, 1, 1]}
            />
          )}
        </ReportSection>
        <ReportSection title="Inward supplies (purchases)">
          {tax.inward.length === 0 ? (
            <Card>
              <Text variant="small" tone="muted">
                No taxable purchases in this period.
              </Text>
            </Card>
          ) : (
            <DataTable
              headers={['Rate', 'Taxable', 'CGST', 'SGST', 'IGST']}
              rows={tax.inward.map((r) => [
                formatPercent(r.rate),
                formatMoney(r.taxable, { symbol: false, noDecimals: true }),
                formatMoney(r.cgst, { symbol: false, noDecimals: true }),
                formatMoney(r.sgst, { symbol: false, noDecimals: true }),
                formatMoney(r.igst, { symbol: false, noDecimals: true }),
              ])}
              widths={[0.8, 1.4, 1, 1, 1]}
            />
          )}
        </ReportSection>
        <ReportSection title="Summary">
          <KeyFigures
            rows={[
              { label: 'Output tax on sales', value: formatMoney(tax.outwardTotal) },
              { label: 'Input tax credit', value: formatMoney(tax.inwardTotal), tone: 'good' },
              { label: 'Net payable', value: formatMoney(tax.netPayable), tone: tax.netPayable.minor > 0 ? 'bad' : 'good' },
            ]}
          />
        </ReportSection>
      </>
    );
    exportRows = () =>
      toCsv(
        ['Direction', 'Rate', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'],
        [
          ...tax.outward.map((r) => ['Outward', r.rate, toMajor(r.taxable), toMajor(r.cgst), toMajor(r.sgst), toMajor(r.igst), toMajor(r.total)]),
          ...tax.inward.map((r) => ['Inward', r.rate, toMajor(r.taxable), toMajor(r.cgst), toMajor(r.sgst), toMajor(r.igst), toMajor(r.total)]),
        ],
      );
  }

  if (key === 'payments') {
    body = (
      <>
        <HeroFigure
          label="Net cash movement"
          value={paymentSummary.net}
          tone={paymentSummary.net.minor >= 0 ? 'good' : 'bad'}
          caption={`In ${formatMoney(paymentSummary.received)} · out ${formatMoney(paymentSummary.paid)}`}
        />
        <ReportSection title="By month">
          <Card>
            <BarChart
              data={paymentSummary.byMonth.map((m) => ({ label: monthLabel(m.key), value: m.received }))}
              caption="Money received"
              color={t.c.good}
            />
          </Card>
        </ReportSection>
        <ReportSection title="By method">
          <Card>
            <DonutChart slices={paymentSummary.byMethod.map((m) => ({ label: m.label, value: m.value }))} centerLabel="All payments" />
          </Card>
        </ReportSection>
        <ReportSection title="By account">
          <Card>
            <RankedBars rows={paymentSummary.byAccount} colorFor={(i) => seriesColor(t.scheme, i)} />
          </Card>
        </ReportSection>
      </>
    );
    exportRows = () =>
      toCsv(
        ['Number', 'Date', 'Direction', 'Contact', 'Method', 'Amount'],
        paymentSummary.payments.map((p) => [
          p.number,
          p.date,
          p.direction,
          parties.find((x) => x.id === p.partyId)?.name ?? '',
          paymentMethodLabel(tr, p.method),
          toMajor(p.amount),
        ]),
      );
  }

  if (key === 'profit') {
    body = (
      <>
        <HeroFigure
          label="Net profit"
          value={profit.netProfit}
          tone={profit.netProfit.minor >= 0 ? 'good' : 'bad'}
          caption={`${formatPercent(profit.margin)} of revenue`}
        />
        <ReportSection title="By month">
          <Card>
            <BarChart data={monthBars(profit.byMonth.map((m) => ({ key: m.key, value: m.profit })))} caption="Net profit" />
          </Card>
        </ReportSection>
        <ReportSection title="How it adds up">
          <KeyFigures
            rows={[
              { label: 'Revenue (taxable value)', value: formatMoney(profit.revenue) },
              { label: 'Cost of goods sold', value: `− ${formatMoney(profit.costOfGoods)}` },
              { label: 'Gross profit', value: formatMoney(profit.grossProfit), tone: 'good' },
              { label: 'Operating expenses', value: `− ${formatMoney(profit.expenses)}`, tone: 'warn' },
              { label: 'Net profit', value: formatMoney(profit.netProfit), tone: profit.netProfit.minor >= 0 ? 'good' : 'bad' },
            ]}
          />
        </ReportSection>
        <ReportSection title="Monthly detail">
          <DataTable
            headers={['Month', 'Revenue', 'Cost', 'Profit']}
            rows={profit.byMonth.map((m) => [
              monthLabel(m.key),
              formatMoney(m.revenue, { symbol: false, noDecimals: true }),
              formatMoney(m.cost, { symbol: false, noDecimals: true }),
              formatMoney(m.profit, { symbol: false, noDecimals: true }),
            ])}
            widths={[1, 1.2, 1.2, 1.2]}
          />
        </ReportSection>
      </>
    );
    exportRows = () =>
      toCsv(
        ['Month', 'Revenue', 'Cost of goods', 'Expenses', 'Profit'],
        profit.byMonth.map((m) => [m.key, toMajor(m.revenue), toMajor(m.cost), toMajor(m.expenses), toMajor(m.profit)]),
      );
  }

  return (
    <>
      <Stack.Screen options={{ title: meta.title }} />
      <ReportShell
        title={meta.title}
        subtitle={meta.subtitle}
        scope={scope}
        onScopeChange={setScope}
        showPartyFilter={['sales-summary', 'purchase-summary', 'payments'].includes(key)}
        exportRows={exportRows}
      >
        {body}
      </ReportShell>
    </>
  );
}
