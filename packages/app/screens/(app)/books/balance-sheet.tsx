import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { balanceSheet, type BalanceSheetSide } from '@esmart/core/domain/ledger/reports';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { ReportShell, reportTable, useReportScope } from '../../../features/reports/ReportShell';
import { DataTable, KeyFigures, ReportSection } from '../../../features/reports/reportParts';
import { useBooks } from '../../../store/books';
import { useActiveCompany, useBaseCurrency } from '../../../store/selectors';
import { useAccountName } from '../../../features/books/names';

/** What the business owns against what it owes and its capital, on the period's last day. */
export default function BalanceSheetScreen() {
  const { t: tr } = useTranslation(['books']);
  const { scope, setScope } = useReportScope('thisFY');
  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const { postings, book, stock } = useBooks();
  const nameOf = useAccountName();
  const bs = useMemo(() => balanceSheet(postings, book, scope.filters.range.to, stock, company.fiscalYearStartMonth), [postings, book, scope.filters.range.to, stock, company.fiscalYearStartMonth]);
  const m = (minor: number) => formatMoney(money(minor, baseCurrency));
  const rows = (side: BalanceSheetSide) => side.flatMap((s) => [[tr(`books:bs.heading.${s.heading}`).toUpperCase(), m(s.total)], ...s.lines.map((l) => [`   ${nameOf(l.account)}`, m(l.amount)])]);
  const off = bs.totalAssets - bs.totalLiabilities;

  return (
    <>
      <Stack.Screen options={{ title: tr('books:hub.balanceSheet') }} />
      <ReportShell
        title={tr('books:hub.balanceSheet')}
        subtitle={tr('books:bs.basis')}
        scope={scope}
        onScopeChange={setScope}
        exportRows={() =>
          reportTable(
            [tr('books:tb.account'), tr('books:accounts.balance')],
            [...rows(bs.liabilities), [tr('books:bs.currentProfit'), m(bs.currentProfit)], [tr('books:bs.total'), m(bs.totalLiabilities)], ...rows(bs.assets), [tr('books:bs.total'), m(bs.totalAssets)]],
          )
        }
      >
        <KeyFigures
          rows={[
            { label: tr('books:bs.liabilities'), value: m(bs.totalLiabilities) },
            { label: tr('books:bs.assets'), value: m(bs.totalAssets) },
            ...(off ? [{ label: tr('books:bs.differs', { amount: m(Math.abs(off)) }), value: '!', tone: 'bad' as const }] : []),
          ]}
        />
        <ReportSection title={tr('books:bs.liabilities')}>
          <DataTable headers={[tr('books:tb.account'), tr('books:accounts.balance')]} rows={[...rows(bs.liabilities), [tr('books:bs.currentProfit'), m(bs.currentProfit)]]} widths={[2, 1.2]} />
        </ReportSection>
        <ReportSection title={tr('books:bs.assets')}>
          <DataTable headers={[tr('books:tb.account'), tr('books:accounts.balance')]} rows={rows(bs.assets)} widths={[2, 1.2]} />
        </ReportSection>
      </ReportShell>
    </>
  );
}
