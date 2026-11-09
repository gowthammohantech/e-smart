import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
import { useActiveCompany, useBranches } from '../../../store/selectors';
import { CAN_PICK_FILES, pickFile } from '../../../features/import/pickFile';
import { DataTable, KeyFigures, ReportSection } from '../../../features/reports/reportParts';
import { deliverFile } from '../../../features/reports/exportFiles';
import { XLSX_MIME, toCsv, xlsxBytes } from '../../../features/reports/reportTable';
import { ReportFailed } from '../../../features/reports/ReportShell';
import { ReportSkeleton } from '../../../components/ScreenSkeleton';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useDocumentPages, usePartySearch } from '../../../remote/queries';
import { periodLabel, recentPeriods } from '../../../features/compliance/periods';

type Rec = Schema<'Gstr2bReconciliation'>;
type Row = NonNullable<Rec['rows']>[number];
type Status = NonNullable<Row['status']>;

const ORDER: Status[] = ['partial', 'probable', 'missingInBooks', 'matchedWithinTolerance', 'manuallyLinked', 'matched', 'claimed', 'claimLater', 'notOurs'];
const TONE: Record<Status, 'success' | 'warning' | 'danger' | 'neutral'> = {
  matched: 'success',
  matchedWithinTolerance: 'success',
  manuallyLinked: 'success',
  claimed: 'neutral',
  partial: 'warning',
  probable: 'warning',
  missingInBooks: 'danger',
  claimLater: 'neutral',
  notOurs: 'neutral',
};
/** Rows a person can still link to a bill of their own. */
const LINKABLE: Status[] = ['partial', 'probable', 'missingInBooks', 'matchedWithinTolerance'];
const KIND_OF = { I: 'purchaseBill', BOE: 'purchaseBill', ISD: 'purchaseBill', C: 'supplierCreditNote', D: 'supplierDebitNote' } as const;
/** A filter chip: one status, or the bills 2B doesn't have. */
type Filter = Status | 'missingIn2b' | 'all';

/** A GSTIN as the portal issues it: what the server files under. */
const isGstin = (g?: string | null): g is string => !!g && g.length === 15;

/** The status totals' order: settled first, then what needs a look. */
const TOTALS: Status[] = ['matched', 'matchedWithinTolerance', 'manuallyLinked', 'claimed', 'partial', 'probable', 'missingInBooks', 'claimLater', 'notOurs'];

/** GSTR-2B: download it through the portal session, or upload the file from the portal, and check its totals. */
export default function Gstr2bScreen() {
  return <Gstr2bView mode="download" />;
}

/**
 * GSTR-2B against the purchase register: what suppliers reported, matched to the bills entered.
 * `download` gets the period's 2B (through the portal session, or a file from the portal) and shows
 * its totals by status; `reconcile` is where a person settles what the matcher couldn't, chases
 * suppliers for bills not in 2B, then claims the credit.
 */
