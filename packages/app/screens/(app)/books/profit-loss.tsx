import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { profitAndLoss, type StatementLine } from '@esmart/core/domain/ledger/reports';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { ReportShell, reportTable, useReportScope, ReportLoading, ReportError, failedQuery } from '../../../features/reports/ReportShell';
import { DataTable, HeroFigure, ReportSection } from '../../../features/reports/reportParts';
import { useBooksView } from '../../../remote/queries';
import { useBaseCurrency } from '../../../store/selectors';
import { useAccountName } from '../../../features/books/names';
import { ColumnsReport, StatementViewPicker, columnsExport, useColumnsTables, type StatementView } from '../../../features/books/ColumnsReport';

/** Profit and loss in the Tally layout: the trading account, then indirect income and expenses. */
export default function ProfitAndLossScreen() {
  const { t: tr } = useTranslation(['books']);
  const { scope, setScope } = useReportScope('thisFY');
  const baseCurrency = useBaseCurrency();
  const nameOf = useAccountName();
  const [view, setView] = useState<StatementView>('single');
  const columns = useColumnsTables('profit-loss', scope.filters.range, view);
  const query = useBooksView<ReturnType<typeof profitAndLoss>>('profit-loss', scope.filters.range);
  const pl = query.data;
  if (failedQuery(query)) return <ReportError title={tr('books:hub.profitLoss')} subtitle={tr('books:pl.basis')} scope={scope} onScopeChange={setScope} onRetry={query.refetch} error={query.error} />;
  if (!pl) return <ReportLoading title={tr('books:hub.profitLoss')} subtitle={tr('books:pl.basis')} scope={scope} onScopeChange={setScope} />;
  const m = (minor: number) => formatMoney(money(minor, baseCurrency));

  // One layout for the screen and the export: income in one column, expenses in the other,
  // each section closed by its result (a profit under income, a loss under expenses).
  type Row = { label: string; income?: number; expense?: number };
  const incomeRows = (lines: StatementLine[]): Row[] => lines.map((l) => ({ label: nameOf(l.account), income: l.amount }));
  const expenseRows = (lines: StatementLine[]): Row[] => lines.map((l) => ({ label: nameOf(l.account), expense: l.amount }));
  const result = (value: number, profit: string, loss: string): Row => (value >= 0 ? { label: profit, income: value } : { label: loss, expense: -value });
  const trading: Row[] = [
    { label: tr('books:pl.openingStock'), expense: pl.trading.openingStock },
    ...expenseRows(pl.trading.expense),
    ...incomeRows(pl.trading.income),
    { label: tr('books:pl.closingStock'), income: pl.trading.closingStock },
  ];
  const gross = result(pl.grossProfit, tr('books:pl.grossProfit'), tr('books:pl.grossLoss'));
  const indirect: Row[] = [...incomeRows(pl.indirect.income), ...expenseRows(pl.indirect.expense)];
  const net = result(pl.netProfit, tr('books:pl.netProfit'), tr('books:pl.netLoss'));
  const headers = [tr('books:tb.account'), tr('books:pl.income'), tr('books:pl.expenses')];
  const shown = (r: Row) => [r.label, r.income !== undefined ? m(r.income) : '', r.expense !== undefined ? m(r.expense) : ''];
  const exported = (r: Row) => [r.label, r.income !== undefined ? r.income / 100 : '', r.expense !== undefined ? r.expense / 100 : ''];

  return (
    <>
      <Stack.Screen options={{ title: tr('books:hub.profitLoss') }} />
      <ReportShell
        title={tr('books:hub.profitLoss')}
        subtitle={tr('books:pl.basis')}
        scope={scope}
        onScopeChange={setScope}
        exportRows={() =>
          // The columns when they're showing, else the single statement as on screen.
          view !== 'single' && columns.sections ? reportTable(columnsExport(columns.sections).headers, columnsExport(columns.sections).rows) : reportTable(
            headers,
            [...trading, gross, ...indirect, net].map(exported),
          )
        }
      >
        <StatementViewPicker value={view} onChange={setView} />
        {view !== 'single' ? (
          <ColumnsReport tables={columns} />
        ) : (
        <>
        <HeroFigure label={net.label} value={money(Math.abs(pl.netProfit), baseCurrency)} tone={pl.netProfit >= 0 ? 'good' : 'bad'} />
        <ReportSection title={tr('books:pl.trading')}>
          <DataTable headers={headers} rows={trading.map(shown)} widths={[2, 1.2, 1.2]} total={shown(gross)} />
        </ReportSection>
        <ReportSection title={tr('books:pl.indirect')}>
          <DataTable headers={headers} rows={[shown(gross), ...indirect.map(shown)]} strong={[0]} widths={[2, 1.2, 1.2]} total={shown(net)} />
        </ReportSection>
        </>
        )}
      </ReportShell>
    </>
  );
}
