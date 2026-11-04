import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Share, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import type { Schema } from '@esmart/api-contract';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { PickerField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { api } from '../../../remote/api';
import { describeError } from '../../../remote/errors';
import { useActiveCompany, useParties } from '../../../store/selectors';
import { periodLabel, recentPeriods } from '../../../features/compliance/periods';
import { KeyFigures } from '../../../features/reports/reportParts';

type Rec = Schema<'Gstr2bReconciliation'>;
type Row = NonNullable<Rec['rows']>[number];
type Status = NonNullable<Row['status']>;

const ORDER: Status[] = ['partial', 'probable', 'missingInBooks', 'matched', 'claimLater', 'notOurs'];
const TONE: Record<Status, 'success' | 'warning' | 'danger' | 'neutral'> = { matched: 'success', partial: 'warning', probable: 'warning', missingInBooks: 'danger', claimLater: 'neutral', notOurs: 'neutral' };

/**
 * GSTR-2B against the purchase register: what suppliers reported, matched to the bills entered. A person
 * settles what the matcher couldn't, chases suppliers for bills not in 2B, then claims the credit.
 */
export default function Gstr2bScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['compliance', 'nav']);
  const company = useActiveCompany();
  const suppliers = useParties('supplier');
  const path = { companyId: company.id };
  const periods = useMemo(() => recentPeriods(), []);
  const [gstins, setGstins] = useState<string[]>([]);
  const [gstin, setGstin] = useState<string | null>(null);
  const [period, setPeriod] = useState(periods[0]);
  const [rec, setRec] = useState<Rec | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<'gstin' | 'period' | null>(null);

  useEffect(() => {
    api.GET('/companies/{companyId}/gst/portal-sessions', { params: { path } }).then(({ data }) => {
      const list = (data?.data ?? []).map((s) => s.gstin!);
      setGstins(list);
      setGstin((g) => g ?? list[0] ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);

  const load = useCallback(() => {
    if (!gstin) return Promise.resolve();
    return api.GET('/companies/{companyId}/gst/gstr2b', { params: { path, query: { gstin, period } } }).then(({ data, error }) => {
      if (error) toast.show(describeError(error, tr), 'error');
      else setRec(data ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstin, period, company.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (step: () => Promise<{ error?: unknown; data?: unknown }>, done?: string) => {
    setBusy(true);
    try {
      const { error } = await step();
      if (error) toast.show(describeError(error, tr), 'error');
      else {
        if (done) toast.show(done, 'success', { icon: 'check-all' });
        await load();
      }
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(false);
    }
  };
  const fetch2b = () => gstin && act(() => api.POST('/companies/{companyId}/gst/gstr2b/fetch', { params: { path }, body: { gstin, period } }), tr('compliance:gstr2b.fetched'));
  const decide = (row: Row, decision: 'accepted' | 'notOurs' | 'claimLater' | 'undecided') =>
    act(() => api.PUT('/companies/{companyId}/gst/gstr2b/lines/{id}/decision', { params: { path: { ...path, id: row.id! } }, body: { decision, documentId: row.bill?.documentId } }));
  const claim = () => gstin && act(() => api.POST('/companies/{companyId}/gst/gstr2b/claim', { params: { path }, body: { gstin, period } }), tr('compliance:gstr2b.claimed'));
  const addBill = (row: Row) => {
    const party = suppliers.find((s) => s.taxId === row.supplierGstin);
    const q = new URLSearchParams({ ...(party && { partyId: party.id }), supplierDocNumber: row.number ?? '', date: row.date ?? '' });
    router.push(`/(app)/purchases/bills/new?${q.toString()}` as never);
  };
  const chase = () => {
    const bills = rec?.missingIn2b ?? [];
    const lines = bills.map((b) => `${b.supplierNumber} · ${formatDate(b.date!)} · ${formatMoney(b.tax!)}`);
    void Share.share({ message: `${tr('compliance:gstr2b.chaseMessage', { period: periodLabel(period) })}\n\n${lines.join('\n')}` });
  };

  const rows = [...(rec?.rows ?? [])].sort((a, b) => ORDER.indexOf(a.status!) - ORDER.indexOf(b.status!));
  const s = rec?.summary;

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.gstr2b') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        {!gstins.length ? (
          <EmptyState icon="link-variant-off" title={tr('compliance:gstr2b.notConnected')} message={tr('compliance:gstr2b.notConnectedBody')} actionLabel={tr('nav:title.gstPortal')} onAction={() => router.push('/(app)/settings/gst-portal')} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              {gstins.length > 1 ? (
                <View style={{ flex: 1 }}>
                  <PickerField label="GSTIN" value={gstin ?? undefined} onPress={() => setOpen('gstin')} />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <PickerField label={tr('compliance:gstr2b.period')} value={periodLabel(period)} onPress={() => setOpen('period')} icon="calendar-month-outline" />
              </View>
            </View>
            <Button title={rec?.fetched ? tr('compliance:gstr2b.refetch') : tr('compliance:gstr2b.fetch')} icon="cloud-download-outline" onPress={() => void fetch2b()} loading={busy} variant={rec?.fetched ? 'secondary' : 'primary'} />
            {rec?.fetched && s ? (
              <>
                <Text variant="caption" tone="muted">
                  {tr('compliance:gstr2b.fetchedAt', { date: formatDate(rec.fetchedAt!) })}
                </Text>
                <KeyFigures
                  rows={[
                    { label: tr('compliance:gstr2b.claimable'), value: formatMoney(s.claimableTax!), tone: 'good' },
                    { label: tr('compliance:gstr2b.matchedCount'), value: `${s.matched} / ${s.lines}` },
                    { label: tr('compliance:gstr2b.toReview'), value: String((s.partial ?? 0) + (s.probable ?? 0) + (s.missingInBooks ?? 0)), tone: 'warn' },
                    { label: tr('compliance:gstr2b.notIn2b'), value: String(s.missingIn2b), tone: s.missingIn2b ? 'bad' : undefined },
                  ]}
                />
                <Button title={tr('compliance:gstr2b.claim')} icon="check-all" onPress={() => void claim()} disabled={busy || !s.matched} />
                {rows.map((row) => (
                  <Card key={row.id} style={{ gap: t.spacing.sm }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: t.spacing.md }}>
                      <Text variant="body" weight="600" style={{ flex: 1 }} numberOfLines={1}>
                        {row.supplierName ?? row.supplierGstin}
                      </Text>
                      <Badge label={tr(`compliance:gstr2b.status.${row.status!}`)} tone={TONE[row.status!]} size="sm" />
                    </View>
                    <Text variant="caption" tone="muted">
                      {`${row.number} · ${formatDate(row.date!)} · ${formatMoney(row.taxable!)} + ${formatMoney(row.tax!)}${row.itcAvailable ? '' : ` · ${tr('compliance:gstr2b.itcUnavailable')}`}`}
                    </Text>
                    {row.bill ? (
                      <Text variant="caption">
                        {tr('compliance:gstr2b.yourBill', { number: row.bill.number, supplierNumber: row.bill.supplierNumber, tax: formatMoney(row.bill.tax!) })}
                      </Text>
                    ) : null}
                    {row.difference ? (
                      <Text variant="caption" tone="warn">
                        {tr('compliance:gstr2b.differs', { tax: formatMoney(row.difference.tax!), days: row.difference.days })}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
                      {(row.status === 'partial' || row.status === 'probable') && row.bill ? <Button title={tr('compliance:gstr2b.accept')} size="sm" onPress={() => void decide(row, 'accepted')} /> : null}
                      {row.status === 'missingInBooks' ? <Button title={tr('compliance:gstr2b.addBill')} size="sm" onPress={() => addBill(row)} /> : null}
                      {row.status !== 'matched' && row.status !== 'notOurs' && row.status !== 'claimLater' ? (
                        <>
                          <Button title={tr('compliance:gstr2b.later')} size="sm" variant="secondary" onPress={() => void decide(row, 'claimLater')} />
                          <Button title={tr('compliance:gstr2b.notOurs')} size="sm" variant="secondary" onPress={() => void decide(row, 'notOurs')} />
                        </>
                      ) : null}
                      {row.decision ? <Button title={tr('compliance:gstr2b.undo')} size="sm" variant="ghost" onPress={() => void decide(row, 'undecided')} /> : null}
                    </View>
                  </Card>
                ))}
                {rec.missingIn2b?.length ? (
                  <Card style={{ gap: t.spacing.sm }}>
                    <Text variant="body" weight="600">
                      {tr('compliance:gstr2b.notIn2bTitle', { count: rec.missingIn2b.length })}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {tr('compliance:gstr2b.notIn2bBody')}
                    </Text>
                    {rec.missingIn2b.map((b) => (
                      <Text key={b.documentId} variant="caption">
                        {`${b.supplierNumber} · ${formatDate(b.date!)} · ${formatMoney(b.tax!)}`}
                      </Text>
                    ))}
                    <Button title={tr('compliance:gstr2b.chase')} icon="share-variant" variant="secondary" onPress={chase} />
                  </Card>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      <SelectSheet visible={open === 'gstin'} onClose={() => setOpen(null)} title="GSTIN" options={gstins.map((g) => ({ value: g, label: g }))} value={gstin} onSelect={setGstin} searchable={false} />
      <SelectSheet visible={open === 'period'} onClose={() => setOpen(null)} title={tr('compliance:gstr2b.period')} options={periods.map((p) => ({ value: p, label: periodLabel(p) }))} value={period} onSelect={setPeriod} searchable={false} />
    </View>
  );
}
