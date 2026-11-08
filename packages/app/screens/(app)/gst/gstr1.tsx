import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { PickerField, Segmented } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ReportShell, reportTable, useReportScope, ReportFailed, failedQuery } from '../../../features/reports/ReportShell';
import { deliverFile } from '../../../features/reports/exportFiles';
import { gstr1Json } from '../../../remote/exports';
import { DataTable, KeyFigures, ReportSection } from '../../../features/reports/reportParts';
import {
  NIL_SUPPLY_LABELS,
  Gstr1Row,
  Gstr1Summary,
  Gstr1Table,
  consolidateB2cs,
  gstr1RateSummary,
  gstr1Summary,
} from '@esmart/core/domain/gstr1';
import type { AmendTable } from '@esmart/core/domain/gstr1Amend';
import { periodLabel } from '../../../features/compliance/periods';
import { useActiveCompany, useBaseCurrency, useBranches } from '../../../store/selectors';
import { useReportData } from '../../../remote/queries';
import { formatMoney, formatPercent, formatQty } from '@esmart/core/lib/format';
import { money, toMajor } from '@esmart/core/lib/money';
import { ReportSkeleton } from '../../../components/ScreenSkeleton';

type View_ = Gstr1Table | 'hsn' | 'nil' | 'docs' | 'at' | 'amend';

const VIEWS: { value: View_; label: string }[] = [
  { value: 'b2b', label: 'B2B' },
  { value: 'b2cl', label: 'B2CL' },
  { value: 'b2cs', label: 'B2CS' },
  { value: 'exp', label: 'EXP' },
  { value: 'cdnr', label: 'CDNR' },
  { value: 'cdnur', label: 'CDNUR' },
  { value: 'nil', label: 'NIL' },
  { value: 'hsn', label: 'HSN' },
  { value: 'docs', label: 'DOCS' },
  { value: 'at', label: '11A/B' },
  { value: 'amend', label: 'AMEND' },
];

const AMEND_TABLES: AmendTable[] = ['b2ba', 'b2cla', 'expa', 'cdnra', 'cdnura'];
/** Every view but NIL and DOCS carries a column per tax head. */
const TAX_HEADS = ['IGST', 'CGST', 'SGST'];

// The exported file keeps the GSTN offline tool's English column names and
// values, so it lines up with what the portal expects; the screen translates.
const NATURE_LABEL = { invoice: 'Invoices', creditNote: 'Credit notes', debitNote: 'Debit notes' } as const;
const NATURE_KEY = { invoice: 'compliance:gstr1.invoices', creditNote: 'compliance:gstr1.creditNotes', debitNote: 'compliance:gstr1.debitNotes' } as const;

/**
 * GSTR-1, the outward-supplies return. Every sale lands in exactly one table,
 * chosen by who the buyer is and — for unregistered buyers — whether the
 * supply crossed a state line above the B2CL limit.
 */
