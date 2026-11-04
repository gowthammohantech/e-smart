import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { Text } from '@esmart/ui/components/Text';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { BarChart, RankedBars } from '@esmart/ui/components/charts/BarChart';
import { DonutChart } from '@esmart/ui/components/charts/DonutChart';
import { AgingBars } from '@esmart/ui/components/charts/AgingBars';
import { seriesColor } from '@esmart/ui/theme/chartColors';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';

import { ReportShell, reportTable, useReportScope } from '../../../features/reports/ReportShell';
import type { ReportTable } from '../../../features/reports/reportTable';
import { DataTable, HeroFigure, KeyFigures, ReportSection } from '../../../features/reports/reportParts';
import { ReportDesktop } from '../../../features/reports/ReportDesktop';

import {
  profitSnapshot,
  summarizeAdvances,
  summarizeDocuments,
  summarizeExpenses,
  summarizePayments,
  summarizeStock,
  summarizeTax,
} from '@esmart/core/domain/reports';
import { PAYMENT_METHODS } from '@esmart/core/data/masters';
import { paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney, formatPercent, formatQty } from '@esmart/core/lib/format';
import { formatDate, monthLabel, monthLabelNarrow } from '@esmart/core/lib/date';
import { money, toMajor } from '@esmart/core/lib/money';
import { tdsRegister } from '@esmart/core/domain/tds';
import { BANK_RATE_PERCENT, msmePayables, sec43bh } from '@esmart/core/domain/msme';

import {
  useBaseCurrency,
  useBranches,
  useDocuments,
  useExpenseCategories,
  useExpenses,
  useItems,
  useParties,
  useActiveCompany,
  usePayables,
  usePaymentAccounts,
  usePayments,
  useReceivables,
  useStockMovements,
} from '../../../store/selectors';

