import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@esmart/ui/components/Button';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Card } from '@esmart/ui/components/Card';
import { BarChart } from '@esmart/ui/components/charts/BarChart';
import { accountFor } from '@esmart/core/domain/ledger/accounts';
import { ledgerStatement, type BalancePoint } from '@esmart/core/domain/ledger/reports';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { ReportShell, reportTable, useReportScope, ReportLoading, ReportError, failedQuery } from '../../../../features/reports/ReportShell';
import { DataTable, KeyFigures, ReportSection } from '../../../../features/reports/reportParts';
import { useBooksView, useServerBook } from '../../../../remote/queries';
import { useBaseCurrency, usePaymentAccounts } from '../../../../store/selectors';
import { useAccountName, useDrCr } from '../../../../features/books/names';

/** One account's entries in a period, with its running balance. */
export default function AccountStatement() {
  const { t: tr } = useTranslation(['books', 'common', 'banking']);
  const router = useRouter();
  const { key: raw } = useLocalSearchParams<{ key: string }>();
  const key = decodeURIComponent(raw ?? '');
  const { scope, setScope } = useReportScope('thisFY');
  const baseCurrency = useBaseCurrency();
  const { book, loaded } = useServerBook();
  const nameOf = useAccountName();
  const drCr = useDrCr();
  // A bank account's ledger leads to matching its statements.
  const bank = usePaymentAccounts().find((a) => a.type === 'bank' && key === `pay:${a.id}`);
  const account = accountFor(key, book) ?? (key.startsWith('sys:tdsPayable:') ? { key, name: key, group: 'dutiesTaxes' as const, kind: 'system' as const } : undefined);
  const query = useBooksView<ReturnType<typeof ledgerStatement> & { trend?: BalancePoint[] }>('ledger', { ...scope.filters.range, account: key });
  const s = query.data;
  // Until the chart is here the account's name isn't known: blank, not its raw key ("lac:…").
  const title = account ? nameOf(account) : loaded ? key : '';
  if (failedQuery(query)) return <ReportError title={title} scope={scope} onScopeChange={setScope} onRetry={query.refetch} error={query.error} />;
  if (!s || !loaded) return <ReportLoading title={title} scope={scope} onScopeChange={setScope} skeleton={{ cols: 5 }} />;
  const m = (minor: number) => (minor ? formatMoney(money(minor, baseCurrency)) : '');
  const totalDebit = s.rows.reduce((a, r) => a + r.debit, 0);
  const totalCredit = s.rows.reduce((a, r) => a + r.credit, 0);
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
        {bank ? (
          <View style={{ alignItems: 'flex-start' }}>
            <Button title={tr('banking:account.reconcile')} icon="bank-check" variant="ghost" size="sm" onPress={() => router.push(`/(app)/books/reconciliation/${bank.id}` as never)} />
          </View>
        ) : null}
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
              rows={s.rows.map((r) => [formatDate(r.date, 'dd MMM'), r.source.number, m(r.debit), m(r.credit), drCr(r.balance, baseCurrency)])}
              widths={[0.9, 1.4, 1, 1, 1.3]}
              kinds={['text', 'text', 'num', 'num', 'num']}
              total={[tr('books:tb.total'), '', m(totalDebit), m(totalCredit), drCr(s.closing, baseCurrency)]}
              paged
            />
          </ReportSection>
        ) : (
          <EmptyState icon="book-open-outline" title={tr('books:statement.empty')} compact />
        )}
      </ReportShell>
    </>
  );
}
