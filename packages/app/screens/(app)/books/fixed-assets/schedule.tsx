import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack } from 'expo-router';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { LoadingView } from '../../../../components/LoadingView';
import { ReportShell, reportTable, useReportScope } from '../../../../features/reports/ReportShell';
import { DataTable, KeyFigures, ReportSection } from '../../../../features/reports/reportParts';
import { useFixedAssetSchedule } from '../../../../remote/fixedAssets';
import { useBaseCurrency } from '../../../../store/selectors';

/** The fixed asset schedule, as the notes to the accounts show it: cost and depreciation, came and went. */
export default function FixedAssetScheduleScreen() {
  const { t: tr } = useTranslation(['books']);
  const { scope, setScope } = useReportScope('thisFY');
  const currency = useBaseCurrency();
  const range = scope.filters.range;
  const query = useFixedAssetSchedule({ from: range.from, to: range.to });
  const s = query.data;
  const m = (minor: number) => formatMoney(money(minor, currency));
  const heads = [tr('books:assets.name'), tr('books:assets.sched.openingCost'), tr('books:assets.sched.additions'), tr('books:assets.sched.disposals'), tr('books:assets.sched.closingCost'), tr('books:assets.sched.openingDep'), tr('books:assets.sched.depreciation'), tr('books:assets.sched.onDisposals'), tr('books:assets.sched.closingDep'), tr('books:assets.sched.closingValue')];
  const cells = (r: NonNullable<typeof s>['totals']) => [r.openingCost, r.additions, r.disposals, r.closingCost, r.openingDepreciation, r.depreciation, r.depreciationOnDisposals, r.closingDepreciation, r.closingValue];
  return (
    <>
      <Stack.Screen options={{ title: tr('books:assets.schedule') }} />
      {!s ? (
        <LoadingView />
      ) : (
        <ReportShell
          title={tr('books:assets.schedule')}
          subtitle={tr('books:assets.scheduleBasis')}
          scope={scope}
          onScopeChange={setScope}
          generatedAt={query.dataUpdatedAt}
          exportRows={() => reportTable(heads, [...s.rows.map((r) => [r.name ?? '', ...cells(r).map((v) => v / 100)]), [tr('books:assets.sched.total'), ...cells(s.totals).map((v) => v / 100)]])}
        >
          <KeyFigures
            rows={[
              { label: tr('books:assets.sched.additions'), value: m(s.totals.additions) },
              { label: tr('books:assets.sched.depreciation'), value: m(s.totals.depreciation) },
              { label: tr('books:assets.sched.closingValue'), value: m(s.totals.closingValue), tone: 'good' },
            ]}
          />
          <ReportSection title={tr('books:assets.sched.cost')}>
            <DataTable
              headers={[heads[0], heads[1], heads[2], heads[3], heads[4]]}
              rows={[...s.rows.map((r) => [r.name ?? '', m(r.openingCost), m(r.additions), m(r.disposals), m(r.closingCost)]), [tr('books:assets.sched.total'), m(s.totals.openingCost), m(s.totals.additions), m(s.totals.disposals), m(s.totals.closingCost)]]}
              widths={[1.6, 1, 1, 1, 1]}
            />
          </ReportSection>
          <ReportSection title={tr('books:assets.sched.dep')}>
            <DataTable
              headers={[heads[0], heads[5], heads[6], heads[7], heads[8], heads[9]]}
              rows={[...s.rows.map((r) => [r.name ?? '', m(r.openingDepreciation), m(r.depreciation), m(r.depreciationOnDisposals), m(r.closingDepreciation), m(r.closingValue)]), [tr('books:assets.sched.total'), m(s.totals.openingDepreciation), m(s.totals.depreciation), m(s.totals.depreciationOnDisposals), m(s.totals.closingDepreciation), m(s.totals.closingValue)]]}
              widths={[1.6, 1, 1, 1, 1, 1]}
            />
          </ReportSection>
        </ReportShell>
      )}
    </>
  );
}
