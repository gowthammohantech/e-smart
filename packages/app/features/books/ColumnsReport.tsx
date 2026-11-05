import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Segmented } from '@esmart/ui/components/Field';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { variance, type BalanceSheetColumns, type ColumnRow, type ProfitAndLossColumns } from '@esmart/core/domain/ledger/comparative';
import { DataTable, ReportSection } from '../reports/reportParts';
import { useBooksView } from '../../remote/queries';
import { useBaseCurrency } from '../../store/selectors';
import { useAccountName } from './names';
import type { Account } from '@esmart/core/domain/ledger/accounts';

export type StatementView = 'single' | 'month' | 'quarter' | 'previousPeriod' | 'previousYear';
const VIEWS: StatementView[] = ['single', 'month', 'quarter', 'previousPeriod', 'previousYear'];

/** Choose between the single statement and its columns: by month, by quarter, or against an earlier period. */
export function StatementViewPicker({ value, onChange, balanceSheet }: { value: StatementView; onChange: (v: StatementView) => void; balanceSheet?: boolean }) {
  const { t: tr } = useTranslation(['books']);
  return (
    <Segmented
      options={VIEWS.map((v) => ({ value: v, label: tr(`books:columns.view.${balanceSheet && (v === 'month' || v === 'quarter') ? (`${v}End` as const) : v}`) }))}
      value={value}
      onChange={(v) => onChange(v as StatementView)}
    />
  );
}

const queryOf = (view: StatementView) =>
  view === 'month' || view === 'quarter' ? { breakdown: view } : view === 'previousPeriod' || view === 'previousYear' ? { compare: view } : {};

/**
 * The P&L or the balance sheet with a column per period, each worked out on the server as the single
 * statement for that period. Set against one earlier period, a last column shows the change.
 */
export function ColumnsReport({ kind, range, view }: { kind: 'profit-loss' | 'balance-sheet'; range: { from: string; to: string }; view: Exclude<StatementView, 'single'> }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['books']);
  const baseCurrency = useBaseCurrency();
  const nameOf = useAccountName();
  const data = useBooksView<ProfitAndLossColumns | BalanceSheetColumns>(kind, { ...range, ...queryOf(view) }).data;
  if (!data) return <ActivityIndicator color={t.c.muted} style={{ padding: t.spacing.xl }} />;

  const m = (minor: number) => formatMoney(money(minor, baseCurrency));
  const comparing = view === 'previousPeriod' || view === 'previousYear';
  // With two columns, the change from the earlier one, and as a percentage of it.
  const change = (values: number[]) => {
    const v = variance(values[1] ?? 0, values[0] ?? 0);
    return `${v.amount >= 0 ? '+' : '−'}${m(Math.abs(v.amount))}${v.percent === null ? '' : ` (${v.percent > 0 ? '+' : ''}${v.percent}%)`}`;
  };
  const line = (label: string, values: number[], minus = false) => [label, ...values.map((v) => (minus && v ? `− ${m(v)}` : m(v))), ...(comparing ? [change(minus ? values.map((x) => -x) : values)] : [])];
  const accountRows = (rows: ColumnRow[], minus = false) => rows.map((r) => line(nameOf({ key: r.key, name: r.name, kind: (r.key.startsWith('sys:') ? 'system' : 'party') as Account['kind'] }), r.values, minus));

  if (kind === 'profit-loss') {
    const pl = data as ProfitAndLossColumns;
    const headers = [tr('books:tb.account'), ...pl.periods.map((p) => (comparing ? `${p.from} – ${p.to}` : p.label)), ...(comparing ? [tr('books:columns.change')] : [])];
    const widths = [2, ...headers.slice(1).map(() => 1.2)];
    return (
      <>
        <ReportSection title={tr('books:pl.trading')}>
          <DataTable
            headers={headers}
            widths={widths}
            rows={[
              ...accountRows(pl.tradingIncome),
              line(tr('books:pl.closingStock'), pl.closingStock),
              line(tr('books:pl.openingStock'), pl.openingStock, true),
              ...accountRows(pl.tradingExpense, true),
              line(tr('books:pl.grossProfit'), pl.grossProfit),
            ]}
          />
        </ReportSection>
        <ReportSection title={tr('books:pl.indirect')}>
          <DataTable headers={headers} widths={widths} rows={[...accountRows(pl.indirectIncome), ...accountRows(pl.indirectExpense, true), line(tr('books:pl.netProfit'), pl.netProfit)]} />
        </ReportSection>
      </>
    );
  }

  const bs = data as BalanceSheetColumns;
  const headers = [tr('books:tb.account'), ...bs.dates, ...(comparing ? [tr('books:columns.change')] : [])];
  const widths = [2, ...headers.slice(1).map(() => 1.2)];
  const side = (groups: BalanceSheetColumns['assets']) =>
    groups.flatMap((g) => [line(tr(`books:bs.heading.${g.heading}` as 'books:bs.heading.capital').toUpperCase(), g.totals), ...accountRows(g.rows).map(([a, ...rest]) => [`   ${a}`, ...rest])]);
  return (
    <>
      <ReportSection title={tr('books:bs.liabilities')}>
        <DataTable headers={headers} widths={widths} rows={[...side(bs.liabilities), line(tr('books:bs.currentProfit'), bs.currentProfit), line(tr('books:bs.total'), bs.totalLiabilities)]} />
      </ReportSection>
      <ReportSection title={tr('books:bs.assets')}>
        <DataTable headers={headers} widths={widths} rows={[...side(bs.assets), line(tr('books:bs.total'), bs.totalAssets)]} />
      </ReportSection>
    </>
  );
}
