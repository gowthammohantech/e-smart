import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { accountFor } from '@esmart/core/domain/ledger/accounts';
import { dayBook } from '@esmart/core/domain/ledger/reports';
import { formatDate } from '@esmart/core/lib/date';
import { ReportShell, reportTable, useReportScope } from '../../../features/reports/ReportShell';
import { DataTable, ReportSection } from '../../../features/reports/reportParts';
import { useBooks } from '../../../store/books';
import { useAccountName } from '../../../features/books/names';

/** Every entry in a period, voucher by voucher, with its debits and credits. */
export default function DayBookScreen() {
  const { t: tr } = useTranslation(['books', 'common']);
  const { scope, setScope } = useReportScope('thisMonth');
  const { postings, book } = useBooks();
  const nameOf = useAccountName();
  const entries = useMemo(() => dayBook(postings, scope.filters.range), [postings, scope.filters.range]);
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
                rows={e.postings.map((p) => [label(p.account), p.debit ? (p.debit / 100).toFixed(2) : '', p.credit ? (p.credit / 100).toFixed(2) : ''])}
                widths={[2, 1, 1]}
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
