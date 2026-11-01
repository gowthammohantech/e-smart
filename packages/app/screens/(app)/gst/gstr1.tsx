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
import { DataTable, KeyFigures, ReportSection } from '../../../features/reports/reportParts';
import {
  NIL_SUPPLY_LABELS,
  Gstr1Row,
  Gstr1Table,
  gstr1Summary,
} from '@esmart/core/domain/gstr1';
import { useActiveCompany, useBaseCurrency, useDocuments, useItems, useParties } from '../../../store/selectors';
import { formatMoney, formatPercent, formatQty } from '@esmart/core/lib/format';
import { toMajor } from '@esmart/core/lib/money';

type View_ = Gstr1Table | 'hsn' | 'nil' | 'docs';

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
];

// The exported file keeps the GSTN offline tool's English column names and
// values, so it lines up with what the portal expects; the screen translates.
const NATURE_LABEL = { invoice: 'Invoices', creditNote: 'Credit notes' } as const;
const NATURE_KEY = { invoice: 'compliance:gstr1.invoices', creditNote: 'compliance:gstr1.creditNotes' } as const;

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
  const documents = useDocuments();
  const parties = useParties();
  const items = useItems();

  const summary = useMemo(
    () =>
      gstr1Summary({
        company,
        documents: scope.filters.branchId ? documents.filter((d) => d.branchId === scope.filters.branchId) : documents,
        parties,
        items,
        baseCurrency,
        period: scope.filters.range,
      }),
    [company, documents, parties, items, baseCurrency, scope.filters.range, scope.filters.branchId],
  );

  const rowsFor = (table: Gstr1Table): Gstr1Row[] => summary[table];

  // Credit notes filed under B2CS reduce it, so they show as negatives.
  const signed = (r: Gstr1Row, m: { minor: number }) =>
    formatMoney({ minor: (r.kind === 'salesReturn' && view === 'b2cs' ? -1 : 1) * m.minor, currency: baseCurrency });

  const tableRows =
    view === 'hsn'
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
              signed(r, r.taxableValue),
              signed(r, { minor: r.cgst.minor + r.sgst.minor + r.igst.minor }),
            ]);

  const headers =
    view === 'hsn'
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

  const count =
    view === 'hsn' ? summary.hsn.length : view === 'nil' ? summary.nil.length : view === 'docs' ? summary.docs.length : rowsFor(view).length;

  return (
    <>
      <Stack.Screen options={{ title: tr('nav:title.gstr1') }} />
      <ReportShell
        title="GSTR-1"
        subtitle={tr('compliance:gstr1.outwardSupplies')}
        scope={scope}
        onScopeChange={setScope}
        exportRows={exportRows}
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
