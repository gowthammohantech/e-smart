import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { Text } from '@esmart/ui/components/Text';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { gstr1Summary, type Gstr1Summary } from '@esmart/core/domain/gstr1';
import { ReportFailed, ReportShell, failedQuery, useReportScope } from '../../../../features/reports/ReportShell';
import { DataTable, KeyFigures, ReportSection } from '../../../../features/reports/reportParts';
import { GSTR1_SECTIONS, isGstr1Section, useGstr1Sections } from '../../../../features/compliance/gstr1Sections';
import { detailRouteFor } from '../../../../features/documents/DocumentEditor';
import { useActiveCompany, useBaseCurrency } from '../../../../store/selectors';
import { useReportData } from '../../../../remote/queries';
import { ReportSkeleton } from '../../../../components/ScreenSkeleton';

/**
 * One section of GSTR-1 (B2B, B2CL … AMEND) in detail, opened from the return's summary for the
 * same month and branch: what it adds up to, and every row behind that. A row that is a document
 * (an invoice, a note) opens it.
 */
export default function Gstr1SectionReport() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['compliance', 'nav', 'common']);
  const params = useLocalSearchParams<{ section?: string }>();
  const section = isGstr1Section(params.section) ? params.section : undefined;
  const { scope, setScope } = useReportScope('thisMonth');

  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  // The same figures as the summary, so coming from it they are already here.
  const remote = useReportData<Gstr1Summary>('gstr1', { ...scope.filters.range, branchId: scope.filters.branchId });
  const emptySummary = useMemo(
    () => gstr1Summary({ company, documents: [], parties: [], items: [], baseCurrency, period: scope.filters.range, advances: [] }),
    [company, baseCurrency, scope.filters.range],
  );
  const { totals, detail } = useGstr1Sections(remote.data ?? emptySummary);

  const meta = GSTR1_SECTIONS.find((s) => s.value === section);
  const shown = section ? detail(section) : undefined;
  const line = totals.find((r) => r.section === section);
  const m = (minor: number | null | undefined) => (minor == null ? '—' : formatMoney(money(minor, baseCurrency)));
  const title = meta ? `${meta.label} — ${tr(`compliance:gstr1.section.${meta.value}`)}` : 'GSTR-1';
  // Back to the summary for the same month and branch: the query string carries them.
  const { section: _section, ...query } = params as Record<string, string | undefined>;
  const back = () => router.push({ pathname: '/(app)/gst/gstr1', params: query } as never);
  const opens = shown?.documents.some(Boolean);

  return (
    <>
      <Stack.Screen options={{ title: meta ? `GSTR-1 · ${meta.label}` : tr('nav:title.gstr1') }} />
      <ReportShell
        title={title}
        subtitle={meta ? `GSTR-1 · ${tr('compliance:gstr1.col.tables')} ${meta.tables}` : undefined}
        scope={scope}
        onScopeChange={setScope}
        exportRows={shown && !failedQuery(remote) ? shown.exportRows : undefined}
      >
        {!section || !shown ? (
          <Card padded={false}>
            <EmptyState icon="file-question-outline" title={tr('compliance:gstr1.unknownSection')} actionLabel={tr('compliance:gstr1.backToSummary')} onAction={back} compact />
          </Card>
        ) : failedQuery(remote) ? (
          <ReportFailed onRetry={remote.refetch} />
        ) : !remote.data ? (
          <ReportSkeleton />
        ) : (
          <>
            <KeyFigures
              rows={[
                { label: tr('compliance:gstr1.col.records'), value: String(line?.records ?? 0) },
                ...(line?.taxable != null ? [{ label: tr('common:totals.taxableValue'), value: m(line.taxable) }] : []),
                ...(line?.igst != null ? [{ label: tr('compliance:gstr1.col.totalTax'), value: m((line.igst ?? 0) + (line.cgst ?? 0) + (line.sgst ?? 0) + (line.cess ?? 0)) }] : []),
              ]}
            />
            <View style={{ height: t.spacing.lg }} />
            <Text variant="caption" tone="muted" style={{ lineHeight: 18, marginBottom: t.spacing.md }}>
              {opens ? `${shown.note}. ${tr('compliance:gstr1.openDocumentHint')}` : shown.note}
            </Text>
            {shown.count === 0 ? (
              <Card padded={false}>
                <EmptyState
                  illustration="no-documents"
                  icon="file-send-outline"
                  title={tr('compliance:gstr1.emptyTable')}
                  message={section === 'amend' ? tr('compliance:gstr1.emptyAmendBody') : tr('compliance:gstr1.emptyTableBody')}
                  compact
                />
              </Card>
            ) : (
              <ReportSection title={tr('compliance:gstr1.rows', { count: shown.count })}>
                <DataTable
                  headers={shown.headers}
                  rows={shown.rows}
                  subtitles={shown.subtitles}
                  total={shown.total}
                  widths={shown.widths}
                  minWidth={shown.minWidth}
                  kinds={shown.kinds}
                  firstWidth={shown.subtitles ? 240 : undefined}
                  paged
                  onRowPress={
                    opens
                      ? (i) => {
                          const d = shown.documents[i];
                          if (d) router.push(detailRouteFor(d.kind, d.id) as never);
                        }
                      : undefined
                  }
                  rowLabel={(i) => shown.rows[i][0]}
                />
              </ReportSection>
            )}
          </>
        )}
      </ReportShell>
    </>
  );
}
