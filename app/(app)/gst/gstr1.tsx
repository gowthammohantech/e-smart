import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Segmented } from '@/components/Field';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ReportShell, toCsv, useReportScope } from '@/features/reports/ReportShell';
import { DataTable, KeyFigures, ReportSection } from '@/features/reports/reportParts';
import {
  GSTR1_TABLE_LABELS,
  Gstr1Row,
  Gstr1Table,
  gstr1Summary,
} from '@/domain/gst/returns';
import { useActiveCompany, useBaseCurrency, useDocuments, useItems, useParties } from '@/store/selectors';
import { formatMoney, formatPercent, formatQty } from '@/lib/format';
import { inRange } from '@/lib/date';
import { toMajor } from '@/lib/money';

type View_ = Gstr1Table | 'hsn';

const VIEWS: { value: View_; label: string }[] = [
  { value: 'b2b', label: 'B2B' },
  { value: 'b2cl', label: 'B2CL' },
  { value: 'b2cs', label: 'B2CS' },
  { value: 'cdnr', label: 'CDNR' },
  { value: 'hsn', label: 'HSN' },
];

/**
 * GSTR-1, the outward-supplies return. Every sale lands in exactly one table,
 * chosen by who the buyer is and — for unregistered buyers — whether the
 * supply crossed a state line above ₹2.5 lakh.
 */
export default function Gstr1Report() {
  const t = useTheme();
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
        documents: documents.filter((d) => inRange(d.date, scope.filters.range)),
        parties,
        items,
        currency: baseCurrency,
      }),
    [company, documents, parties, items, baseCurrency, scope.filters.range],
  );

  const rowsFor = (table: Gstr1Table): Gstr1Row[] => summary[table];

  const tableRows =
    view === 'hsn'
      ? summary.hsn.map((h) => [
          h.hsnCode,
          formatQty(h.quantity),
          formatMoney(h.taxableValue),
          formatMoney(h.totalValue),
        ])
      : rowsFor(view).map((r) => [
          r.number,
          r.gstin ? r.gstin.slice(0, 2) + '…' + r.gstin.slice(-4) : r.placeOfSupply,
          formatPercent(r.rate),
          formatMoney(r.taxableValue),
          formatMoney({ minor: r.cgst.minor + r.sgst.minor + r.igst.minor, currency: baseCurrency }),
        ]);

  const headers =
    view === 'hsn'
      ? ['HSN', 'Qty', 'Taxable', 'Total']
      : ['Document', view === 'b2b' || view === 'cdnr' ? 'GSTIN' : 'PoS', 'Rate', 'Taxable', 'Tax'];

  const exportRows = () => {
    if (view === 'hsn') {
      return toCsv(
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
    return toCsv(
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

  const count = view === 'hsn' ? summary.hsn.length : rowsFor(view).length;

  return (
    <>
      <Stack.Screen options={{ title: 'GSTR-1' }} />
      <ReportShell
        title="GSTR-1"
        subtitle="Outward supplies"
        scope={scope}
        onScopeChange={setScope}
        exportRows={exportRows}
      >
        <KeyFigures
          rows={[
            { label: 'Documents', value: String(summary.totals.documents) },
            { label: 'Taxable value', value: formatMoney(summary.totals.taxableValue) },
            { label: 'Tax', value: formatMoney(summary.totals.tax) },
          ]}
        />

        <View style={{ height: t.spacing.lg }} />

        <Segmented size="sm" value={view} onChange={(v) => setView(v as View_)} options={VIEWS} />

        <View style={{ height: t.spacing.md }} />

        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          {view === 'hsn'
            ? 'Quantities and values rolled up by HSN, as table 12 of the return wants them.'
            : GSTR1_TABLE_LABELS[view]}
        </Text>

        <View style={{ height: t.spacing.md }} />

        {count === 0 ? (
          <Card padded={false}>
            <EmptyState
              illustration="no-documents"
              icon="file-send-outline"
              title="Nothing in this table"
              message="No document in the selected period falls into it."
              compact
            />
          </Card>
        ) : (
          <ReportSection title={`${count} row${count === 1 ? '' : 's'}`}>
            <DataTable headers={headers} rows={tableRows} widths={[1.4, 1.2, 0.7, 1.1, 1]} />
          </ReportSection>
        )}
      </ReportShell>
    </>
  );
}
