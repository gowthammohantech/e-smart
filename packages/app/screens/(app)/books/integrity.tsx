import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useRouter } from 'expo-router';
import { Badge } from '@esmart/ui/components/Badge';
import { Card } from '@esmart/ui/components/Card';
import { ListRow } from '@esmart/ui/components/ListRow';
import { formatMoney } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import { money } from '@esmart/core/lib/money';
import type { IntegrityCheck, IntegrityItem } from '@esmart/core/domain/ledger/integrity';
import { ReportShell, reportTable, useReportScope } from '../../../features/reports/ReportShell';
import { HeroFigure, ReportSection } from '../../../features/reports/reportParts';
import { useBooksView } from '../../../remote/queries';
import { LoadingView } from '../../../components/LoadingView';
import { useBaseCurrency } from '../../../store/selectors';

/** Where a record that disagrees lives in the app. */
const routeOf = (ref: string) => {
  const [type, id] = ref.split(':');
  if (type === 'document') return `/(app)/documents/${id}`;
  if (type === 'payment') return `/(app)/payments/${id}`;
  if (type === 'voucher') return `/(app)/books/vouchers/${id}`;
  if (type === 'expense') return `/(app)/expenses/${id}`;
  if (type === 'party') return `/(app)/contacts/customers/${id}/statement`;
  return undefined;
};

/**
 * Does the ledger agree with what it is worked out from? Each check is green or lists the records
 * that disagree, each opening where it can be put right.
 */
export default function IntegrityScreen() {
  const { t: tr } = useTranslation(['books']);
  const router = useRouter();
  const { scope, setScope } = useReportScope('thisFY');
  const baseCurrency = useBaseCurrency();
  const res = useBooksView<{ asOf: string; checks: IntegrityCheck[] }>('integrity', { to: scope.filters.range.to }).data;
  if (!res) return <LoadingView />;
  const m = (minor: number) => formatMoney(money(minor, baseCurrency));
  const failed = res.checks.filter((c) => !c.ok);
  const itemRow = (c: IntegrityCheck, i: IntegrityItem, last: boolean) => {
    const route = routeOf(i.ref);
    return (
      <ListRow
        key={`${c.key}-${i.ref}`}
        title={i.label}
        subtitle={tr('books:integrity.expectedActual', { expected: m(i.expected), actual: m(i.actual) })}
        chevron={!!route}
        divider={!last}
        onPress={route ? () => router.push(route as never) : undefined}
      />
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: tr('books:hub.integrity') }} />
      <ReportShell
        title={tr('books:hub.integrity')}
        subtitle={tr('books:integrity.basis')}
        scope={scope}
        onScopeChange={setScope}
        exportRows={() =>
          reportTable(
            [tr('books:integrity.check'), tr('books:integrity.record'), tr('books:integrity.expected'), tr('books:integrity.actual')],
            res.checks.flatMap((c) => (c.items.length ? c.items.map((i) => [tr(`books:integrity.key.${c.key}`), i.label, i.expected / 100, i.actual / 100]) : [[tr(`books:integrity.key.${c.key}`), c.ok ? tr('books:integrity.ok') : '', (c.expected ?? 0) / 100, (c.actual ?? 0) / 100]])),
          )
        }
      >
        <HeroFigure
          label={failed.length ? tr('books:integrity.problems', { count: failed.length }) : tr('books:integrity.allGood')}
          value={tr('books:integrity.asOf', { date: formatDate(res.asOf) })}
          tone={failed.length ? 'bad' : 'good'}
        />
        <Card padded={false}>
          {res.checks.map((c, i) => (
            <ListRow
              key={c.key}
              title={tr(`books:integrity.key.${c.key}`)}
              subtitle={
                c.expected !== undefined && c.actual !== undefined && c.expected !== c.actual
                  ? tr('books:integrity.expectedActual', { expected: m(c.expected), actual: m(c.actual) })
                  : tr(`books:integrity.hint.${c.key}`)
              }
              right={<Badge label={c.ok ? tr('books:integrity.ok') : tr('books:integrity.notOk', { count: c.items.length || 1 })} tone={c.ok ? 'success' : 'danger'} size="sm" />}
              divider={i < res.checks.length - 1}
            />
          ))}
        </Card>
        {failed
          .filter((c) => c.items.length)
          .map((c) => (
            <ReportSection key={c.key} title={tr(`books:integrity.key.${c.key}`)}>
              <Card padded={false}>{c.items.map((item, i) => itemRow(c, item, i === c.items.length - 1))}</Card>
            </ReportSection>
          ))}
      </ReportShell>
    </>
  );
}
