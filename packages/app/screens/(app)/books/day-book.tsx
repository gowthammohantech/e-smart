import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { accountFor } from '@esmart/core/domain/ledger/accounts';
import { dayBook } from '@esmart/core/domain/ledger/reports';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { useBaseCurrency } from '../../../store/selectors';
import { ReportShell, reportTable, useReportScope, ReportLoading, ReportError, failedQuery } from '../../../features/reports/ReportShell';
import { DataTable, ReportSection } from '../../../features/reports/reportParts';
import { useBooksView, useServerBook } from '../../../remote/queries';
import { useAccountName } from '../../../features/books/names';

/** Every entry in a period, voucher by voucher, with its debits and credits. */
export default function DayBookScreen() {
  const { t: tr } = useTranslation(['books', 'common']);
  const { scope, setScope } = useReportScope('thisMonth');
  const { book } = useServerBook();
  const nameOf = useAccountName();
  const baseCurrency = useBaseCurrency();
  const query = useBooksView<{ entries: ReturnType<typeof dayBook> }>('day-book', scope.filters.range);
  const entries = query.data?.entries;
  if (failedQuery(query)) return <ReportError title={tr('books:hub.dayBook')} subtitle={tr('books:dayBook.basis')} scope={scope} onScopeChange={setScope} onRetry={query.refetch} error={query.error} />;
  if (!entries) return <ReportLoading title={tr('books:hub.dayBook')} subtitle={tr('books:dayBook.basis')} scope={scope} onScopeChange={setScope} skeleton={{ figures: 0, cols: 5 }} />;
  const m = (minor: number) => (minor ? formatMoney(money(minor, baseCurrency)) : '');
  const label = (key: string) => {
    const a = accountFor(key, book);
    return a ? nameOf(a) : nameOf({ key, name: key, kind: 'system' });
  };


  return (
    <>
      <Stack.Screen options={{ title: tr('books:hub.dayBook') }} />
      <ReportShell
        title={tr('books:hub.dayBook')}
        subtitle={tr('books:dayBook.basis')}
        scope={scope}
        onScopeChange={setScope}
        exportRows={() =>
          reportTable(
            [tr('common:table.date'), tr('common:table.number'), tr('books:tb.account'), tr('books:tb.debit'), tr('books:tb.credit')],
            entries.flatMap((e) => e.postings.map((p) => [e.date, e.source.number, label(p.account), p.debit / 100, p.credit / 100])),
          )
        }
      >
        {entries.length ? (
          entries.map((e) => (
            <ReportSection key={`${e.source.type}:${e.source.id}`} title={`${formatDate(e.date, 'dd MMM')} · ${e.source.number} · ${tr(`books:source.${e.source.type}`)}`}>
              <DataTable
                headers={[tr('books:tb.account'), tr('books:tb.debit'), tr('books:tb.credit')]}
                rows={e.postings.map((p) => [label(p.account), m(p.debit), m(p.credit)])}
                widths={[2, 1, 1]}
                total={[tr('books:tb.total'), m(e.postings.reduce((a, p) => a + p.debit, 0)), m(e.postings.reduce((a, p) => a + p.credit, 0))]}
              />
            </ReportSection>
          ))
        ) : (
          <EmptyState icon="calendar-blank-outline" title={tr('books:dayBook.empty')} compact />
        )}
      </ReportShell>
    </>
  );
}
