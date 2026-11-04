import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { trialBalance } from '@esmart/core/domain/ledger/reports';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { ReportShell, reportTable, useReportScope } from '../../../features/reports/ReportShell';
import { DataTable, KeyFigures, ReportSection } from '../../../features/reports/reportParts';
import { useBooksView } from '../../../remote/queries';
import { LoadingView } from '../../../components/LoadingView';
import { useBaseCurrency } from '../../../store/selectors';
import { useAccountName, useDrCr } from '../../../features/books/names';

export default function TrialBalanceScreen() {
  const { t: tr } = useTranslation(['books']);
  const { scope, setScope } = useReportScope('thisFY');
  const baseCurrency = useBaseCurrency();
  const nameOf = useAccountName();
  const drCr = useDrCr();
  const tb = useBooksView<ReturnType<typeof trialBalance>>('trial-balance', scope.filters.range).data;
  if (!tb) return <LoadingView />;
  const off = tb.totals.closingDebit - tb.totals.closingCredit;
  const m = (minor: number) => formatMoney(money(minor, baseCurrency));


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
            tb.rows.map((r) => [nameOf(r.account), r.opening / 100, r.debit / 100, r.credit / 100, r.closing / 100]),
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
          <DataTable
            headers={[tr('books:tb.account'), tr('books:tb.debit'), tr('books:tb.credit'), tr('books:tb.closing')]}
            rows={tb.rows.map((r) => [nameOf(r.account), r.debit ? (r.debit / 100).toFixed(2) : '', r.credit ? (r.credit / 100).toFixed(2) : '', drCr(r.closing, baseCurrency)])}
            widths={[1.8, 1, 1, 1.3]}
          />
        </ReportSection>
      </ReportShell>
    </>
  );
}
