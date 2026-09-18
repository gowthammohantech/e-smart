import React, { useMemo } from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from '@/components/Card';
import { BarChart, RankedBars } from '@/components/charts/BarChart';
import { seriesColor } from '@/theme/chartColors';
import { ReportShell, toCsv, useReportScope } from '@/features/reports/ReportShell';
import { HeroFigure, KeyFigures, ReportSection } from '@/features/reports/reportParts';
import { summarizeDocuments, summarizePayments } from '@/domain/reports';
import { PAYMENT_METHOD_LABELS } from '@/data/masters';
import { formatMoney, formatQty } from '@/lib/format';
import { monthLabel } from '@/lib/date';
import { toMajor } from '@/lib/money';
import {
  useBaseCurrency,
  useBranches,
  useDocuments,
  useItems,
  useParties,
  usePaymentAccounts,
  usePayments,
} from '@/store/selectors';

export default function SalesSummaryReport() {
  const t = useTheme();
  const { scope, setScope } = useReportScope('last90');

  const baseCurrency = useBaseCurrency();
  const documents = useDocuments();
  const items = useItems();
  const parties = useParties();
  const branches = useBranches();
  const payments = usePayments();
  const accounts = usePaymentAccounts();

  const branchNames = useMemo(() => Object.fromEntries(branches.map((b) => [b.id, b.name])), [branches]);
  const accountNames = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);

  const sales = useMemo(
    () =>
      summarizeDocuments(
        documents.filter((d) => d.kind === 'invoice'),
        parties,
        items,
        branchNames,
        baseCurrency,
        scope.filters,
      ),
    [documents, parties, items, branchNames, baseCurrency, scope.filters],
  );

  const collected = useMemo(
    () => summarizePayments(payments, accountNames, PAYMENT_METHOD_LABELS, baseCurrency, scope.filters),
    [payments, accountNames, baseCurrency, scope.filters],
  );

  const exportRows = () =>
    toCsv(
      ['Number', 'Date', 'Customer', 'Taxable', 'Tax', 'Total', 'IRN'],
      sales.documents.map((d) => [
        d.number,
        d.date,
        parties.find((p) => p.id === d.partyId)?.name ?? '',
        toMajor(d.totals.taxableAmount),
        toMajor(d.totals.totalTax),
        toMajor(d.totals.grandTotal),
        d.compliance?.eInvoice?.irn ?? '',
      ]),
    );

  return (
    <>
      <Stack.Screen options={{ title: 'Sales summary' }} />
      <ReportShell
        title="Sales summary"
        subtitle="Invoiced value against what has actually been collected."
        scope={scope}
        onScopeChange={setScope}
        showPartyFilter
        exportRows={exportRows}
      >
        <HeroFigure
          label="Total invoiced"
          value={sales.total}
          caption={`${sales.count} invoices · avg ${formatMoney({
            minor: sales.count ? Math.round(sales.total.minor / sales.count) : 0,
            currency: baseCurrency,
          })}`}
        />

        <ReportSection title="By month">
          <Card>
            <BarChart
              data={sales.byMonth.map((r) => ({ label: monthLabel(r.key), value: r.value }))}
              caption="Invoiced value"
            />
          </Card>
        </ReportSection>

        <ReportSection title="Breakdown">
          <KeyFigures
            rows={[
              { label: 'Taxable value', value: formatMoney(sales.taxable) },
              { label: 'GST charged', value: formatMoney(sales.tax) },
              { label: 'Discounts given', value: formatMoney(sales.discount), tone: 'good' },
              { label: 'Collected', value: formatMoney(collected.received), tone: 'good' },
            ]}
          />
        </ReportSection>

        <ReportSection title="Top customers">
          <Card>
            <RankedBars
              rows={sales.byParty.slice(0, 8).map((r) => ({
                label: r.label,
                value: r.value,
                sublabel: `${r.count} invoices`,
              }))}
              colorFor={(i) => seriesColor(t.scheme, i)}
            />
          </Card>
        </ReportSection>

        <ReportSection title="Top items">
          <Card>
            <RankedBars
              rows={sales.byItem.slice(0, 8).map((r) => ({
                label: r.label,
                value: r.value,
                sublabel: `${formatQty(r.count)} units`,
              }))}
              colorFor={(i) => seriesColor(t.scheme, i)}
            />
          </Card>
        </ReportSection>

        {branches.length > 1 ? (
          <ReportSection title="By branch">
            <Card>
              <RankedBars rows={sales.byBranch} colorFor={(i) => seriesColor(t.scheme, i)} />
            </Card>
          </ReportSection>
        ) : null}
      </ReportShell>
    </>
  );
}
