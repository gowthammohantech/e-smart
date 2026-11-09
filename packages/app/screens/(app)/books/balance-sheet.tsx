import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { balanceSheet, type BalanceSheetSide } from '@esmart/core/domain/ledger/reports';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { ReportShell, reportTable, useReportScope, ReportLoading, ReportError, failedQuery } from '../../../features/reports/ReportShell';
import { DataTable, KeyFigures, ReportSection } from '../../../features/reports/reportParts';
import { useBooksView } from '../../../remote/queries';
import { useBaseCurrency } from '../../../store/selectors';
import { useAccountName } from '../../../features/books/names';
import { ColumnsReport, StatementViewPicker, columnsExport, useColumnsTables, type StatementView } from '../../../features/books/ColumnsReport';

/** What the business owns against what it owes and its capital, on the period's last day. */
export default function BalanceSheetScreen() {
  const { t: tr } = useTranslation(['books']);
  const { scope, setScope } = useReportScope('thisFY');
  const baseCurrency = useBaseCurrency();
  const nameOf = useAccountName();
  const [view, setView] = useState<StatementView>('single');
  const columns = useColumnsTables('balance-sheet', scope.filters.range, view);
  const query = useBooksView<ReturnType<typeof balanceSheet>>('balance-sheet', { to: scope.filters.range.to });
  const bs = query.data;
  if (failedQuery(query)) return <ReportError title={tr('books:hub.balanceSheet')} subtitle={tr('books:bs.basis')} scope={scope} onScopeChange={setScope} onRetry={query.refetch} error={query.error} asAt />;
  if (!bs) return <ReportLoading title={tr('books:hub.balanceSheet')} subtitle={tr('books:bs.basis')} scope={scope} onScopeChange={setScope} asAt />;
  const m = (minor: number) => formatMoney(money(minor, baseCurrency));
  // Each group's heading carries its total, in bold; its accounts follow, indented.
  type Line = { label: string; amount: number; heading?: boolean };
  const lines = (side: BalanceSheetSide): Line[] =>
    side.flatMap((s) => [{ label: tr(`books:bs.heading.${s.heading}`), amount: s.total, heading: true }, ...s.lines.map((l) => ({ label: `   ${nameOf(l.account)}`, amount: l.amount }))]);
  // A loss so far is taken off capital: named as a loss, its amount keeps its minus sign.
  const liabilities: Line[] = [...lines(bs.liabilities), { label: tr(bs.currentProfit < 0 ? 'books:bs.currentLoss' : 'books:bs.currentProfit'), amount: bs.currentProfit, heading: true }];
  const assets = lines(bs.assets);
  const headingRows = (side: Line[]) => side.flatMap((l, i) => (l.heading ? [i] : []));
  const off = bs.totalAssets - bs.totalLiabilities;
  const headers = [tr('books:tb.account'), tr('books:accounts.balance')];

  return (
    <>
      <Stack.Screen options={{ title: tr('books:hub.balanceSheet') }} />
      <ReportShell
        title={tr('books:hub.balanceSheet')}
        subtitle={tr('books:bs.basis')}
        scope={scope}
        onScopeChange={setScope}
        asAt
        exportRows={() =>
          // The columns when they're showing, else the single statement. Amounts go out as numbers.
          view !== 'single' && columns.sections ? reportTable(columnsExport(columns.sections).headers, columnsExport(columns.sections).rows) : reportTable(
            headers,
            [
              [tr('books:bs.liabilities'), ''],
              ...liabilities.map((l) => [l.label, l.amount / 100]),
              [tr('books:bs.total'), bs.totalLiabilities / 100],
              [tr('books:bs.assets'), ''],
              ...assets.map((l) => [l.label, l.amount / 100]),
              [tr('books:bs.total'), bs.totalAssets / 100],
            ],
          )
        }
      >
        <StatementViewPicker value={view} onChange={setView} balanceSheet />
        {view !== 'single' ? (
          <ColumnsReport tables={columns} />
        ) : (
        <>
        <KeyFigures
          rows={[
            { label: tr('books:bs.liabilities'), value: m(bs.totalLiabilities) },
            { label: tr('books:bs.assets'), value: m(bs.totalAssets) },
            ...(off ? [{ label: tr('books:bs.differs', { amount: m(Math.abs(off)) }), value: '!', tone: 'bad' as const }] : []),
          ]}
        />
        <ReportSection title={tr('books:bs.liabilities')}>
          <DataTable headers={headers} rows={liabilities.map((l) => [l.label, m(l.amount)])} strong={headingRows(liabilities)} widths={[2, 1.2]} total={[tr('books:bs.total'), m(bs.totalLiabilities)]} />
        </ReportSection>
        <ReportSection title={tr('books:bs.assets')}>
          <DataTable headers={headers} rows={assets.map((l) => [l.label, m(l.amount)])} strong={headingRows(assets)} widths={[2, 1.2]} total={[tr('books:bs.total'), m(bs.totalAssets)]} />
        </ReportSection>
        </>
        )}
      </ReportShell>
    </>
  );
}
