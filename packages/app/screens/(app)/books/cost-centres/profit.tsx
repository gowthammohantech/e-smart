import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { costCentreProfit } from '@esmart/core/domain/ledger/reports';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { Text } from '@esmart/ui/components/Text';
import { ReportShell, reportTable, useReportScope } from '../../../../features/reports/ReportShell';
import { DataTable, ReportSection } from '../../../../features/reports/reportParts';
import { useBooks, useCostCentres } from '../../../../store/books';
import { useBaseCurrency } from '../../../../store/selectors';
import { useAccountName } from '../../../../features/books/names';

/** Income, expenses and profit by cost centre, with what each is made of. */
export default function CostCentreProfitScreen() {
  const { t: tr } = useTranslation(['books']);
  const { scope, setScope } = useReportScope('thisFY');
  const baseCurrency = useBaseCurrency();
  const { postings, book } = useBooks();
  const centres = useCostCentres(true);
  const nameOf = useAccountName();
  const rows = useMemo(() => costCentreProfit(postings, book, scope.filters.range), [postings, book, scope.filters.range]);
  const m = (minor: number) => formatMoney(money(minor, baseCurrency));
  const centreName = (id?: string) => (id ? (centres.find((c) => c.id === id)?.name ?? id) : tr('books:costCentres.none'));

  return (
    <>
      <Stack.Screen options={{ title: tr('books:hub.costCentreProfit') }} />
      <ReportShell
        title={tr('books:hub.costCentreProfit')}
        subtitle={tr('books:costCentres.basis')}
        scope={scope}
        onScopeChange={setScope}
        exportRows={() => reportTable([tr('books:costCentres.centre'), tr('books:pl.income'), tr('books:pl.expenses'), tr('books:costCentres.profit')], rows.map((r) => [centreName(r.costCentreId), r.income / 100, r.expense / 100, r.profit / 100]))}
      >
        <DataTable headers={[tr('books:costCentres.centre'), tr('books:pl.income'), tr('books:pl.expenses'), tr('books:costCentres.profit')]} rows={rows.map((r) => [centreName(r.costCentreId), m(r.income), m(r.expense), m(r.profit)])} widths={[2, 1, 1, 1]} />
        {rows.length ? null : (
          <Text variant="small" tone="muted">
            {tr('books:costCentres.nothing')}
          </Text>
        )}
        {rows.map((r) => (
          <ReportSection key={r.costCentreId ?? ''} title={centreName(r.costCentreId)}>
            <DataTable headers={[tr('books:tb.account'), tr('books:accounts.balance')]} rows={r.lines.map((l) => [nameOf(l.account), m(l.amount)])} widths={[2, 1.2]} />
          </ReportSection>
        ))}
      </ReportShell>
    </>
  );
}
