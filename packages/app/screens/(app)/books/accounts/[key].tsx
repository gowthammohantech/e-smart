import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams } from 'expo-router';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Card } from '@esmart/ui/components/Card';
import { BarChart } from '@esmart/ui/components/charts/BarChart';
import { accountFor } from '@esmart/core/domain/ledger/accounts';
import { ledgerStatement, type BalancePoint } from '@esmart/core/domain/ledger/reports';
import { formatDate } from '@esmart/core/lib/date';
import { ReportShell, reportTable, useReportScope } from '../../../../features/reports/ReportShell';
import { DataTable, KeyFigures, ReportSection } from '../../../../features/reports/reportParts';
import { useBooksView, useServerBook } from '../../../../remote/queries';
import { LoadingView } from '../../../../components/LoadingView';
import { useBaseCurrency } from '../../../../store/selectors';
import { useAccountName, useDrCr } from '../../../../features/books/names';

/** One account's entries in a period, with its running balance. */
export default function AccountStatement() {
  const { t: tr } = useTranslation(['books', 'common']);
  const { key: raw } = useLocalSearchParams<{ key: string }>();
  const key = decodeURIComponent(raw ?? '');
  const { scope, setScope } = useReportScope('thisFY');
  const baseCurrency = useBaseCurrency();
  const { book } = useServerBook();
  const nameOf = useAccountName();
  const drCr = useDrCr();
  const account = accountFor(key, book) ?? (key.startsWith('sys:tdsPayable:') ? { key, name: key, group: 'dutiesTaxes' as const, kind: 'system' as const } : undefined);
  const s = useBooksView<ReturnType<typeof ledgerStatement> & { trend?: BalancePoint[] }>('ledger', { ...scope.filters.range, account: key }).data;
  if (!s) return <LoadingView />;
  const title = account ? nameOf(account) : key;
  // Cash and bank: how the balance moved, month end by month end.
  const showTrend = (account?.group === 'cashInHand' || account?.group === 'bankAccounts') && (s.trend?.length ?? 0) > 1;
  const trend = (s.trend ?? []).map((p) => ({ label: formatDate(`${p.month}-01`, 'MMM'), value: { minor: p.balance, currency: baseCurrency } }));

  const exportRows = () =>
    reportTable(
      [tr('common:table.date'), tr('common:table.number'), tr('books:vouchers.debit'), tr('books:vouchers.credit'), tr('books:accounts.balance')],
      s.rows.map((r) => [r.date, r.source.number, r.debit / 100, r.credit / 100, r.balance / 100]),
    );


  return (
    <>
      <Stack.Screen options={{ title }} />
      <ReportShell title={title} scope={scope} onScopeChange={setScope} exportRows={exportRows}>
        <KeyFigures
          rows={[
            { label: tr('books:statement.opening'), value: drCr(s.opening, baseCurrency) },
            { label: tr('books:statement.closing'), value: drCr(s.closing, baseCurrency) },
          ]}
        />
        {showTrend ? (
          <ReportSection title={tr('books:statement.trend')}>
            <Card>
              <BarChart data={trend} caption={tr('books:statement.trendCaption')} />
            </Card>
          </ReportSection>
        ) : null}
        {s.rows.length ? (
          <ReportSection title={title}>
            <DataTable
              headers={[tr('common:table.date'), tr('common:table.number'), tr('books:vouchers.debit'), tr('books:vouchers.credit'), tr('books:accounts.balance')]}
              rows={s.rows.map((r) => [formatDate(r.date, 'dd MMM'), r.source.number, r.debit ? (r.debit / 100).toFixed(2) : '', r.credit ? (r.credit / 100).toFixed(2) : '', drCr(r.balance, baseCurrency)])}
              widths={[0.9, 1.4, 1, 1, 1.3]}
            />
          </ReportSection>
        ) : (
          <EmptyState icon="book-open-outline" title={tr('books:statement.empty')} compact />
        )}
      </ReportShell>
    </>
  );
}