export default function Report() {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain', 'nav', 'reports', 'common']);
  const { report } = useLocalSearchParams<{ report: string }>();
  const key = String(report);
  const titles: Record<string, { title: string; subtitle?: string }> = {
    'sales-summary': { title: tr('reports:report.salesSummary.title') },
    'purchase-summary': { title: tr('reports:report.purchaseSummary.title') },
    'expense-summary': { title: tr('reports:report.expenseSummary.title') },
    receivables: { title: tr('reports:report.receivables.title'), subtitle: tr('reports:report.receivables.basis') },
    payables: { title: tr('reports:report.payables.title'), subtitle: tr('reports:report.payables.basis') },
    stock: { title: tr('reports:report.stock.title'), subtitle: tr('reports:report.stock.basis') },
    'tax-summary': { title: tr('reports:report.taxSummary.title'), subtitle: tr('reports:report.taxSummary.basis') },
    payments: { title: tr('reports:report.payments.title') },
    advances: { title: tr('reports:report.advances.title'), subtitle: tr('reports:report.advances.basis') },
    profit: { title: tr('reports:report.profit.title'), subtitle: tr('reports:report.profit.basis') },
    'tds-register': { title: tr('reports:report.tdsRegister.title'), subtitle: tr('reports:report.tdsRegister.basis') },
    'msme-payables': { title: tr('reports:report.msmePayables.title'), subtitle: tr('reports:report.msmePayables.basis') },
  };
  const meta = titles[key];
  // Always false in the native apps, so the desktop layout only ever reaches a browser.
  const desktop = useIsDesktop();

  const { scope, setScope } = useReportScope(key === 'profit' || key === 'tax-summary' || key === 'tds-register' ? 'thisFY' : 'last90');

  const baseCurrency = useBaseCurrency();
  const documents = useDocuments();
  const expenses = useExpenses();
  const expenseCategories = useExpenseCategories();
  const items = useItems();
  const movements = useStockMovements();
  const parties = useParties();
  const company = useActiveCompany();
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
  const tax = useMemo(
    () => summarizeTax(documents, baseCurrency, scope.filters, expenses, company),
    [documents, baseCurrency, scope.filters, expenses, company],
  );
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
  const advances = useMemo(() => summarizeAdvances(payments, baseCurrency, scope.filters), [payments, baseCurrency, scope.filters]);
  const stock = useMemo(
    () => summarizeStock(items, movements, baseCurrency, scope.filters.branchId),
    [items, movements, baseCurrency, scope.filters.branchId],
  );
  const profit = useMemo(
    () => profitSnapshot(documents, expenses, items, baseCurrency, scope.filters),
    [documents, expenses, items, baseCurrency, scope.filters],
  );

  // TDS kept back on supplier bills, by section, deductee and quarter (the input for Form 26Q).
  const tdsRows = useMemo(
    () =>
      tdsRegister(
        documents
          .filter((d) => ['purchaseBill', 'supplierDebitNote', 'supplierCreditNote'].includes(d.kind) && !['draft', 'cancelled'].includes(d.status))
          .filter((d) => (!scope.filters.branchId || d.branchId === scope.filters.branchId) && (!scope.filters.partyId || d.partyId === scope.filters.partyId))
          .map((d) => {
            const rate = d.currency === baseCurrency ? 1 : d.exchangeRate;
            return {
              partyId: d.partyId,
              date: d.date,
              tds: d.tds ? { section: d.tds.section, amount: { minor: Math.round(d.tds.amount.minor * rate) } } : undefined,
              baseMinor: Math.round(d.totals.taxableAmount.minor * rate),
              sign: d.kind === 'supplierCreditNote' ? -1 : 1,
            };
          }),
        parties,
        { from: scope.filters.range.from, to: scope.filters.range.to },
      ),
    [documents, parties, baseCurrency, scope.filters],
  );

  if (!meta) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <Stack.Screen options={{ title: tr('nav:title.report') }} />
        <EmptyState illustration="unknown-report" icon="chart-box-outline" title={tr('reports:detail.unknown')} message={tr('reports:detail.unknownBody')} />
      </View>
    );
  }

  const monthBars = (rows: { key: string; value: { minor: number; currency: string } }[]) =>
    rows.map((r) => ({ label: monthLabelNarrow(r.key), value: r.value }));

  let body: React.ReactNode = null;
  let exportRows: (() => ReportTable) | undefined;

  if (key === 'sales-summary' || key === 'purchase-summary') {
    const data = key === 'sales-summary' ? sales : purchases;
    const isSales = key === 'sales-summary';
    body = (
      <>
        <HeroFigure
          label={isSales ? tr('reports:figure.totalInvoiced') : tr('reports:figure.totalPurchased')}
          value={data.total}
          caption={tr('reports:caption.documentsAvg', {
            count: data.count,
            amount: formatMoney({ minor: data.count ? Math.round(data.total.minor / data.count) : 0, currency: baseCurrency }),
          })}
        />
        <ReportSection title={tr('reports:detail.byMonth')}>
          <Card>
            <BarChart data={monthBars(data.byMonth)} caption={isSales ? tr('reports:figure.invoicedValue') : tr('reports:figure.purchaseValue')} />
          </Card>
        </ReportSection>
        <ReportSection title={tr('reports:detail.breakdown')}>
          <KeyFigures
            rows={[
              { label: tr('common:totals.taxableValue'), value: formatMoney(data.taxable) },
              { label: tr('common:table.tax'), value: formatMoney(data.tax) },
              { label: isSales ? tr('reports:figure.discountsGiven') : tr('reports:figure.discountsReceived'), value: formatMoney(data.discount), tone: 'good' },
              { label: tr('reports:figure.grandTotal'), value: formatMoney(data.total) },
            ]}
          />
        </ReportSection>
        <ReportSection title={isSales ? tr('reports:detail.topCustomers') : tr('reports:detail.topSuppliers')}>
          <Card>
            <RankedBars
              rows={data.byParty.slice(0, 8).map((r) => ({ label: r.label, value: r.value, sublabel: tr('reports:caption.documents', { count: r.count }) }))}
              colorFor={(i) => seriesColor(t.scheme, i)}
            />
          </Card>
        </ReportSection>
        <ReportSection title={tr('reports:detail.topItems')}>
          <Card>
            <RankedBars
              rows={data.byItem.slice(0, 8).map((r) => ({ label: r.label, value: r.value, sublabel: tr('reports:caption.units', { qty: formatQty(r.count) }) }))}
              colorFor={(i) => seriesColor(t.scheme, i)}
            />
          </Card>
        </ReportSection>
        {branches.length > 1 ? (
          <ReportSection title={tr('reports:detail.byBranch')}>
            <Card>
              <RankedBars rows={data.byBranch} colorFor={(i) => seriesColor(t.scheme, i)} />
            </Card>
          </ReportSection>
        ) : null}
      </>
    );
    exportRows = () =>
      reportTable(
        [tr('common:table.number'), tr('common:table.date'), tr('reports:shell.contact'), tr('reports:column.taxable'), tr('common:table.tax'), tr('common:table.total')],
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
        <HeroFigure label={tr('reports:detail.totalSpent')} value={expenseSummary.total} tone="warn" caption={tr('reports:caption.entriesInputTax', { count: expenseSummary.count, amount: formatMoney(expenseSummary.tax) })} />
        <ReportSection title={tr('reports:detail.byCategory')}>
          <Card>
            <DonutChart slices={expenseSummary.byCategory.map((c) => ({ label: c.label, value: c.value }))} centerLabel={tr('common:table.total')} />
          </Card>
        </ReportSection>
        <ReportSection title={tr('reports:detail.byMonth')}>
          <Card>
            <BarChart data={monthBars(expenseSummary.byMonth)} caption={tr('reports:detail.expenseValue')} color={t.c.warn} />
          </Card>
        </ReportSection>
        <ReportSection title={tr('reports:detail.detail')}>
          <DataTable
            headers={[tr('common:table.category'), tr('reports:figure.entries'), tr('common:table.amount')]}
            rows={expenseSummary.byCategory.map((c) => [c.label, c.count, formatMoney(c.value)])}
            widths={[2, 1, 1.4]}
          />
        </ReportSection>
      </>
    );
    exportRows = () =>
      reportTable(
        [tr('common:table.number'), tr('common:table.date'), tr('common:table.category'), tr('common:table.amount'), tr('common:table.tax')],
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
          label={key === 'receivables' ? tr('reports:home.totalReceivable') : tr('reports:home.totalPayable')}
          value={data.summary.total}
          tone={data.summary.overdue.minor > 0 ? 'warn' : undefined}
          caption={tr('reports:caption.openOverdue', { count: data.outstanding.length, amount: formatMoney(data.summary.overdue) })}
        />
        <ReportSection title={tr('reports:detail.aging')}>
          <Card>
            <AgingBars buckets={data.summary.buckets.map((b) => ({ key: b.key, label: b.label, amount: b.amount, count: b.count }))} />
          </Card>
        </ReportSection>
        <ReportSection title={tr('reports:detail.detail')}>
          <DataTable
            headers={[tr('reports:column.document'), tr('reports:column.days'), tr('reports:column.outstanding')]}
            rows={data.outstanding
              .slice()
              .sort((a, b) => b.daysOverdue - a.daysOverdue)
              .map((o) => [o.document.number, o.daysOverdue > 0 ? tr('reports:cell.daysLate', { count: o.daysOverdue }) : tr('reports:cell.current'), formatMoney(o.outstanding)])}
            widths={[1.6, 1, 1.3]}
          />
        </ReportSection>
      </>
    );
    exportRows = () =>
      reportTable(
        [
          tr('reports:column.document'),
          tr('reports:shell.contact'),
          tr('common:table.date'),
          tr('common:table.due'),
          tr('common:table.total'),
          tr('reports:column.paid'),
          tr('reports:column.outstanding'),
          tr('reports:column.daysOverdue'),
        ],
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
        <HeroFigure label={tr('reports:detail.stockValue')} value={stock.totalValue} caption={tr('reports:caption.stockCounts', { tracked: stock.trackedCount, low: stock.lowCount, out: stock.outCount })} />
        <ReportSection title={tr('reports:detail.mostValuable')}>
          <Card>
            <RankedBars
              rows={stock.rows.slice(0, 8).map((r) => ({
                label: r.item.name,
                value: r.value,
                sublabel: tr('reports:caption.onHand', { qty: formatQty(r.onHand), unit: r.item.unit }),
              }))}
              colorFor={(i) => seriesColor(t.scheme, i)}
            />
          </Card>
        </ReportSection>
        <ReportSection title={tr('reports:detail.allTracked')}>
          <DataTable
            headers={[tr('reports:column.item'), tr('common:table.onHand'), tr('reports:column.value')]}
            rows={stock.rows.map((r) => [r.item.name, `${formatQty(r.onHand)} ${r.item.unit}`, formatMoney(r.value)])}
            widths={[2, 1, 1.3]}
          />
        </ReportSection>
      </>
    );
    exportRows = () =>
      reportTable(
        [tr('common:table.sku'), tr('reports:column.item'), tr('common:table.unit'), tr('common:table.onHand'), tr('reports:column.reorderLevel'), tr('reports:column.value')],
        stock.rows.map((r) => [r.item.sku, r.item.name, r.item.unit, r.onHand, r.item.reorderLevel, toMajor(r.value)]),
      );
  }

  if (key === 'tax-summary') {
    body = (
      <>
        <HeroFigure
          label={tr('reports:detail.netTaxPayable')}
          value={tax.netPayable}
          tone={tax.netPayable.minor > 0 ? 'bad' : 'good'}
          caption={tr('reports:caption.outputLessInput', { output: formatMoney(tax.outwardTotal), input: formatMoney(tax.inwardTotal) })}
        />
        <ReportSection title={tr('reports:detail.outwardSupplies')}>
          {tax.outward.length === 0 ? (
            <Card>
              <Text variant="small" tone="muted">{tr('reports:detail.noTaxableSales')}</Text>
            </Card>
          ) : (
            <DataTable
              headers={[tr('reports:column.rate'), tr('reports:column.taxable'), 'CGST', 'SGST', 'IGST']}
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
        <ReportSection title={tr('reports:detail.inwardSupplies')}>
          {tax.inward.length === 0 ? (
            <Card>
              <Text variant="small" tone="muted">{tr('reports:detail.noTaxablePurchases')}</Text>
            </Card>
          ) : (
            <DataTable
              headers={[tr('reports:column.rate'), tr('reports:column.taxable'), 'CGST', 'SGST', 'IGST']}
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
        <ReportSection title={tr('reports:detail.summary')}>
          <KeyFigures
            rows={[
              { label: tr('reports:figure.outputTaxOnSales'), value: formatMoney(tax.outwardTotal) },
              { label: tr('reports:figure.inputTaxCredit'), value: formatMoney(tax.inwardTotal), tone: 'good' },
              { label: tr('reports:figure.netPayable'), value: formatMoney(tax.netPayable), tone: tax.netPayable.minor > 0 ? 'bad' : 'good' },
            ]}
          />
        </ReportSection>
      </>
    );
    exportRows = () =>
      reportTable(
        [tr('reports:column.direction'), tr('reports:column.rate'), tr('reports:column.taxable'), 'CGST', 'SGST', 'IGST', tr('common:table.total')],
        [
          ...tax.outward.map((r) => [tr('reports:cell.outward'), r.rate, toMajor(r.taxable), toMajor(r.cgst), toMajor(r.sgst), toMajor(r.igst), toMajor(r.total)]),
          ...tax.inward.map((r) => [tr('reports:cell.inward'), r.rate, toMajor(r.taxable), toMajor(r.cgst), toMajor(r.sgst), toMajor(r.igst), toMajor(r.total)]),
        ],
      );
  }

  if (key === 'payments') {
    body = (
      <>
        <HeroFigure
          label={tr('reports:detail.netCash')}
          value={paymentSummary.net}
          tone={paymentSummary.net.minor >= 0 ? 'good' : 'bad'}
          caption={tr('reports:caption.inOut', { received: formatMoney(paymentSummary.received), paid: formatMoney(paymentSummary.paid) })}
        />
        <ReportSection title={tr('reports:detail.byMonth')}>
          <Card>
            <BarChart
              data={paymentSummary.byMonth.map((m) => ({ label: monthLabelNarrow(m.key), value: m.received }))}
              caption={tr('reports:detail.moneyReceived')}
              color={t.c.good}
            />
          </Card>
        </ReportSection>
        <ReportSection title={tr('reports:detail.byMethod')}>
          <Card>
            <DonutChart slices={paymentSummary.byMethod.map((m) => ({ label: m.label, value: m.value }))} centerLabel={tr('reports:figure.allPayments')} />
          </Card>
        </ReportSection>
        <ReportSection title={tr('reports:detail.byAccount')}>
          <Card>
            <RankedBars rows={paymentSummary.byAccount} colorFor={(i) => seriesColor(t.scheme, i)} />
          </Card>
        </ReportSection>
      </>
    );
    exportRows = () =>
      reportTable(
        [tr('common:table.number'), tr('common:table.date'), tr('reports:column.direction'), tr('reports:shell.contact'), tr('common:table.method'), tr('common:table.amount')],
        paymentSummary.payments.map((p) => [
          p.number,
          p.date,
          tr(`domain:status.${p.direction}`),
          parties.find((x) => x.id === p.partyId)?.name ?? '',
          paymentMethodLabel(tr, p.method),
          toMajor(p.amount),
        ]),
      );
  }

  if (key === 'advances') {
    const partyName = (id: string) => parties.find((x) => x.id === id)?.name ?? '';
    body = advances.rows.length ? (
      <>
        <KeyFigures
          rows={[
            { label: tr('reports:figure.advancesReceived'), value: formatMoney(advances.received), tone: 'good' },
            { label: tr('reports:figure.advancesPaid'), value: formatMoney(advances.paid), tone: 'warn' },
          ]}
        />
        <ReportSection title={tr('reports:detail.openAdvances')}>
          <DataTable
            headers={[tr('common:table.number'), tr('reports:shell.contact'), tr('reports:column.direction'), tr('reports:column.toAdjust')]}
            rows={advances.rows.map((r) => [
              r.number,
              partyName(r.partyId),
              tr(`domain:status.${r.direction}`),
              formatMoney(r.unallocated, { symbol: false }),
            ])}
            widths={[1, 1.6, 1, 1.2]}
          />
        </ReportSection>
      </>
    ) : (
      <EmptyState illustration="all-settled" icon="cash-check" title={tr('reports:detail.noAdvances')} message={tr('reports:detail.noAdvancesBody')} />
    );
    exportRows = () =>
      reportTable(
        [tr('common:table.number'), tr('common:table.date'), tr('reports:column.direction'), tr('reports:shell.contact'), tr('common:table.amount'), tr('reports:column.toAdjust')],
        advances.rows.map((r) => [r.number, r.date, tr(`domain:status.${r.direction}`), partyName(r.partyId), toMajor(r.amount), toMajor(r.unallocated)]),
      );
  }

  if (key === 'tds-register') {
    const total = money(tdsRows.reduce((a, r) => a + r.tdsMinor, 0), baseCurrency);
    body = tdsRows.length ? (
      <>
        <KeyFigures rows={[{ label: tr('reports:figure.tdsDeducted'), value: formatMoney(total), tone: 'warn' }]} />
        <ReportSection title={tr('reports:detail.tdsByDeductee')}>
          <DataTable
            headers={[tr('reports:column.quarter'), tr('reports:column.section'), tr('reports:shell.contact'), tr('reports:column.tds')]}
            rows={tdsRows.map((r) => [r.quarter.replace('FY ', ''), r.sectionLabel, r.partyName, formatMoney(money(r.tdsMinor, baseCurrency), { symbol: false })])}
            widths={[1.2, 0.9, 1.6, 1.1]}
          />
        </ReportSection>
      </>
    ) : (
      <EmptyState illustration="all-settled" icon="bank-minus" title={tr('reports:detail.noTds')} message={tr('reports:detail.noTdsBody')} />
    );
    exportRows = () =>
      reportTable(
        [tr('reports:column.quarter'), tr('reports:column.section'), tr('reports:shell.contact'), 'PAN', tr('reports:column.tdsBase'), tr('reports:column.tds'), tr('reports:column.documents')],
        tdsRows.map((r) => [r.quarter, r.sectionLabel, r.partyName, r.pan ?? '', r.baseMinor / 100, r.tdsMinor / 100, r.documents]),
      );
  }

  if (key === 'msme-payables') {
    // As of the period's end: what micro and small suppliers are still owed, against the 45-day limit.
    const asOf = scope.filters.range.to;
    const bills = documents.filter((d) => !scope.filters.branchId || d.branchId === scope.filters.branchId);
    const rows = msmePayables(asOf, bills, parties, payments);
    const late = sec43bh(asOf, bills, parties, payments, company.fiscalYearStartMonth);
    const nameOf = (id: string) => parties.find((x) => x.id === id)?.name ?? '';
    const sum = (list: typeof rows) => money(list.reduce((a, r) => a + r.outstandingMinor, 0), baseCurrency);
    const when = (days: number) => (days < 0 ? tr('reports:msme.overdue', { count: -days }) : tr('reports:msme.left', { count: days }));
    body = rows.length || late.length ? (
      <>
        <KeyFigures
          rows={[
            { label: tr('reports:msme.owed'), value: formatMoney(sum(rows)) },
            { label: tr('reports:msme.pastLimit'), value: formatMoney(sum(rows.filter((r) => r.daysLeft < 0))), tone: rows.some((r) => r.daysLeft < 0) ? 'bad' : undefined },
          ]}
        />
        <ReportSection title={tr('reports:msme.unpaid')}>
          <DataTable
            headers={[tr('common:table.number'), tr('reports:shell.contact'), tr('reports:msme.due'), tr('common:table.amount'), tr('reports:msme.interest')]}
            rows={rows.map((r) => [r.number, nameOf(r.partyId), `${formatDate(r.dueDate)} · ${when(r.daysLeft)}`, formatMoney(money(r.outstandingMinor, r.currency), { symbol: false }), formatMoney(money(r.interestMinor, r.currency), { symbol: false })])}
            widths={[1, 1.4, 1.6, 1, 0.9]}
          />
          <Text variant="caption" tone="muted">
            {tr('reports:msme.interestBasis', { rate: formatPercent(BANK_RATE_PERCENT * 3) })}
          </Text>
        </ReportSection>
        {late.length ? (
          <ReportSection title={tr('reports:msme.notInTime')}>
            <DataTable
              headers={[tr('common:table.number'), tr('reports:shell.contact'), tr('reports:msme.due'), tr('common:table.amount')]}
              rows={late.map((r) => [r.number, nameOf(r.partyId), formatDate(r.dueDate), formatMoney(money(r.notPaidInTimeMinor, r.currency), { symbol: false })])}
              widths={[1, 1.4, 1, 1]}
            />
            <Text variant="caption" tone="muted">
              {tr('reports:msme.notInTimeBasis')}
            </Text>
          </ReportSection>
        ) : null}
      </>
    ) : (
      <EmptyState illustration="all-settled" icon="timer-sand" title={tr('reports:msme.none')} message={tr('reports:msme.noneBody')} />
    );
    exportRows = () =>
      reportTable(
        [tr('common:table.number'), tr('reports:shell.contact'), tr('common:table.date'), tr('reports:msme.due'), tr('reports:msme.daysLeft'), tr('common:table.amount'), tr('reports:msme.interest')],
        rows.map((r) => [r.number, nameOf(r.partyId), r.date, r.dueDate, r.daysLeft, r.outstandingMinor / 100, r.interestMinor / 100]),
      );
  }

  if (key === 'profit') {
    body = (
      <>
        <HeroFigure
          label={tr('reports:detail.netProfit')}
          value={profit.netProfit}
          tone={profit.netProfit.minor >= 0 ? 'good' : 'bad'}
          caption={tr('reports:caption.ofRevenue', { percent: formatPercent(profit.margin) })}
        />
        <ReportSection title={tr('reports:detail.byMonth')}>
          <Card>
            <BarChart data={monthBars(profit.byMonth.map((m) => ({ key: m.key, value: m.profit })))} caption={tr('reports:detail.netProfit')} />
          </Card>
        </ReportSection>
        <ReportSection title={tr('reports:detail.howItAddsUp')}>
          <KeyFigures
            rows={[
              { label: tr('reports:figure.revenueTaxable'), value: formatMoney(profit.revenue) },
              { label: tr('reports:figure.costOfGoodsSold'), value: `− ${formatMoney(profit.costOfGoods)}` },
              { label: tr('reports:figure.grossProfit'), value: formatMoney(profit.grossProfit), tone: 'good' },
              { label: tr('reports:figure.operatingExpenses'), value: `− ${formatMoney(profit.expenses)}`, tone: 'warn' },
              { label: tr('reports:detail.netProfit'), value: formatMoney(profit.netProfit), tone: profit.netProfit.minor >= 0 ? 'good' : 'bad' },
            ]}
          />
        </ReportSection>
        <ReportSection title={tr('reports:detail.monthlyDetail')}>
          <DataTable
            headers={[tr('reports:column.month'), tr('reports:column.revenue'), tr('reports:column.cost'), tr('reports:column.profit')]}
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
      reportTable(
        [tr('reports:column.month'), tr('reports:column.revenue'), tr('reports:column.costOfGoods'), tr('reports:column.expenses'), tr('reports:column.profit')],
        profit.byMonth.map((m) => [m.key, toMajor(m.revenue), toMajor(m.cost), toMajor(m.expenses), toMajor(m.profit)]),
      );
  }

  // A desktop browser gets its own layout; the phone keeps the single column above.
  if (desktop) {
    body = (
      <ReportDesktop
        report={key}
        data={{ sales, purchases, expenseSummary, receivables, payables, stock, tax, paymentSummary, advances, profit, parties, branches, expenseCategories }}
      />
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
        showPartyFilter={['sales-summary', 'purchase-summary', 'payments', 'advances'].includes(key)}
        exportRows={exportRows}
      >
        {body}
      </ReportShell>
    </>
  );
}
