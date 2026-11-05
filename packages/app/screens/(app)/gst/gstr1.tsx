import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Segmented } from '@esmart/ui/components/Field';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { ReportShell, reportTable, useReportScope } from '../../../features/reports/ReportShell';
import { deliverFile } from '../../../features/reports/exportFiles';
import { gstr1Json } from '../../../remote/exports';
import { DataTable, KeyFigures, ReportSection } from '../../../features/reports/reportParts';
import {
  NIL_SUPPLY_LABELS,
  Gstr1Row,
  Gstr1Summary,
  Gstr1Table,
  consolidateB2cs,
  gstr1Summary,
} from '@esmart/core/domain/gstr1';
import { useActiveCompany, useBaseCurrency } from '../../../store/selectors';
import { useReportData } from '../../../remote/queries';
import { formatMoney, formatPercent, formatQty } from '@esmart/core/lib/format';
import { money, toMajor } from '@esmart/core/lib/money';

type View_ = Gstr1Table | 'hsn' | 'nil' | 'docs' | 'at';

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
];

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
  const advanceRows = [
    ...summary.advances.received.map((r) => ({ table: '11A', ...r })),
    ...summary.advances.adjusted.map((r) => ({ table: '11B', ...r })),
  ];
  const tableRows =
    view === 'at'
      ? advanceRows.map((r) => [r.table, r.placeOfSupply, formatPercent(r.rate), m(r.taxable), m(r.igst + r.cgst + r.sgst + r.cess)])
      : view === 'b2cs'
      ? b2cs.map((l) => [l.placeOfSupplyName, l.supplyType, formatPercent(l.rate), formatMoney(l.taxableValue), m(l.cgst.minor + l.sgst.minor + l.igst.minor + l.cess.minor)])
      : view === 'hsn'
      ? summary.hsn.map((h) => [
          h.hsnCode,
          formatQty(h.quantity),
          formatMoney(h.taxableValue),
          formatMoney(h.totalValue),
        ])
      : view === 'nil'
        ? summary.nil.map((n) => [tr(`compliance:gstr1.nil.${n.supplyType}`), formatMoney(n.nilRated), formatMoney(n.exempt), formatMoney(n.nonGst)])
        : view === 'docs'
          ? summary.docs.map((d) => [tr(NATURE_KEY[d.nature]), `${d.from} – ${d.to}`, String(d.total), String(d.cancelled), String(d.total - d.cancelled)])
          : rowsFor(view).map((r) => [
              r.number,
              r.gstin ? r.gstin.slice(0, 2) + '…' + r.gstin.slice(-4) : r.placeOfSupply,
              formatPercent(r.rate),
              formatMoney(r.taxableValue),
              m(r.cgst.minor + r.sgst.minor + r.igst.minor),
            ]);

  const headers =
    view === 'at'
      ? [tr('compliance:gstr1.col.table'), tr('compliance:gstr1.col.pos'), tr('compliance:gstr1.col.rate'), tr('compliance:gstr1.col.taxable'), tr('common:table.tax')]
      : view === 'b2cs'
      ? [tr('compliance:gstr1.col.pos'), tr('compliance:gstr1.col.supply'), tr('compliance:gstr1.col.rate'), tr('compliance:gstr1.col.taxable'), tr('common:table.tax')]
      : view === 'hsn'
      ? ['HSN', tr('compliance:gstr1.col.qty'), tr('compliance:gstr1.col.taxable'), tr('common:table.total')]
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
          : [
              tr('compliance:gstr1.col.document'),
              view === 'b2b' || view === 'cdnr' ? 'GSTIN' : tr('compliance:gstr1.col.pos'),
              tr('compliance:gstr1.col.rate'),
              tr('compliance:gstr1.col.taxable'),
              tr('common:table.tax'),
            ];

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
        ['HSN', 'Description', 'UQC', 'Quantity', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total'],
        summary.hsn.map((h) => [
          h.hsnCode,
          h.description,
          h.unit,
          h.quantity,
          toMajor(h.taxableValue),
          toMajor(h.cgst),
          toMajor(h.sgst),
          toMajor(h.igst),
          toMajor(h.totalValue),
        ]),
      );
    }
    return reportTable(
      ['GSTIN', 'Customer', 'Document', 'Date', 'Place of supply', 'Rate', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Invoice value'],
      rowsFor(view).map((r) => [
        r.gstin ?? 'URP',
        r.partyName,
        r.number,
        r.date,
        r.placeOfSupplyName,
        r.rate,
        toMajor(r.taxableValue),
        toMajor(r.cgst),
        toMajor(r.sgst),
        toMajor(r.igst),
        toMajor(r.invoiceValue),
      ]),
    );
  };

  // The portal's file is a month's return, so the month the range starts in.
  const exportJson = async () => {
    const [y, mo] = scope.filters.range.from.split('-');
    const period = `${mo}${y}`;
    await deliverFile(`GSTR1_${company.taxRegistration?.identifier ?? company.id}_${period}.json`, await gstr1Json(company.id, period), 'application/json');
  };

  const count =
    view === 'at' ? advanceRows.length : view === 'hsn' ? summary.hsn.length : view === 'nil' ? summary.nil.length : view === 'docs' ? summary.docs.length : view === 'b2cs' ? b2cs.length : rowsFor(view).length;

  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.gstr1') }} />
      <ReportShell
        title="GSTR-1"
        subtitle={tr('compliance:gstr1.outwardSupplies')}
        scope={scope}
        onScopeChange={setScope}
        exportRows={exportRows}
        extraExports={[{ key: 'gstn-json', icon: 'code-json', label: tr('compliance:gstr1.exportJson'), run: exportJson }]}
      >
        <KeyFigures
          rows={[
            { label: tr('compliance:gstr1.documents'), value: String(summary.totals.documents) },
            { label: tr('common:totals.taxableValue'), value: formatMoney(summary.totals.taxableValue) },
            { label: tr('common:table.tax'), value: formatMoney(summary.totals.tax) },
          ]}
        />

        <View style={{ height: t.spacing.lg }} />

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
                  : `${VIEWS.find((v) => v.value === view)?.label} — ${tr(`compliance:gstr1.table.${view}`)}`}
        </Text>

        <View style={{ height: t.spacing.md }} />

        {count === 0 ? (
          <Card padded={false}>
            <EmptyState
              illustration="no-documents"
              icon="file-send-outline"
              title={tr('compliance:gstr1.emptyTable')}
              message={tr('compliance:gstr1.emptyTableBody')}
              compact
            />
          </Card>
        ) : (
          <ReportSection title={tr('compliance:gstr1.rows', { count })}>
            <DataTable headers={headers} rows={tableRows} widths={[1.4, 1.2, 0.7, 1.1, 1]} />
          </ReportSection>
        )}
      </ReportShell>
    </>
  );
}
