import React from 'react';
import { useTranslation } from 'react-i18next';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@esmart/ui/components/Button';
import { today } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { LoadingView } from '../../../../../components/LoadingView';
import { ReportShell, reportTable, useReportScope, ReportLoading } from '../../../../../features/reports/ReportShell';
import { DataTable, KeyFigures, ReportSection } from '../../../../../features/reports/reportParts';
import { useCanWrite } from '../../../../../remote/connectivity';
import { useBudget, useBudgetVariance } from '../../../../../remote/budgets';
import { useBaseCurrency } from '../../../../../store/selectors';

/** The budget against the books: planned, actual and the difference, account by account. */
export default function BudgetVarianceScreen() {
  const { t: tr } = useTranslation(['books']);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { scope, setScope } = useReportScope('thisFY');
  const currency = useBaseCurrency();
  const canWrite = useCanWrite();
  const budget = useBudget(id).data;
  // A year still running is set against the plan to date, not the whole year's plan.
  const now = today();
  const query = useBudgetVariance(id, { from: scope.filters.range.from, to: scope.filters.range.to > now ? now : scope.filters.range.to });
  const v = query.data;
  if (!budget) return <LoadingView variant="report" />;
  if (!v) return <ReportLoading title={budget.name} subtitle={tr('books:budgets.basis')} scope={scope} onScopeChange={setScope} />;
  const m = (minor: number) => formatMoney(money(minor, currency));
  const pct = (actual: number, plan: number) => (plan ? `${Math.round((actual / plan) * 100)}%` : '—');
  const signed = (n: number) => (n > 0 ? `+${m(n)}` : n < 0 ? `−${m(-n)}` : m(0));
  const section = (nature: 'income' | 'expense') => v.rows.filter((r) => r.nature === nature);
  const heads = [tr('books:budgets.account'), tr('books:budgets.planned'), tr('books:budgets.actual'), tr('books:budgets.difference'), tr('books:budgets.ofPlan')];
  const table = (nature: 'income' | 'expense') =>
    section(nature).map((r) => [r.account.name, m(r.budget), m(r.actual), `${signed(r.variance)} ${r.favourable ? '✓' : '!'}`, pct(r.actual, r.budget)]);
  return (
    <>
      <Stack.Screen options={{ title: budget.name }} />
      <ReportShell
        title={budget.name}
        subtitle={tr('books:budgets.basis')}
        scope={scope}
        onScopeChange={setScope}
        generatedAt={query.dataUpdatedAt}
        exportRows={() => reportTable(heads, v.rows.map((r) => [r.account.name, r.budget / 100, r.actual / 100, r.variance / 100, r.budget ? Math.round((r.actual / r.budget) * 100) : '']))}
      >
        <KeyFigures
          rows={[
            { label: tr('books:budgets.income'), value: `${m(v.income.actual)} / ${m(v.income.budget)}`, tone: v.income.actual >= v.income.budget ? 'good' : 'warn' },
            { label: tr('books:budgets.expense'), value: `${m(v.expense.actual)} / ${m(v.expense.budget)}`, tone: v.expense.actual <= v.expense.budget ? 'good' : 'warn' },
            { label: tr('books:budgets.profit'), value: `${m(v.profit.actual)} / ${m(v.profit.budget)}`, tone: v.profit.actual >= v.profit.budget ? 'good' : 'bad' },
          ]}
        />
        {canWrite ? <Button title={tr('books:budgets.edit')} icon="pencil-outline" variant="secondary" onPress={() => router.push(`/(app)/books/budgets/${budget.id}/edit` as never)} /> : null}
        {section('income').length ? (
          <ReportSection title={tr('books:budgets.income')}>
            <DataTable headers={heads} rows={table('income')} widths={[1.8, 1, 1, 1.2, 0.7]} />
          </ReportSection>
        ) : null}
        {section('expense').length ? (
          <ReportSection title={tr('books:budgets.expense')}>
            <DataTable headers={heads} rows={table('expense')} widths={[1.8, 1, 1, 1.2, 0.7]} />
          </ReportSection>
        ) : null}
      </ReportShell>
    </>
  );
}
