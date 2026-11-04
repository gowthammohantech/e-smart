import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { profitAndLoss, type StatementLine } from '@esmart/core/domain/ledger/reports';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { ReportShell, reportTable, useReportScope } from '../../../features/reports/ReportShell';
import { DataTable, HeroFigure, KeyFigures, ReportSection } from '../../../features/reports/reportParts';
import { useBooks } from '../../../store/books';
import { useBaseCurrency } from '../../../store/selectors';
import { useAccountName } from '../../../features/books/names';

/** Profit and loss in the Tally layout: the trading account, then indirect income and expenses. */
export default function ProfitAndLossScreen() {
  const { t: tr } = useTranslation(['books']);
  const { scope, setScope } = useReportScope('thisFY');
  const baseCurrency = useBaseCurrency();
  const { postings, book, stock } = useBooks();
  const nameOf = useAccountName();
  const pl = useMemo(() => profitAndLoss(postings, book, scope.filters.range, stock), [postings, book, scope.filters.range, stock]);
  const m = (minor: number) => formatMoney(money(minor, baseCurrency));
  const rows = (lines: StatementLine[]) => lines.map((l) => [nameOf(l.account), m(l.amount)]);

  return (
    <>
      <Stack.Screen options={{ title: tr('books:hub.profitLoss') }} />
      <ReportShell
        title={tr('books:hub.profitLoss')}
        subtitle={tr('books:pl.basis')}
        scope={scope}
        onScopeChange={setScope}
        exportRows={() =>
          reportTable(
            [tr('books:tb.account'), tr('books:pl.income'), tr('books:pl.expenses')],
            [
              [tr('books:pl.openingStock'), '', pl.trading.openingStock / 100],
              ...[...pl.trading.income, ...pl.indirect.income].map((l) => [nameOf(l.account), l.amount / 100, '']),
              ...[...pl.trading.expense, ...pl.indirect.expense].map((l) => [nameOf(l.account), '', l.amount / 100]),
              [tr('books:pl.closingStock'), pl.trading.closingStock / 100, ''],
              [pl.netProfit >= 0 ? tr('books:pl.netProfit') : tr('books:pl.netLoss'), pl.netProfit / 100, ''],
            ],
          )
        }
      >
        <HeroFigure label={pl.netProfit >= 0 ? tr('books:pl.netProfit') : tr('books:pl.netLoss')} value={money(Math.abs(pl.netProfit), baseCurrency)} tone={pl.netProfit >= 0 ? 'good' : 'bad'} />
        <ReportSection title={tr('books:pl.trading')}>
          <DataTable
            headers={[tr('books:tb.account'), tr('books:accounts.balance')]}
            rows={[
              ...rows(pl.trading.income),
              [tr('books:pl.closingStock'), m(pl.trading.closingStock)],
              [tr('books:pl.openingStock'), `− ${m(pl.trading.openingStock)}`],
              ...rows(pl.trading.expense).map(([a, v]) => [a, `− ${v}`]),
            ]}
            widths={[2, 1.2]}
          />
        </ReportSection>
        <KeyFigures rows={[{ label: pl.grossProfit >= 0 ? tr('books:pl.grossProfit') : tr('books:pl.grossLoss'), value: m(Math.abs(pl.grossProfit)), tone: pl.grossProfit >= 0 ? 'good' : 'bad' }]} />
        <ReportSection title={tr('books:pl.indirect')}>
          <DataTable headers={[tr('books:tb.account'), tr('books:accounts.balance')]} rows={[...rows(pl.indirect.income), ...rows(pl.indirect.expense).map(([a, v]) => [a, `− ${v}`])]} widths={[2, 1.2]} />
        </ReportSection>
      </ReportShell>
    </>
  );
}