export default function Gstr1Report() {
  const t = useTheme();
  const { t: tr } = useTranslation(['compliance', 'nav', 'common']);
  const { scope, setScope } = useReportScope('thisMonth');
  const [view, setView] = useState<View_>('b2b');
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

  const rowsFor = (table: Gstr1Table): Gstr1Row[] => summary[table];
  // Table 7 is filed per place of supply and rate, net of the credit notes against it.
  const b2cs = useMemo(
    () => consolidateB2cs(summary.b2cs, company.taxRegistration?.placeOfSupplyStateCode, baseCurrency),
    [summary.b2cs, company, baseCurrency],
  );

  const m = (minor: number) => formatMoney(money(minor, baseCurrency));
  const f = (x: { minor: number }) => formatMoney(money(x.minor, baseCurrency));
  /** IGST, CGST, SGST and cess, the four columns each table ends in. */
  const taxCells = (igst: number, cgst: number, sgst: number, cess: number) => [m(igst), m(cgst), m(sgst), m(cess)];
  const taxHeads = [...TAX_HEADS, tr('compliance:gstr1.col.cess')];
  const advanceRows = [
    ...summary.advances.received.map((r) => ({ table: '11A', ...r })),
    ...summary.advances.adjusted.map((r) => ({ table: '11B', ...r })),
  ];
  const rates = useMemo(() => gstr1RateSummary(summary, baseCurrency), [summary, baseCurrency]);
  const amend = summary.amendments;
  // Each amended document as reported again (B2BA … CDNURA), then B2CSA by original month, place and rate.
  const amendRows = AMEND_TABLES.flatMap((table) => (amend?.[table] ?? []).map((r) => ({ table: table.toUpperCase(), r })));
  const b2csa = (amend?.b2csa ?? []).flatMap((x) =>
    consolidateB2cs(x.rows, company.taxRegistration?.placeOfSupplyStateCode, baseCurrency).map((l) => ({ originalPeriod: x.originalPeriod, l })),
  );
  const shortGstin = (g?: string) => (g ? g.slice(0, 2) + '…' + g.slice(-4) : undefined);

  const tableRows =
    view === 'at'
      ? advanceRows.map((r) => [r.table, r.placeOfSupply, formatPercent(r.rate), m(r.taxable), ...taxCells(r.igst, r.cgst, r.sgst, r.cess)])
      : view === 'b2cs'
      ? b2cs.map((l) => [l.placeOfSupplyName, l.supplyType, formatPercent(l.rate), formatMoney(l.taxableValue), ...taxCells(l.igst.minor, l.cgst.minor, l.sgst.minor, l.cess.minor)])
      : view === 'hsn'
      ? summary.hsn.map((h) => [
          h.hsnCode,
          formatQty(h.quantity),
          formatMoney(h.taxableValue),
          ...taxCells(h.igst.minor, h.cgst.minor, h.sgst.minor, h.cess.minor),
          formatMoney(h.totalValue),
        ])
      : view === 'nil'
        ? summary.nil.map((n) => [tr(`compliance:gstr1.nil.${n.supplyType}`), formatMoney(n.nilRated), formatMoney(n.exempt), formatMoney(n.nonGst)])
        : view === 'docs'
          ? summary.docs.map((d) => [tr(NATURE_KEY[d.nature]), `${d.from} – ${d.to}`, String(d.total), String(d.cancelled), String(d.total - d.cancelled)])
          : view === 'amend'
            ? [
                ...amendRows.map(({ table, r }) => [
                  table,
                  `${r.originalNumber} · ${periodLabel(r.originalPeriod)}`,
                  shortGstin(r.gstin) ?? r.placeOfSupplyName,
                  formatPercent(r.rate),
                  f(r.taxableValue),
                  ...taxCells(r.igst.minor, r.cgst.minor, r.sgst.minor, r.cess.minor),
                ]),
                ...b2csa.map(({ originalPeriod, l }) => [
                  'B2CSA',
                  periodLabel(originalPeriod),
                  l.placeOfSupplyName,
                  formatPercent(l.rate),
                  formatMoney(l.taxableValue),
                  ...taxCells(l.igst.minor, l.cgst.minor, l.sgst.minor, l.cess.minor),
                ]),
              ]
            : rowsFor(view).map((r) => [
                r.number,
                shortGstin(r.gstin) ?? r.placeOfSupply,
                formatPercent(r.rate),
                formatMoney(r.taxableValue),
                ...taxCells(r.igst.minor, r.cgst.minor, r.sgst.minor, r.cess.minor),
              ]);

  const headers =
    view === 'at'
      ? [tr('compliance:gstr1.col.table'), tr('compliance:gstr1.col.pos'), tr('compliance:gstr1.col.rate'), tr('compliance:gstr1.col.taxable'), ...taxHeads]
      : view === 'b2cs'
      ? [tr('compliance:gstr1.col.pos'), tr('compliance:gstr1.col.supply'), tr('compliance:gstr1.col.rate'), tr('compliance:gstr1.col.taxable'), ...taxHeads]
      : view === 'hsn'
      ? ['HSN', tr('compliance:gstr1.col.qty'), tr('compliance:gstr1.col.taxable'), ...taxHeads, tr('common:table.total')]
      : view === 'nil'
        ? [tr('compliance:gstr1.col.supply'), tr('compliance:gstr1.col.nilRated'), tr('compliance:gstr1.col.exempt'), tr('compliance:gstr1.col.nonGst')]
        : view === 'docs'
          ? [
              tr('compliance:gstr1.col.nature'),
              tr('compliance:gstr1.col.series'),
              tr('common:table.total'),
              tr('compliance:gstr1.col.cancelled'),
              tr('compliance:gstr1.col.net'),
            ]
          : view === 'amend'
            ? [tr('compliance:gstr1.col.table'), tr('compliance:gstr1.col.original'), 'GSTIN / PoS', tr('compliance:gstr1.col.rate'), tr('compliance:gstr1.col.taxable'), ...taxHeads]
            : [
                tr('compliance:gstr1.col.document'),
                view === 'b2b' || view === 'cdnr' ? 'GSTIN' : tr('compliance:gstr1.col.pos'),
                tr('compliance:gstr1.col.rate'),
                tr('compliance:gstr1.col.taxable'),
                ...taxHeads,
              ];
  const widths =
    view === 'nil' || view === 'docs'
      ? [1.4, 1.2, 0.8, 0.8, 0.8]
      : view === 'amend'
        ? [0.8, 1.6, 1.1, 0.6, 1.1, 1, 1, 1, 0.8]
        : view === 'hsn'
          ? [1.1, 0.7, 1.1, 1, 1, 1, 0.8, 1.1]
          : [1.4, 1.1, 0.6, 1.1, 1, 1, 1, 0.8];

  // Which columns are words (numbers, places, series) rather than amounts.
  const T = 'text' as const;
  const N = 'num' as const;
  const kinds =
    view === 'at' || view === 'b2cs'
      ? [T, T, N, N, N, N, N, N]
      : view === 'hsn'
        ? [T, N, N, N, N, N, N, N]
        : view === 'nil'
          ? [T, N, N, N]
          : view === 'docs'
            ? [T, T, N, N, N]
            : view === 'amend'
              ? [T, T, T, N, N, N, N, N, N]
              : [T, T, N, N, N, N, N, N];

  const exportRows = () => {
    if (view === 'at') {
      return reportTable(
        ['Table', 'Place of supply', 'Rate', 'Gross advance', 'IGST', 'CGST', 'SGST', 'Cess'],
        advanceRows.map((r) => [r.table, r.placeOfSupply, r.rate, r.taxable / 100, r.igst / 100, r.cgst / 100, r.sgst / 100, r.cess / 100]),
      );
    }
    if (view === 'b2cs') {
      return reportTable(
        ['Type', 'Place of supply', 'Rate', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Cess'],
        b2cs.map((l) => ['OE', l.placeOfSupplyName, l.rate, toMajor(l.taxableValue), toMajor(l.igst), toMajor(l.cgst), toMajor(l.sgst), toMajor(l.cess)]),
      );
    }
    if (view === 'nil') {
      return reportTable(
        ['Supply type', 'Nil rated', 'Exempted', 'Non-GST'],
        summary.nil.map((n) => [NIL_SUPPLY_LABELS[n.supplyType], toMajor(n.nilRated), toMajor(n.exempt), toMajor(n.nonGst)]),
      );
    }
    if (view === 'docs') {
      return reportTable(
        ['Nature of document', 'From', 'To', 'Total number', 'Cancelled', 'Net issued'],
        summary.docs.map((d) => [NATURE_LABEL[d.nature], d.from, d.to, d.total, d.cancelled, d.total - d.cancelled]),
      );
    }
    if (view === 'hsn') {
      return reportTable(
        ['HSN', 'Description', 'UQC', 'Quantity', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Cess', 'Total'],
        summary.hsn.map((h) => [
          h.hsnCode,
          h.description,
          h.unit,
          h.quantity,
          toMajor(h.taxableValue),
          toMajor(h.igst),
          toMajor(h.cgst),
          toMajor(h.sgst),
          toMajor(h.cess),
          toMajor(h.totalValue),
        ]),
      );
    }
    if (view === 'amend') {
      return reportTable(
        ['Table', 'Original number', 'Original date', 'Original period', 'GSTIN', 'Revised number', 'Revised date', 'Place of supply', 'Rate', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Cess', 'Invoice value'],
        [
          ...amendRows.map(({ table, r }) => [table, r.originalNumber, r.originalDate, r.originalPeriod, r.gstin ?? 'URP', r.number, r.date, r.placeOfSupplyName, r.rate, toMajor(r.taxableValue), toMajor(r.igst), toMajor(r.cgst), toMajor(r.sgst), toMajor(r.cess), toMajor(r.invoiceValue)]),
          ...b2csa.map(({ originalPeriod, l }) => ['B2CSA', '', '', originalPeriod, '', '', '', l.placeOfSupplyName, l.rate, toMajor(l.taxableValue), toMajor(l.igst), toMajor(l.cgst), toMajor(l.sgst), toMajor(l.cess), '']),
        ],
      );
    }
    return reportTable(
      ['GSTIN', 'Customer', 'Document', 'Date', 'Place of supply', 'Rate', 'Taxable value', 'IGST', 'CGST', 'SGST', 'Cess', 'Invoice value'],
      rowsFor(view).map((r) => [
        r.gstin ?? 'URP',
        r.partyName,
        r.number,
        r.date,
        r.placeOfSupplyName,
        r.rate,
        toMajor(r.taxableValue),
        toMajor(r.igst),
        toMajor(r.cgst),
        toMajor(r.sgst),
        toMajor(r.cess),
        toMajor(r.invoiceValue),
      ]),
    );
  };

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
  const gstins = new Set((picked ? [picked] : branches).map((b) => b.gstin || companyGstin).filter(Boolean));
  const jsonGstin = gstins.size === 1 ? [...gstins][0] : undefined;
  const exportJson = async () => {
    await deliverFile(`GSTR1_${jsonGstin ?? company.id}_${period}.json`, await gstr1Json(company.id, period, jsonGstin), 'application/json');
  };

  const count =
    view === 'amend' ? amendRows.length + b2csa.length : view === 'at' ? advanceRows.length : view === 'hsn' ? summary.hsn.length : view === 'nil' ? summary.nil.length : view === 'docs' ? summary.docs.length : view === 'b2cs' ? b2cs.length : rowsFor(view).length;

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

        {/* Nine tables do not fit a phone's width side by side; let them scroll. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, minWidth: VIEWS.length * 64 }}>
          <View style={{ flex: 1 }}>
            <Segmented size="sm" value={view} onChange={(v) => setView(v as View_)} options={VIEWS} />
          </View>
        </ScrollView>

        <View style={{ height: t.spacing.md }} />

        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          {view === 'hsn'
            ? tr('compliance:gstr1.hsnNote')
            : view === 'nil'
              ? tr('compliance:gstr1.nilNote')
              : view === 'docs'
                ? tr('compliance:gstr1.docsNote')
                : view === 'at'
                  ? tr('compliance:gstr1.advancesNote')
                  : view === 'amend'
                    ? tr('compliance:gstr1.amendNote')
                  : `${VIEWS.find((v) => v.value === view)?.label} — ${tr(`compliance:gstr1.table.${view}`)}`}
        </Text>

        <View style={{ height: t.spacing.md }} />

        {count === 0 ? (
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
          <ReportSection title={tr('compliance:gstr1.rows', { count })}>
            <DataTable
              headers={headers}
              rows={tableRows}
              widths={widths}
              minWidth={view === 'nil' ? 480 : view === 'docs' ? 560 : 760}
              kinds={kinds}
              paged
            />
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
