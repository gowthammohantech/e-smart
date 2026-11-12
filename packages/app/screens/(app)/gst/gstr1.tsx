import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { PickerField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ReportShell, useReportScope, ReportFailed, failedQuery } from '../../../features/reports/ReportShell';
import { deliverFile } from '../../../features/reports/exportFiles';
import { gstr1Json } from '../../../remote/exports';
import { DataTable, KeyFigures, ReportSection } from '../../../features/reports/reportParts';
import { Gstr1Summary, gstr1RateSummary, gstr1Summary } from '@esmart/core/domain/gstr1';
import { periodLabel } from '../../../features/compliance/periods';
import { GSTR1_SECTIONS, useGstr1Sections, type Gstr1Section } from '../../../features/compliance/gstr1Sections';
import { useActiveCompany, useBaseCurrency, useBranches } from '../../../store/selectors';
import { useReportData } from '../../../remote/queries';
import { formatMoney, formatPercent } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { ReportSkeleton } from '../../../components/ScreenSkeleton';

/**
 * GSTR-1, the outward-supplies return. Every sale lands in exactly one table,
 * chosen by who the buyer is and — for unregistered buyers — whether the
 * supply crossed a state line above the B2CL limit.
 */
export default function Gstr1Report() {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance', 'nav', 'common']);
  const { scope, setScope } = useReportScope('thisMonth');
  const [monthOpen, setMonthOpen] = useState(false);
  // GSTR-1 is filed month by month: any of the last two years' months can be picked (MMYYYY).
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return `${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
    });
  }, []);
  const pickMonth = (p: string) => {
    const yy = Number(p.slice(2));
    const mm = Number(p.slice(0, 2));
    const last = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
    setScope({ preset: 'custom', filters: { ...scope.filters, range: { from: `${p.slice(2)}-${p.slice(0, 2)}-01`, to: last } } });
  };

  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  // Worked out on the server for the range and branch, by the same core gstr1Summary.
  const remote = useReportData<Gstr1Summary>('gstr1', { ...scope.filters.range, branchId: scope.filters.branchId });
  const emptySummary = useMemo(
    () => gstr1Summary({ company, documents: [], parties: [], items: [], baseCurrency, period: scope.filters.range, advances: [] }),
    [company, baseCurrency, scope.filters.range],
  );
  const summary = remote.data ?? emptySummary;

  const { totals, detail } = useGstr1Sections(summary);
  // The section opened from the summary, whose rows show under it.
  const [view, setView] = useState<Gstr1Section>('b2b');
  const shown = detail(view);
  const exportRows = shown.exportRows;
  const rates = useMemo(() => gstr1RateSummary(summary, baseCurrency), [summary, baseCurrency]);

  const m = (minor: number | null) => (minor === null ? '—' : formatMoney(money(minor, baseCurrency)));
  const taxHeads = ['IGST', 'CGST', 'SGST', tr('compliance:gstr1.col.cess')];
  const taxCells = (igst: number, cgst: number, sgst: number, cess: number) => [m(igst), m(cgst), m(sgst), m(cess)];
  const sectionName = (s: Gstr1Section) => `${GSTR1_SECTIONS.find((x) => x.value === s)?.label ?? s} — ${tr(`compliance:gstr1.section.${s}`)}`;
  const sectionTables = (s: Gstr1Section) => {
    const x = GSTR1_SECTIONS.find((y) => y.value === s);
    return x ? `${x.label} · ${tr('compliance:gstr1.col.tables')} ${x.tables}` : s;
  };
  // Named as the books name them, the return's short name and table numbers under each.
  const summaryRows = totals.map((r) => [
    tr(`compliance:gstr1.section.${r.section}`),
    String(r.records),
    m(r.taxable),
    m(r.igst),
    m(r.cgst),
    m(r.sgst),
    m(r.cess),
    r.igst === null ? '—' : m((r.igst ?? 0) + (r.cgst ?? 0) + (r.sgst ?? 0) + (r.cess ?? 0)),
  ]);

  // The portal's file is one registration's return for one month. It is offered only when it holds what
  // the screen shows: the range is a whole month, and the branch picked (or, with none, every branch)
  // files under one GSTIN.
  const branches = useBranches();
  const { from, to } = scope.filters.range;
  const [y, mo] = from.split('-');
  const period = `${mo}${y}`;
  const wholeMonth = from.endsWith('-01') && to === new Date(Date.UTC(Number(y), Number(mo), 0)).toISOString().slice(0, 10);
  const companyGstin = company.taxRegistration?.identifier;
  const picked = scope.filters.branchId ? branches.find((b) => b.id === scope.filters.branchId) : undefined;
  // No branches listed (yet): the business files under its own GSTIN.
  const gstins = new Set(picked || branches.length ? (picked ? [picked] : branches).map((b) => b.gstin || companyGstin).filter(Boolean) : [companyGstin].filter(Boolean));
  const jsonGstin = gstins.size === 1 ? [...gstins][0] : undefined;
  const exportJson = async () => {
    await deliverFile(`GSTR1_${jsonGstin ?? company.id}_${period}.json`, await gstr1Json(company.id, period, jsonGstin), 'application/json');
  };

  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.gstr1') }} />
      <ReportShell
        title="GSTR-1"
        subtitle={tr('compliance:gstr1.outwardSupplies')}
        scope={scope}
        onScopeChange={setScope}
        // Figures that failed to load aren't offered as a file.
        exportRows={failedQuery(remote) ? undefined : exportRows}
        extraExports={wholeMonth && jsonGstin ? [{ key: 'gstn-json', icon: 'code-json', label: tr('compliance:gstr1.exportJson'), run: exportJson }] : []}
      >
        {/* The return is for a month: pick it here (the range above also takes a custom span). */}
        <PickerField
          label={tr('compliance:gstr1.month')}
          value={wholeMonth ? periodLabel(period) : undefined}
          placeholder={tr('compliance:gstr1.pickMonth')}
          onPress={() => setMonthOpen(true)}
          icon="calendar-month-outline"
          hint={wholeMonth ? undefined : tr('compliance:gstr1.notWholeMonth')}
        />
        <View style={{ height: t.spacing.lg }} />
        {/* The first answer still on its way: shapes, not a return of zeros. A failure says so. */}
        {failedQuery(remote) ? (
          <ReportFailed onRetry={remote.refetch} />
        ) : !remote.data ? (
          <ReportSkeleton />
        ) : (
        <>
        <KeyFigures
          rows={[
            { label: tr('compliance:gstr1.documents'), value: String(summary.totals.documents) },
            { label: tr('common:totals.taxableValue'), value: formatMoney(summary.totals.taxableValue) },
            { label: tr('common:table.tax'), value: formatMoney(summary.totals.tax) },
          ]}
        />

        <View style={{ height: t.spacing.lg }} />

        {/* The return section by section, as the books lay it out: each line opens what it holds. */}
        <ReportSection title={tr('compliance:gstr1.summary')}>
          <DataTable
            headers={[tr('compliance:gstr1.col.section'), tr('compliance:gstr1.col.records'), tr('compliance:gstr1.col.taxable'), ...taxHeads, tr('compliance:gstr1.col.totalTax')]}
            rows={summaryRows}
            subtitles={totals.map((r) => sectionTables(r.section))}
            firstWidth={260}
            widths={[2.4, 0.6, 1.1, 1, 1, 1, 0.7, 1]}
            kinds={['text', 'num', 'num', 'num', 'num', 'num', 'num', 'num']}
            minWidth={980}
            strong={[totals.findIndex((r) => r.section === view)]}
            onRowPress={(i) => setView(totals[i].section)}
            rowLabel={(i) => sectionName(totals[i].section)}
          />
          <Text variant="caption" tone="muted" style={{ marginTop: t.spacing.sm, lineHeight: 18 }}>
            {tr('compliance:gstr1.summaryHint')}
          </Text>
        </ReportSection>

        <View style={{ height: t.spacing.lg }} />

        {rates.length ? (
          <>
            <ReportSection title={tr('compliance:gstr1.rateSummary')}>
              <DataTable
                headers={[tr('compliance:gstr1.col.rate'), tr('compliance:gstr1.documents'), tr('compliance:gstr1.col.taxable'), ...taxHeads]}
                rows={rates.map((l) => [formatPercent(l.rate), String(l.documents), formatMoney(l.taxableValue), ...taxCells(l.igst.minor, l.cgst.minor, l.sgst.minor, l.cess.minor)])}
                widths={[0.7, 1.1, 1.2, 1, 1, 1, 0.8]}
                minWidth={720}
              />
              <Text variant="caption" tone="muted" style={{ marginTop: t.spacing.sm, lineHeight: 18 }}>
                {tr('compliance:gstr1.rateSummaryNote')}
              </Text>
            </ReportSection>
            <View style={{ height: t.spacing.lg }} />
          </>
        ) : null}

        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          {shown.note}
        </Text>

        <View style={{ height: t.spacing.md }} />

        {shown.count === 0 ? (
          <Card padded={false}>
            <EmptyState
              illustration="no-documents"
              icon="file-send-outline"
              title={tr('compliance:gstr1.emptyTable')}
              message={view === 'amend' ? tr('compliance:gstr1.emptyAmendBody') : tr('compliance:gstr1.emptyTableBody')}
              compact
            />
          </Card>
        ) : (
          <ReportSection title={`${sectionName(view)} · ${tr('compliance:gstr1.rows', { count: shown.count })}`}>
            <DataTable headers={shown.headers} rows={shown.rows} widths={shown.widths} minWidth={shown.minWidth} kinds={shown.kinds} paged />
          </ReportSection>
        )}
        </>
        )}
      </ReportShell>
      <SelectSheet
        visible={monthOpen}
        onClose={() => setMonthOpen(false)}
        title={tr('compliance:gstr1.month')}
        options={months.map((p) => ({ value: p, label: periodLabel(p) }))}
        value={wholeMonth ? period : undefined}
        onSelect={pickMonth}
        searchable={false}
      />
    </>
  );
}