export function Gstr2bView({ mode }: { mode: 'download' | 'reconcile' }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['compliance', 'nav']);
  const company = useActiveCompany();
  const branches = useBranches();
  const path = { companyId: company.id };
  const periods = useMemo(() => recentPeriods(), []);
  const params = useLocalSearchParams<{ gstin?: string; period?: string }>();
  const [gstins, setGstins] = useState<string[]>([]);
  const [connectedTo, setConnectedTo] = useState<string[]>([]);
  const [gstin, setGstin] = useState<string | null>(isGstin(params.gstin) ? params.gstin : null);
  const [period, setPeriod] = useState(params.period && /^\d{6}$/.test(params.period) ? params.period : periods[0]);
  const [rec, setRec] = useState<Rec | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<'gstin' | 'period' | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [linking, setLinking] = useState<Row | null>(null);
  // Until the GSTINs are known, "no GSTIN" isn't said; until a period's 2B comes, the last one's isn't shown.
  const [gstinsLoaded, setGstinsLoaded] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'failed' | 'done'>('loading');
  // Claiming books the credit for the period: it is asked first.
  const [askClaim, setAskClaim] = useState(false);

  useEffect(() => {
    // Every GSTIN of the business, connected to the portal or not: a 2B file can be uploaded for any.
    const own = [company.taxRegistration?.identifier, ...branches.map((b) => b.gstin)].filter(isGstin);
    const settle = (sessions: Schema<'GstPortalSession'>[]) => {
      const list = [...new Set([...sessions.map((x) => x.gstin!).filter(isGstin), ...own])];
      setGstins(list);
      setConnectedTo(sessions.filter((x) => x.connected).map((x) => x.gstin!));
      // On the web this screen stays open across a business switch: keep the GSTIN only if it is this business's.
      setGstin((g) => (g && list.includes(g) ? g : list[0] ?? null));
      setGstinsLoaded(true);
    };
    api
      .GET('/companies/{companyId}/gst/portal-sessions', { params: { path } })
      .then(({ data }) => settle(data?.data ?? []))
      .catch(() => settle([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id, branches.length]);

  const load = useCallback(() => {
    if (!gstin) return Promise.resolve();
    return api
      .GET('/companies/{companyId}/gst/gstr2b', { params: { path, query: { gstin, period } } })
      .then(({ data }) => {
        setRec(data ?? null);
        setLoadState('done');
      })
      .catch(() => setLoadState('failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstin, period, company.id]);
  useEffect(() => {
    // Another period or GSTIN: what was on screen belongs to the last one.
    setRec(null);
    setLoadState('loading');
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
  const connected = !!gstin && connectedTo.includes(gstin);
  /** The JSON or Excel file the portal gives (Returns → GSTR-2B → Download), read on the server. */
  const upload2b = async () => {
    if (!gstin) return;
    const file = await pickFile(['.json', '.xlsx', 'application/json']);
    if (!file) return;
    await act(async () => api.POST('/companies/{companyId}/gst/gstr2b/import', { params: { path }, body: { gstin, period, fileName: file.name, contentBase64: await file.base64() } }), tr('compliance:gstr2b.uploaded'));
  };
  const fetch2b = () => gstin && act(() => api.POST('/companies/{companyId}/gst/gstr2b/fetch', { params: { path }, body: { gstin, period } }), tr('compliance:gstr2b.fetched'));
  const decide = (row: Row, decision: 'accepted' | 'notOurs' | 'claimLater' | 'undecided', documentId = row.bill?.documentId) =>
    act(() => api.PUT('/companies/{companyId}/gst/gstr2b/lines/{id}/decision', { params: { path: { ...path, id: row.id! } }, body: { decision, documentId } }));
  // The supplier's bills of the line's kind, not yet claimed: any of them can be the one 2B means.
  // The supplier is found on the server by GSTIN; a bill of entry names none, so any bill will do.
  const supplierQ = usePartySearch('supplier', linking?.supplierGstin ?? '', !!linking && linking.documentType !== 'BOE');
  const lineSupplier = supplierQ.data?.find((p) => p.taxId === linking?.supplierGstin);
  const boe = linking?.documentType === 'BOE';
  const supplierBills = useDocumentPages({ kinds: linking ? [KIND_OF[linking.documentType ?? 'I']] : [], partyId: boe ? undefined : lineSupplier?.id }, !!linking && (boe || !!lineSupplier));
  // Still finding the supplier or its bills: the sheet shimmers rather than say "no bills to link".
  const linkSearching =
    !!linking &&
    ((!boe && (supplierQ.isLoading || supplierQ.isPlaceholderData)) ||
      ((boe || !!lineSupplier) && (supplierBills.isLoading || supplierBills.isPlaceholderData)));
  const candidates = useMemo(
    () => (linking ? supplierBills.rows.filter((d) => !['draft', 'cancelled', 'rejected'].includes(d.status ?? '') && (!d.itcClaimPeriod || d.itcClaimPeriod === period)) : []),
    [linking, supplierBills.rows, period],
  );
  const claim = () => gstin && act(() => api.POST('/companies/{companyId}/gst/gstr2b/claim', { params: { path }, body: { gstin, period } }), tr('compliance:gstr2b.claimed'));
  const addBill = async (row: Row) => {
    // The supplier, found on the server by its GSTIN.
    const { data } = await api.GET('/companies/{companyId}/parties', { params: { path, query: { kind: 'supplier', q: row.supplierGstin, limit: 5 } } });
    const party = (data?.data ?? []).find((s) => s.taxId === row.supplierGstin);
    const q = new URLSearchParams({ ...(party && { partyId: party.id }), supplierDocNumber: row.number ?? '', date: row.date ?? '' });
    router.push(`/(app)/purchases/bills/new?${q.toString()}` as never);
  };
  /** Every line of 2B with what it matched in the books and why it differs, for the CA's working file. */
  const exportFile = (format: 'csv' | 'xlsx') => {
    const amount = (m?: { minor?: number }) => (m?.minor ?? 0) / 100;
    const table = {
      headers: ['Supplier GSTIN', 'Supplier', 'Type', 'Number', 'Date', 'Taxable (2B)', 'Tax (2B)', 'ITC available', 'Status', 'Differs in', 'Your bill', 'Supplier number (books)', 'Date (books)', 'Taxable (books)', 'Tax (books)'],
      rows: [
        ...all.map((r) => [
          r.supplierGstin ?? '',
          r.supplierName ?? '',
          r.documentType ?? '',
          r.number ?? '',
          r.date ?? '',
          amount(r.taxable),
          amount(r.tax),
          r.itcAvailable ? 'Yes' : 'No',
          filterLabel(r.status!),
          (r.reasons ?? []).map((x) => tr(`compliance:gstr2b.reason.${x}`)).join(', '),
          r.bill?.number ?? '',
          r.bill?.supplierNumber ?? '',
          r.bill?.date ?? '',
          r.bill ? amount(r.bill.taxable) : '',
          r.bill ? amount(r.bill.tax) : '',
        ]),
        ...(rec?.missingIn2b ?? []).map((b) => ['', '', b.kind ?? '', '', '', '', '', '', filterLabel('missingIn2b'), '', b.number ?? '', b.supplierNumber ?? '', b.date ?? '', amount(b.taxable), amount(b.tax)]),
      ],
    };
    void (format === 'xlsx'
      ? deliverFile(`gstr2b-${gstin}-${period}.xlsx`, xlsxBytes('GSTR-2B', table), XLSX_MIME)
      : deliverFile(`gstr2b-${gstin}-${period}.csv`, new TextEncoder().encode(toCsv(table)), 'text/csv'));
  };
  const chase = () => {
    const bills = rec?.missingIn2b ?? [];
    const lines = bills.map((b) => `${b.supplierNumber} · ${formatDate(b.date!)} · ${formatMoney(b.tax!)}`);
    void Share.share({ message: `${tr('compliance:gstr2b.chaseMessage', { period: periodLabel(period) })}\n\n${lines.join('\n')}` });
  };

  const all = [...(rec?.rows ?? [])].sort((a, b) => ORDER.indexOf(a.status!) - ORDER.indexOf(b.status!));
  const rows = filter === 'all' ? all : all.filter((r) => r.status === filter);
  const s = rec?.summary;
  const counts = new Map<Filter, number>([['all', all.length]]);
  for (const r of all) counts.set(r.status!, (counts.get(r.status!) ?? 0) + 1);
  if (rec?.missingIn2b?.length) counts.set('missingIn2b', rec.missingIn2b.length);
  const filterLabel = (f: Filter) => (f === 'all' ? tr('compliance:gstr2b.all') : f === 'missingIn2b' ? tr('compliance:gstr2b.notIn2b') : tr(`compliance:gstr2b.status.${f}`));
  const money0 = { minor: 0, currency: company.baseCurrency ?? 'INR' };
  const sum = (list: { minor?: number }[]) => ({ ...money0, minor: list.reduce((a, x) => a + (x.minor ?? 0), 0) });
  // Totals by status, to check against the portal's own 2B summary.
  const totals = [
    ...TOTALS.map((st) => {
      const of = all.filter((r) => r.status === st);
      return { key: st as Filter, count: of.length, taxable: sum(of.map((r) => r.taxable ?? money0)), tax: sum(of.map((r) => r.tax ?? money0)) };
    }).filter((x) => x.count),
    ...(rec?.missingIn2b?.length ? [{ key: 'missingIn2b' as Filter, count: rec.missingIn2b.length, taxable: sum(rec.missingIn2b.map((b) => b.taxable ?? money0)), tax: sum(rec.missingIn2b.map((b) => b.tax ?? money0)) }] : []),
  ];
  const in2b = { count: all.length, taxable: sum(all.map((r) => r.taxable ?? money0)), tax: sum(all.map((r) => r.tax ?? money0)) };
  const matchedTotal = (s?.matched ?? 0) + (s?.matchedWithinTolerance ?? 0) + (s?.manuallyLinked ?? 0) + (s?.claimed ?? 0);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: mode === 'reconcile' ? tr('nav:title.gstr2bReconciliation') : tr('nav:title.gstr2b') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        {!gstinsLoaded ? (
          <ReportSkeleton />
        ) : !gstins.length ? (
          <EmptyState icon="card-account-details-outline" title={tr('compliance:returns.noGstin')} message={tr('compliance:gstr2b.noGstinBody')} actionLabel={tr('compliance:returns.addGstin')} onAction={() => router.push('/(app)/settings/company')} />
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
            {loadState === 'failed' ? (
              <ReportFailed
                onRetry={() => {
                  setLoadState('loading');
                  return load();
                }}
              />
            ) : loadState === 'loading' ? (
              <ReportSkeleton figures={4} />
            ) : null}
            {loadState !== 'done' ? null : mode === 'download' ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
                  <Button
                    title={rec?.fetched ? tr('compliance:gstr2b.refetch') : tr('compliance:gstr2b.fetch')}
                    icon="cloud-download-outline"
                    onPress={() => void fetch2b()}
                    loading={busy}
                    disabled={!connected}
                    variant={rec?.fetched || !connected ? 'secondary' : 'primary'}
                    style={{ flexGrow: 1 }}
                  />
                  {CAN_PICK_FILES ? (
                    <Button title={tr('compliance:gstr2b.upload')} icon="file-upload-outline" onPress={() => void upload2b()} disabled={busy} variant={connected ? 'secondary' : 'primary'} style={{ flexGrow: 1 }} />
                  ) : null}
                </View>
                <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                  {connected ? tr('compliance:gstr2b.uploadHint') : tr('compliance:gstr2b.noSessionHint')}
                </Text>
              </>
            ) : !rec?.fetched ? (
              <EmptyState
                icon="file-compare"
                title={tr('compliance:gstr2b.nothingYet')}
                message={tr('compliance:gstr2b.nothingYetBody')}
                actionLabel={tr('nav:title.gstr2b')}
                onAction={() => router.push(`/(app)/gst/gstr2b?gstin=${gstin ?? ''}&period=${period}` as never)}
              />
            ) : null}
            {rec?.fetched && s ? (
              <>
                <Text variant="caption" tone="muted">
                  {tr('compliance:gstr2b.fetchedAt', { date: formatDate(rec.fetchedAt!) })}
                </Text>
                <KeyFigures
                  rows={[
                    { label: tr('compliance:gstr2b.claimable'), value: formatMoney(s.claimableTax!), tone: 'good' },
                    { label: tr('compliance:gstr2b.matchedCount'), value: `${matchedTotal} / ${s.lines}` },
                    { label: tr('compliance:gstr2b.toReview'), value: String((s.partial ?? 0) + (s.probable ?? 0) + (s.missingInBooks ?? 0)), tone: 'warn' },
                    { label: tr('compliance:gstr2b.notIn2b'), value: String(s.missingIn2b), tone: s.missingIn2b ? 'bad' : undefined },
                  ]}
                />
                <ReportSection title={tr('compliance:gstr2b.totals')}>
                  <DataTable
                    headers={[tr('compliance:gstr2b.head.status'), tr('compliance:gstr2b.head.count'), tr('compliance:returns.head.taxable'), tr('compliance:returns.head.tax')]}
                    widths={[1.8, 0.6, 1.2, 1.1]}
                    rows={totals.map((x) => [filterLabel(x.key), String(x.count), formatMoney(x.taxable), formatMoney(x.tax)])}
                    total={[tr('compliance:gstr2b.totalIn2b'), String(in2b.count), formatMoney(in2b.taxable), formatMoney(in2b.tax)]}
                  />
                  <Text variant="caption" tone="muted" style={{ marginTop: t.spacing.sm, lineHeight: 18 }}>
                    {tr('compliance:gstr2b.totalsNote')}
                  </Text>
                </ReportSection>
                {mode === 'download' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
                    <Button
                      title={tr('nav:title.gstr2bReconciliation')}
                      icon="file-compare"
                      onPress={() => router.push(`/(app)/gst/gstr2b-reconciliation?gstin=${gstin ?? ''}&period=${period}` as never)}
                      style={{ flexGrow: 1 }}
                    />
                    <Button title={tr('compliance:gstr2b.exportExcel')} icon="file-excel-box" variant="secondary" onPress={() => exportFile('xlsx')} disabled={!all.length} />
                    <Button title={tr('compliance:gstr2b.exportCsv')} icon="file-delimited-outline" variant="secondary" onPress={() => exportFile('csv')} disabled={!all.length} />
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
                      <Button title={tr('compliance:gstr2b.claim')} icon="check-all" onPress={() => setAskClaim(true)} loading={busy} disabled={busy || !matchedTotal} style={{ flexGrow: 1 }} />
                      <Button title={tr('compliance:gstr2b.exportExcel')} icon="file-excel-box" variant="secondary" onPress={() => exportFile('xlsx')} disabled={!all.length} />
                      <Button title={tr('compliance:gstr2b.exportCsv')} icon="file-delimited-outline" variant="secondary" onPress={() => exportFile('csv')} disabled={!all.length} />
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing.sm }}>
                      {(['all', ...ORDER, 'missingIn2b'] as Filter[])
                        .filter((f) => counts.get(f))
                        .map((f) => {
                          const active = filter === f;
                          return (
                            <Pressable
                              key={f}
                              onPress={() => setFilter(f)}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              style={{ paddingHorizontal: t.spacing.md, paddingVertical: 6, borderRadius: t.radius.pill, backgroundColor: active ? t.c.primary : t.c.card, borderWidth: active ? 0 : 1, borderColor: t.c.line }}
                            >
                              <Text variant="caption" weight="600" style={{ color: active ? t.c.onPrimary : t.c.muted }}>
                                {`${filterLabel(f)} · ${counts.get(f)}`}
                              </Text>
                            </Pressable>
                          );
                        })}
                    </ScrollView>
                    {filter === 'missingIn2b' ? null : rows.map((row) => (
                      <Card key={row.id} style={{ gap: t.spacing.sm }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: t.spacing.md }}>
                          <Text variant="body" weight="600" style={{ flex: 1 }} numberOfLines={1}>
                            {row.supplierName ?? row.supplierGstin}
                          </Text>
                          <Badge label={tr(`compliance:gstr2b.status.${row.status!}`)} tone={TONE[row.status!]} size="sm" />
                        </View>
                        {/* 2B and the books side by side: what the supplier reported, what was entered. */}
                        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text variant="caption" tone="muted" weight="700">
                              {tr('compliance:gstr2b.in2b')}
                            </Text>
                            <Text variant="caption">{`${row.number} · ${formatDate(row.date!)}`}</Text>
                            <Text variant="caption">{`${formatMoney(row.taxable!)} + ${formatMoney(row.tax!)}`}</Text>
                            {row.itcAvailable ? null : (
                              <Text variant="caption" tone="warn">
                                {tr('compliance:gstr2b.itcUnavailable')}
                              </Text>
                            )}
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text variant="caption" tone="muted" weight="700">
                              {tr('compliance:gstr2b.inBooks')}
                            </Text>
                            {row.bill ? (
                              <>
                                <Text variant="caption">{`${row.bill.supplierNumber} · ${formatDate(row.bill.date!)}`}</Text>
                                <Text variant="caption">{`${formatMoney(row.bill.taxable!)} + ${formatMoney(row.bill.tax!)}`}</Text>
                                <Text variant="caption" tone="muted">
                                  {row.bill.number}
                                </Text>
                              </>
                            ) : (
                              <Text variant="caption" tone="muted">
                                —
                              </Text>
                            )}
                          </View>
                        </View>
                        {row.reasons?.length ? (
                          <Text variant="caption" tone="warn">
                            {tr('compliance:gstr2b.differsIn', { what: row.reasons.map((r) => tr(`compliance:gstr2b.reason.${r}`)).join(', ') })}
                          </Text>
                        ) : null}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
                          {(row.status === 'partial' || row.status === 'probable') && row.bill ? <Button title={tr('compliance:gstr2b.accept')} size="sm" onPress={() => void decide(row, 'accepted')} /> : null}
                          {row.status === 'missingInBooks' ? <Button title={tr('compliance:gstr2b.addBill')} size="sm" onPress={() => void addBill(row)} /> : null}
                          {LINKABLE.includes(row.status!) ? <Button title={tr('compliance:gstr2b.link')} size="sm" variant="secondary" icon="link-variant" onPress={() => setLinking(row)} /> : null}
                          {['partial', 'probable', 'missingInBooks'].includes(row.status!) ? (
                            <>
                              <Button title={tr('compliance:gstr2b.later')} size="sm" variant="secondary" onPress={() => void decide(row, 'claimLater')} />
                              <Button title={tr('compliance:gstr2b.notOurs')} size="sm" variant="secondary" onPress={() => void decide(row, 'notOurs')} />
                            </>
                          ) : null}
                          {row.decision ? <Button title={tr('compliance:gstr2b.undo')} size="sm" variant="ghost" onPress={() => void decide(row, 'undecided')} /> : null}
                        </View>
                      </Card>
                    ))}
                    {rec.missingIn2b?.length && (filter === 'all' || filter === 'missingIn2b') ? (
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
                )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      <ConfirmDialog
        visible={askClaim}
        icon="check-all"
        title={tr('compliance:gstr2b.claimAskTitle', { period: periodLabel(period) })}
        message={tr('compliance:gstr2b.claimAskBody', { amount: s?.claimableTax ? formatMoney(s.claimableTax) : '' })}
        confirmLabel={tr('compliance:gstr2b.claim')}
        onCancel={() => setAskClaim(false)}
        onConfirm={() => {
          setAskClaim(false);
          return claim();
        }}
      />
      <SelectSheet visible={open === 'gstin'} onClose={() => setOpen(null)} title="GSTIN" options={gstins.map((g) => ({ value: g, label: g }))} value={gstin} onSelect={setGstin} searchable={false} />
      <SelectSheet
        visible={!!linking}
        onClose={() => setLinking(null)}
        title={tr('compliance:gstr2b.linkTitle')}
        subtitle={linking ? `${linking.number} · ${formatMoney(linking.tax!)}` : undefined}
        options={(linkSearching ? [] : candidates).map((d) => ({ value: d.id!, label: `${d.supplierDocNumber ?? d.number} · ${formatDate(d.date!)}`, description: `${d.number} · ${d.totalTax ? formatMoney(d.totalTax) : ''}` }))}
        loading={linkSearching}
        emptyMessage={tr('compliance:gstr2b.linkEmpty')}
        onSelect={(id) => linking && void decide(linking, 'accepted', id)}
      />
      <SelectSheet visible={open === 'period'} onClose={() => setOpen(null)} title={tr('compliance:gstr2b.period')} options={periods.map((p) => ({ value: p, label: periodLabel(p) }))} value={period} onSelect={setPeriod} searchable={false} />
    </View>
  );
}
