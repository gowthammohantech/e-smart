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
import { useAccountName, useDrCr } from '../../../features/books/names';

export default function TrialBalanceScreen() {
  const { t: tr } = useTranslation(['books']);
  const { scope, setScope } = useReportScope('thisFY');
  const baseCurrency = useBaseCurrency();
  const nameOf = useAccountName();
  const drCr = useDrCr();
  const query = useBooksView<ReturnType<typeof trialBalance>>('trial-balance', scope.filters.range);
  const tb = query.data;
  if (failedQuery(query)) return <ReportError title={tr('books:hub.trialBalance')} subtitle={tr('books:tb.basis')} scope={scope} onScopeChange={setScope} onRetry={query.refetch} error={query.error} />;
  if (!tb) return <ReportLoading title={tr('books:hub.trialBalance')} subtitle={tr('books:tb.basis')} scope={scope} onScopeChange={setScope} />;
  const off = tb.totals.closingDebit - tb.totals.closingCredit;
  const m = (minor: number) => formatMoney(money(minor, baseCurrency));
  const amount = (minor: number) => (minor ? m(minor) : '');

  return (
    <>
      <Stack.Screen options={{ title: tr('books:hub.trialBalance') }} />
      <ReportShell
        title={tr('books:hub.trialBalance')}
        subtitle={tr('books:tb.basis')}
        scope={scope}
        onScopeChange={setScope}
        exportRows={() =>
          reportTable(
            [tr('books:tb.account'), tr('books:tb.opening'), tr('books:tb.debit'), tr('books:tb.credit'), tr('books:tb.closing')],
            [
              ...tb.rows.map((r) => [nameOf(r.account), r.opening / 100, r.debit / 100, r.credit / 100, r.closing / 100]),
              [tr('books:tb.total'), '', tb.totals.debit / 100, tb.totals.credit / 100, ''],
            ],
          )
        }
      >
        <KeyFigures
          rows={[
            { label: tr('books:tb.debit'), value: m(tb.totals.closingDebit) },
            { label: tr('books:tb.credit'), value: m(tb.totals.closingCredit) },
            off ? { label: tr('books:tb.unbalanced', { amount: m(Math.abs(off)) }), value: '!', tone: 'bad' as const } : { label: tr('books:tb.balanced'), value: '✓', tone: 'good' as const },
          ]}
        />
        <ReportSection title={tr('books:hub.trialBalance')}>
          {/* The same columns as the export: opening, the period's debits and credits, closing. */}
          <DataTable
            headers={[tr('books:tb.account'), tr('books:tb.opening'), tr('books:tb.debit'), tr('books:tb.credit'), tr('books:tb.closing')]}
            rows={tb.rows.map((r) => [nameOf(r.account), r.opening ? drCr(r.opening, baseCurrency) : '', amount(r.debit), amount(r.credit), drCr(r.closing, baseCurrency)])}
            widths={[1.8, 1.3, 1, 1, 1.3]}
            total={[tr('books:tb.total'), '', m(tb.totals.debit), m(tb.totals.credit), '']}
          />
        </ReportSection>
      </ReportShell>
    </>
  );
}
