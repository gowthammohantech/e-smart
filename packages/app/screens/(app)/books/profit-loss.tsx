import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { profitAndLoss, profitAndLossStatement, type StatementRow, type StatementSection } from '@esmart/core/domain/ledger/reports';
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

  // One layout for the screen and the export (core profitAndLossStatement): income and expenses side
  // by side, each section balanced by its result, a profit on the expenses side and a loss on the
  // income side, so both columns add up to the same Total.
  type Row = StatementRow;
  const statement = profitAndLossStatement(pl, {
    account: nameOf,
    openingStock: tr('books:pl.openingStock'),
    closingStock: tr('books:pl.closingStock'),
    grossProfit: tr('books:pl.grossProfit'),
    grossLoss: tr('books:pl.grossLoss'),
    netProfit: tr('books:pl.netProfit'),
    netLoss: tr('books:pl.netLoss'),
  });
  const { trading, indirect } = statement;
  const totalRow = (s: StatementSection): Row => ({ label: tr('books:tb.total'), ...s.total });
  const netLabel = pl.netProfit >= 0 ? tr('books:pl.netProfit') : tr('books:pl.netLoss');
  const headers = [tr('books:tb.account'), tr('books:pl.income'), tr('books:pl.expenses')];
  const shown = (r: Row) => [r.label, r.income !== undefined ? m(r.income) : '', r.expense !== undefined ? m(r.expense) : ''];
  const exported = (r: Row) => [r.label, r.income !== undefined ? r.income / 100 : '', r.expense !== undefined ? r.expense / 100 : ''];
  const results = (s: StatementSection) => s.rows.flatMap((r, i) => (r.result ? [i] : []));

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
            [[tr('books:pl.trading'), '', ''], ...trading.rows.map(exported), exported(totalRow(trading)), [tr('books:pl.indirect'), '', ''], ...indirect.rows.map(exported), exported(totalRow(indirect))],
          )
        }
      >
        <StatementViewPicker value={view} onChange={setView} />
        {view !== 'single' ? (
          <ColumnsReport tables={columns} />
        ) : (
        <>
        <HeroFigure label={netLabel} value={money(Math.abs(pl.netProfit), baseCurrency)} tone={pl.netProfit >= 0 ? 'good' : 'bad'} />
        <ReportSection title={tr('books:pl.trading')}>
          <DataTable headers={headers} rows={trading.rows.map(shown)} strong={results(trading)} widths={[2, 1.2, 1.2]} total={shown(totalRow(trading))} />
        </ReportSection>
        <ReportSection title={tr('books:pl.indirect')}>
          <DataTable headers={headers} rows={indirect.rows.map(shown)} strong={results(indirect)} widths={[2, 1.2, 1.2]} total={shown(totalRow(indirect))} />
        </ReportSection>
        </>
        )}
      </ReportShell>
    </>
  );
}
