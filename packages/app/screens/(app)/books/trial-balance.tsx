import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { trialBalance } from '@esmart/core/domain/ledger/reports';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { ReportShell, reportTable, useReportScope, ReportLoading, ReportError, failedQuery } from '../../../features/reports/ReportShell';
import { DataTable, KeyFigures, ReportSection } from '../../../features/reports/reportParts';
import { useBooksView } from '../../../remote/queries';
import { useBaseCurrency } from '../../../store/selectors';
import { useAccountName } from '../../../features/books/names';

export default function TrialBalanceScreen() {
  const { t: tr } = useTranslation(['books']);
  const { scope, setScope } = useReportScope('thisFY');
  const baseCurrency = useBaseCurrency();
  const nameOf = useAccountName();
  const query = useBooksView<ReturnType<typeof trialBalance>>('trial-balance', scope.filters.range);
  const tb = query.data;
  if (failedQuery(query)) return <ReportError title={tr('books:hub.trialBalance')} subtitle={tr('books:tb.basis')} scope={scope} onScopeChange={setScope} onRetry={query.refetch} error={query.error} />;
  if (!tb) return <ReportLoading title={tr('books:hub.trialBalance')} subtitle={tr('books:tb.basis')} scope={scope} onScopeChange={setScope} />;
  const off = tb.totals.closingDebit - tb.totals.closingCredit;
  const m = (minor: number) => formatMoney(money(minor, baseCurrency));
  const amount = (minor: number) => (minor ? m(minor) : '');
  // Opening and closing balances each split into a debit and a credit column, as Tally's trial balance
  // has them, so every column adds up to the Total row and the closing columns' totals are the cards'.
  const dr = (minor: number) => Math.max(minor, 0);
  const cr = (minor: number) => Math.max(-minor, 0);
  const headers = [tr('books:tb.account'), tr('books:tb.openingDebit'), tr('books:tb.openingCredit'), tr('books:tb.debit'), tr('books:tb.credit'), tr('books:tb.closingDebit'), tr('books:tb.closingCredit')];
  const { totals } = tb;

  return (
    <>
      <Stack.Screen options={{ title: tr('books:hub.trialBalance') }} />
      <ReportShell
        title={tr('books:hub.trialBalance')}
        subtitle={tr('books:tb.basis')}
        scope={scope}
        onScopeChange={setScope}
        exportRows={() =>
          reportTable(headers, [
            ...tb.rows.map((r) => [nameOf(r.account), dr(r.opening) / 100, cr(r.opening) / 100, r.debit / 100, r.credit / 100, dr(r.closing) / 100, cr(r.closing) / 100]),
            [tr('books:tb.total'), totals.openingDebit / 100, totals.openingCredit / 100, totals.debit / 100, totals.credit / 100, totals.closingDebit / 100, totals.closingCredit / 100],
          ])
        }
      >
        <KeyFigures
          rows={[
            { label: tr('books:tb.closingDebits'), value: m(totals.closingDebit) },
            { label: tr('books:tb.closingCredits'), value: m(totals.closingCredit) },
            off ? { label: tr('books:tb.unbalanced', { amount: m(Math.abs(off)) }), value: '!', tone: 'bad' as const } : { label: tr('books:tb.balanced'), value: '✓', tone: 'good' as const },
          ]}
        />
        <ReportSection title={tr('books:hub.trialBalance')}>
          {/* The same columns as the export: opening, the period's debits and credits, closing. */}
          <DataTable
            headers={headers}
            rows={tb.rows.map((r) => [nameOf(r.account), amount(dr(r.opening)), amount(cr(r.opening)), amount(r.debit), amount(r.credit), amount(dr(r.closing)), amount(cr(r.closing))])}
            widths={[1.8, 1, 1, 1, 1, 1, 1]}
            total={[tr('books:tb.total'), m(totals.openingDebit), m(totals.openingCredit), m(totals.debit), m(totals.credit), m(totals.closingDebit), m(totals.closingCredit)]}
          />
        </ReportSection>
      </ReportShell>
    </>
  );
}
