import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Segmented } from '@esmart/ui/components/Field';
import { formatMoney } from '@esmart/core/lib/format';
import { formatDate } from '@esmart/core/lib/date';
import { money } from '@esmart/core/lib/money';
import { variance, type BalanceSheetColumns, type ColumnRow, type ProfitAndLossColumns } from '@esmart/core/domain/ledger/comparative';
import { DataTable, ReportSection } from '../reports/reportParts';
import { useBooksView } from '../../remote/queries';
import { useBaseCurrency } from '../../store/selectors';
import { useAccountName } from './names';
import type { Account } from '@esmart/core/domain/ledger/accounts';
import { ReportSkeleton } from '../../components/ScreenSkeleton';
import { ReportFailed } from '../reports/ReportShell';
import { useIsDesktop } from '@esmart/ui/theme/breakpoints';

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

/** A row as shown (formatted) and as exported (amounts as numbers, so a spreadsheet can total them). */
type ColumnsLine = { shown: string[]; raw: (string | number)[] };
export type ColumnsSection = { title: string; headers: string[]; widths: number[]; rows: ColumnsLine[]; strong: number[]; total?: ColumnsLine };
export type ColumnsTables = { sections: ColumnsSection[] | undefined; failed: boolean; retry: () => unknown };

/**
 * The P&L or the balance sheet with a column per period, each worked out on the server as the single
 * statement for that period, as table sections. Set against one earlier period, a last column shows
 * the change. The screen shows them and exports the same rows.
 */
export function useColumnsTables(kind: 'profit-loss' | 'balance-sheet', range: { from: string; to: string }, view: StatementView): ColumnsTables {
  const { t: tr } = useTranslation(['books']);
  const baseCurrency = useBaseCurrency();
  const nameOf = useAccountName();
  const query = useBooksView<ProfitAndLossColumns | BalanceSheetColumns>(kind, { ...range, ...queryOf(view) }, view !== 'single');
  const data = query.data;
  const none = { sections: undefined, failed: view !== 'single' && query.isError && (!data || !!query.isPlaceholderData), retry: query.refetch };
  if (!data || view === 'single') return none;
  // While the columns load, the query still holds the single statement it showed before: wait for columns.
  if (kind === 'profit-loss' ? !('periods' in data) : !('dates' in data)) return none;

  const m = (minor: number) => formatMoney(money(minor, baseCurrency));
  const comparing = view === 'previousPeriod' || view === 'previousYear';
  // With two columns, the change from the earlier one, and as a percentage of it.
  const change = (values: number[]) => {
    const v = variance(values[1] ?? 0, values[0] ?? 0);
    return `${v.amount >= 0 ? '+' : '−'}${m(Math.abs(v.amount))}${v.percent === null ? '' : ` (${v.percent > 0 ? '+' : ''}${v.percent}%)`}`;
  };
  const line = (label: string, values: number[], minus = false): ColumnsLine => {
    const signed = minus ? values.map((x) => -x) : values;
    return {
      shown: [label, ...values.map((v) => (minus && v ? `− ${m(v)}` : m(v))), ...(comparing ? [change(signed)] : [])],
      raw: [label, ...signed.map((v) => v / 100), ...(comparing ? [variance(signed[1] ?? 0, signed[0] ?? 0).amount / 100] : [])],
    };
  };
  const accountRows = (rows: ColumnRow[], minus = false, indent = '') =>
    rows.map((r) => line(`${indent}${nameOf({ key: r.key, name: r.name, kind: (r.key.startsWith('sys:') ? 'system' : 'party') as Account['kind'] })}`, r.values, minus));
  const tableOf = (labels: string[]) => {
    const headers = [tr('books:tb.account'), ...labels, ...(comparing ? [tr('books:columns.change')] : [])];
    return { headers, widths: [2, ...headers.slice(1).map(() => 1.2)] };
  };

  if (kind === 'profit-loss') {
    const pl = data as ProfitAndLossColumns;
    const t = tableOf(pl.periods.map((p) => (comparing ? `${formatDate(p.from)} – ${formatDate(p.to)}` : p.label)));
    const gross = line(tr('books:pl.grossProfit'), pl.grossProfit);
    return {
      ...none,
      sections: [
        {
          title: tr('books:pl.trading'),
          ...t,
          rows: [...accountRows(pl.tradingIncome), line(tr('books:pl.closingStock'), pl.closingStock), line(tr('books:pl.openingStock'), pl.openingStock, true), ...accountRows(pl.tradingExpense, true)],
          strong: [],
          total: gross,
        },
        {
          title: tr('books:pl.indirect'),
          ...t,
          rows: [gross, ...accountRows(pl.indirectIncome), ...accountRows(pl.indirectExpense, true)],
          strong: [0],
          total: line(tr('books:pl.netProfit'), pl.netProfit),
        },
      ],
    };
  }
  const bs = data as BalanceSheetColumns;
  const t = tableOf(bs.dates.map((d) => formatDate(d)));
  // Each group's heading carries its totals, in bold; its accounts follow, indented.
  const side = (groups: BalanceSheetColumns['assets']) => groups.flatMap((g) => [line(tr(`books:bs.heading.${g.heading}` as 'books:bs.heading.capital'), g.totals), ...accountRows(g.rows, false, '   ')]);
  const headings = (groups: BalanceSheetColumns['assets']) => {
    const out: number[] = [];
    let at = 0;
    for (const g of groups) {
      out.push(at);
      at += 1 + g.rows.length;
    }
    return out;
  };
  const liabilities = [...side(bs.liabilities), line(tr('books:bs.currentProfit'), bs.currentProfit)];
  return {
    ...none,
    sections: [
      { title: tr('books:bs.liabilities'), ...t, rows: liabilities, strong: [...headings(bs.liabilities), liabilities.length - 1], total: line(tr('books:bs.total'), bs.totalLiabilities) },
      { title: tr('books:bs.assets'), ...t, rows: side(bs.assets), strong: headings(bs.assets), total: line(tr('books:bs.total'), bs.totalAssets) },
    ],
  };
}

/** The sections as one table for the export: each section's title on a row of its own, amounts as numbers. */
export function columnsExport(sections: ColumnsSection[]): { headers: string[]; rows: (string | number)[][] } {
  return {
    headers: sections[0]?.headers ?? [],
    rows: sections.flatMap((s) => [[s.title], ...s.rows.map((r) => r.raw), ...(s.total ? [s.total.raw] : [])]),
  };
}

export function ColumnsReport({ tables }: { tables: ColumnsTables }) {
  const desktop = useIsDesktop();
  if (tables.failed) return <ReportFailed onRetry={tables.retry} />;
  const sections = tables.sections;
  if (!sections) return <ReportSkeleton figures={0} cols={3} />;
  return (
    <>
      {sections.map((s) => {
        // Months side by side need more room than the page has: a column keeps a readable width and the table scrolls sideways.
        const minWidth = 220 + 150 * (s.headers.length - 1);
        const table = <DataTable headers={s.headers} widths={s.widths} rows={s.rows.map((r) => r.shown)} strong={s.strong} total={s.total?.shown} minWidth={minWidth} />;
        return (
          <ReportSection key={s.title} title={s.title}>
            {desktop ? (
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
                <View style={{ flex: 1, minWidth }}>{table}</View>
              </ScrollView>
            ) : (
              table
            )}
          </ReportSection>
        );
      })}
    </>
  );
}
