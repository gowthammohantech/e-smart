import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import type { Schema } from '@esmart/api-contract';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Sheet } from '@esmart/ui/components/Sheet';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { PickerField, Segmented, TextField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { api } from '../../../remote/api';
import { describeError } from '../../../remote/errors';
import { useActiveCompany, useBranches } from '../../../store/selectors';
import { detailRouteFor } from '../../../features/documents/DocumentEditor';
import type { DocumentKind } from '@esmart/core/types';
import { periodLabel, recentPeriods } from '../../../features/compliance/periods';
import { DataTable, KeyFigures, ReportSection } from '../../../features/reports/reportParts';
import { deliverFile, deliverPdf } from '../../../features/reports/exportFiles';
import { ReportFailed } from '../../../features/reports/ReportShell';
import { ReportSkeleton } from '../../../components/ScreenSkeleton';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { XLSX_MIME, tableHtml, toCsv, xlsxBytes, type ReportTable } from '../../../features/reports/reportTable';

type View3b = Schema<'Gstr3bView'>;
type Amounts = Schema<'GstAmounts'>;
type Money = Schema<'Money'>;
type ReturnType = 'gstr1' | 'gstr3b';
type Status = NonNullable<Schema<'GstReturn'>['status']> | 'none';

const KINDS = ['igst', 'cgst', 'sgst', 'cess'] as const;
// Each step reads differently: nothing done yet, under way on the portal, ready, filed, or refused.
const TONE: Record<Status, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = { none: 'neutral', notFiled: 'danger', prepared: 'neutral', saved: 'info', submitted: 'warning', filed: 'success', failed: 'danger' };
const OUTWARD = ['taxable', 'zeroRated', 'nilExempt', 'reverseCharge', 'nonGst'] as const;
const ITC = ['importOfGoods', 'importOfServices', 'reverseCharge', 'isd', 'allOther', 'reversedRules', 'reversedOther', 'net', 'reclaimed'] as const;
/** Each row as the portal numbers it; the key into the breakup. */
const OUTWARD_TABLE: Record<(typeof OUTWARD)[number], string> = { taxable: '3.1a', zeroRated: '3.1b', nilExempt: '3.1c', reverseCharge: '3.1d', nonGst: '3.1e' };
const ITC_TABLE: Record<(typeof ITC)[number], string> = { importOfGoods: '4A1', importOfServices: '4A2', reverseCharge: '4A3', isd: '4A4', allOther: '4A5', reversedRules: '4B1', reversedOther: '4B2', net: '4C', reclaimed: '4D1' };
/** The detailed sheet's columns: the table number, its description, then the amounts. */
const SHEET_WIDTHS = [0.7, 2.4, 1.1, 1, 1, 1, 0.8];
const SHEET_KINDS = ['text', 'text', 'num', 'num', 'num', 'num', 'num'] as const;
/** "3.1a" → "3.1(a)", "4A5" → "4A(5)". */
const tableLabel = (k: string) => k.replace(/^(3\.1|4[ABD])([a-e1-5])$/, '$1($2)');

/** A GSTIN as the portal issues it: what the server files under. */
const isGstin = (g?: string | null): g is string => !!g && g.length === 15;

const add = (...m: (Money | undefined)[]): Money => ({ minor: m.reduce((s, x) => s + (x?.minor ?? 0), 0), currency: m.find(Boolean)?.currency ?? 'INR' });
const taxOf = (a?: Amounts) => add(a?.igst, a?.cgst, a?.sgst, a?.cess);

/**
 * Filing a period's GST: GSTR-1 from the sales register, then GSTR-3B from the books and the claimed
 * 2B. Each is saved to the portal, frozen (GSTR-1) or set off (3B), and filed with the EVC code the
 * portal sends the authorised signatory. Filing 3B closes the books through the period.
 */
export default function GstReturnsScreen() {
  const t = useTheme();
  const desktop = useIsDesktop();
  const router = useRouter();
  const toast = useToast();
  const { t: tr, i18n } = useTranslation(['compliance', 'nav']);
  const company = useActiveCompany();
  const path = { companyId: company.id };
  const periods = useMemo(() => recentPeriods(), []);
  const [gstins, setGstins] = useState<string[]>([]);
  const [gstin, setGstin] = useState<string | null>(null);
  const [period, setPeriod] = useState(periods[0]);
  const [view, setView] = useState<View3b | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [otp, setOtp] = useState<Record<ReturnType, string>>({ gstr1: '', gstr3b: '' });
  const [open, setOpen] = useState<'gstin' | 'period' | null>(null);
  const [connected, setConnected] = useState(false);
  const [breakup, setBreakup] = useState<string | null>(null);
  const [layout, setLayout] = useState<'summary' | 'sheet'>('summary');
  // Until the GSTINs are known, "no GSTIN" isn't said; until a period's figures come, the last period's aren't shown.
  const [gstinsLoaded, setGstinsLoaded] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'failed' | 'done'>('loading');
  // Another period or GSTIN: what was on screen belongs to the last one, so it clears as this one loads.
  const scope = `${gstin}|${period}|${company.id}`;
  const [shownScope, setShownScope] = useState(scope);
  if (shownScope !== scope) {
    setShownScope(scope);
    setView(null);
    setLoadState('loading');
  }
  // Filing with the EVC can't be undone: it is asked first.
  const [askFile, setAskFile] = useState<ReturnType | null>(null);
  const branches = useBranches();

  useEffect(() => {
    // Without a portal session the return is still worked out from the books, to check before
    // filing: the company's and its branches' GSTINs are listed whether or not one is connected.
    const own = [company.taxRegistration?.identifier, ...branches.map((b) => b.gstin)].filter(isGstin);
    const settle = (sessions: Schema<'GstPortalSession'>[]) => {
      const list = [...new Set([...sessions.map((x) => x.gstin!).filter(isGstin), ...own])];
      setConnected(sessions.some((x) => x.connected));
      setGstins(list);
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
      .GET('/companies/{companyId}/gst/gstr3b', { params: { path, query: { gstin, period } } })
      .then(({ data }) => {
        setView(data ?? null);
        setLoadState('done');
      })
      .catch(() => setLoadState('failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gstin, period, company.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const step = async (returnType: ReturnType, action: 'save' | 'offset' | 'proceed' | 'evc' | 'file', done: string) => {
    if (!gstin) return;
    setBusy(`${returnType}:${action}`);
    try {
      const params = { path: { ...path, returnType } };
      const body = { gstin, period };
      const { error } =
        action === 'save'
          ? await api.POST('/companies/{companyId}/gst/returns/{returnType}/save', { params, body })
          : action === 'offset'
            ? await api.POST('/companies/{companyId}/gst/returns/{returnType}/offset', { params, body })
            : action === 'proceed'
              ? await api.POST('/companies/{companyId}/gst/returns/{returnType}/proceed', { params, body })
              : action === 'evc'
                ? await api.POST('/companies/{companyId}/gst/returns/{returnType}/evc', { params, body })
                : await api.POST('/companies/{companyId}/gst/returns/{returnType}/file', { params, body: { ...body, otp: otp[returnType] } });
      if (error) toast.show(describeError(error, tr), 'error');
      else {
        toast.show(done, 'success', { icon: 'check-all' });
        if (action === 'file') setOtp((o) => ({ ...o, [returnType]: '' }));
        await load();
      }
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setBusy(null);
    }
  };

  const returnOf = (r: ReturnType) => view?.returns?.find((x) => x.returnType === r);
  const statusOf = (r: ReturnType): Status => returnOf(r)?.status ?? 'none';
  const amountsRow = (label: string, a?: Amounts) => [label, formatMoney(a?.taxable ?? add()), ...KINDS.map((k) => formatMoney(a?.[k] ?? add()))];
  const headers = [tr('compliance:returns.head.section'), tr('compliance:returns.head.taxable'), 'IGST', 'CGST', 'SGST', tr('compliance:returns.head.cess')];
  const sheetHeaders = [tr('compliance:returns.head.table'), tr('compliance:returns.head.section'), tr('compliance:returns.head.taxable'), 'IGST', 'CGST', 'SGST/UTGST', tr('compliance:returns.head.cess')];
  const sheetRow = (x: { table: string; label: string; a: Amounts }) => [x.table, x.label, formatMoney(x.a.taxable ?? add()), ...KINDS.map((k) => formatMoney(x.a[k] ?? add()))];
  const s = view?.setOff;
  const usedFor = (k: (typeof KINDS)[number]) => add(...KINDS.map((from) => s?.credit?.[from]?.[k]));
  const lateTotal = add(taxOf(view?.interest), taxOf(view?.lateFee));
  const sources = breakup ? (view?.breakup?.[breakup] ?? []) : [];
  /** The tables of a section that have something behind them, to open. */
  const breakupLinks = (tables: string[]) => {
    const shown = tables.filter((k) => view?.breakup?.[k]?.length);
    return shown.length ? (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm, marginTop: t.spacing.sm }}>
        {shown.map((k) => (
          <Button key={k} title={tr('compliance:returns.breakupOf', { table: tableLabel(k), count: view!.breakup![k].length })} size="sm" variant="secondary" icon="format-list-bulleted" onPress={() => setBreakup(k)} />
        ))}
      </View>
    ) : null;
  };

  // The detailed sheet, laid out as the portal's form: every row, zero where the books keep nothing.
  const z = add();
  const blank: Amounts = { taxable: z, igst: z, cgst: z, sgst: z, cess: z };
  const rcm = view?.outward?.reverseCharge;
  const headOf = (k: (typeof KINDS)[number]) => (k === 'cess' ? tr('compliance:returns.head.cess') : k.toUpperCase());
  const sheetRows: { table: string; label: string; a: Amounts }[] = view
    ? [
        ...OUTWARD.map((k) => ({ table: tableLabel(OUTWARD_TABLE[k]), label: tr(`compliance:returns.sheet.outward.${k}`), a: view.outward?.[k] ?? blank })),
        // E-commerce supplies (s.9(5)) aren't kept apart in the books: the portal's rows, at nil.
        { table: '3.1.1(i)', label: tr('compliance:returns.sheet.eco95'), a: blank },
        { table: '3.1.1(ii)', label: tr('compliance:returns.sheet.ecoThrough'), a: blank },
        ...ITC.filter((k) => k !== 'net' && k !== 'reclaimed').map((k) => ({ table: tableLabel(ITC_TABLE[k]), label: tr(`compliance:returns.sheet.itc.${k}`), a: view.itc?.[k] ?? blank })),
        { table: '4C', label: tr('compliance:returns.sheet.itc.net'), a: view.itc?.net ?? blank },
        { table: '4D(1)', label: tr('compliance:returns.sheet.itc.reclaimed'), a: view.itc?.reclaimed ?? blank },
        { table: '4D(2)', label: tr('compliance:returns.sheet.itc.ineligible'), a: blank },
        { table: '5.1', label: tr('compliance:returns.interestRow'), a: view.interest ?? blank },
        { table: '5.1', label: tr('compliance:returns.lateFeeRow'), a: view.lateFee ?? blank },
      ]
    : [];
  const unregisteredTotal = { taxable: add(...(view?.interStateUnregistered ?? []).map((x) => x.taxable)), igst: add(...(view?.interStateUnregistered ?? []).map((x) => x.igst)) };
  const supplies32 = [
    { label: tr('compliance:returns.sheet.to.unregistered'), ...unregisteredTotal },
    { label: tr('compliance:returns.sheet.to.composition'), taxable: z, igst: z },
    { label: tr('compliance:returns.sheet.to.uin'), taxable: z, igst: z },
  ];
  // 6.1: the set-off's cash holds the interest and late fee too; take them out to show the tax alone.
  const payment = KINDS.map((k) => {
    const reverse = rcm?.[k]?.minor ?? 0;
    const interest = view?.interest?.[k]?.minor ?? 0;
    const late = view?.lateFee?.[k]?.minor ?? 0;
    const cash = (s?.cash?.[k]?.minor ?? 0) - interest - late;
    return {
      k,
      payable: add({ minor: (s?.liability?.[k]?.minor ?? 0) - reverse, currency: z.currency }),
      credit: KINDS.map((from) => s?.credit?.[from]?.[k] ?? z),
      cash: add({ minor: cash - reverse, currency: z.currency }),
      interest: add(view?.interest?.[k]),
      late: add(view?.lateFee?.[k]),
      reversePayable: add(rcm?.[k]),
      reverseCash: add(rcm?.[k]),
    };
  });
  /** Credit by head: what it paid of each tax, what there was and what is left. */
  const matrix = KINDS.map((from) => ({
    from,
    to: KINDS.map((k) => s?.credit?.[from]?.[k] ?? z),
    used: add(...KINDS.map((k) => s?.credit?.[from]?.[k])),
    available: add(view?.itc?.net?.[from], s?.carriedIn?.[from]),
    forward: add(s?.carriedForward?.[from]),
  }));

  /** The detailed sheet as one table for Excel or CSV, in rupees. */
  const sheetTable = (): ReportTable => {
    const r = (x?: Money) => (x?.minor ?? 0) / 100;
    const amountsCells = (a: Amounts) => [r(a.taxable), ...KINDS.map((k) => r(a[k]))];
    return {
      headers: ['Table', 'Description', 'Taxable value', 'IGST', 'CGST', 'SGST/UTGST', 'Cess'],
      rows: [
        ['GSTIN', gstin ?? '', 'Period', period],
        [],
        ...sheetRows.filter((x) => !x.table.startsWith('5.1')).map((x) => [x.table, x.label, ...amountsCells(x.a)]),
        ...supplies32.map((x) => ['3.2', x.label, r(x.taxable), r(x.igst)]),
        ...(view?.interStateUnregistered ?? []).map((x) => ['3.2', `  ${x.placeOfSupply ?? ''}`, r(x.taxable), r(x.igst)]),
        [],
        ['5', 'Description', 'Inter-state', 'Intra-state'],
        ['5', tr('compliance:returns.sheet.exemptFrom'), r(view?.inwardExempt?.interState), r(view?.inwardExempt?.intraState)],
        ['5', tr('compliance:returns.sheet.nonGstIn'), 0, 0],
        ...sheetRows.filter((x) => x.table.startsWith('5.1')).map((x) => [x.table, x.label, ...amountsCells(x.a)]),
        [],
        ['6.1(A)', 'Tax', 'Tax payable', 'Paid through ITC: IGST', 'Paid through ITC: CGST', 'Paid through ITC: SGST', 'Paid through ITC: Cess', 'Tax paid in cash', 'Interest paid in cash', 'Late fee paid in cash'],
        ...payment.map((p) => ['6.1(A)', headOf(p.k), r(p.payable), ...p.credit.map(r), r(p.cash), r(p.interest), r(p.late)]),
        ['6.1(B)', 'Tax', 'Tax payable (reverse charge)', 'Tax paid in cash'],
        ...payment.map((p) => ['6.1(B)', headOf(p.k), r(p.reversePayable), r(p.reverseCash)]),
        [],
        ['Credit', 'Credit of', 'Paid IGST', 'Paid CGST', 'Paid SGST', 'Paid cess', 'Used', 'Available', 'Carried forward'],
        ...matrix.map((x) => ['Credit', headOf(x.from), ...x.to.map(r), r(x.used), r(x.available), r(x.forward)]),
      ],
    };
  };
  const exportSheet = (format: 'xlsx' | 'csv') => {
    const name = `GSTR3B_${gstin ?? company.id}_${period}`;
    const table = sheetTable();
    void (format === 'xlsx' ? deliverFile(`${name}.xlsx`, xlsxBytes('GSTR-3B', table), XLSX_MIME) : deliverFile(`${name}.csv`, new TextEncoder().encode(toCsv(table)), 'text/csv'));
  };

  /** The 3B as a printable page, the same rows as the file. */
  const exportPdf = () => {
    const table = sheetTable();
    void deliverPdf(`GSTR3B_${gstin ?? company.id}_${period}.pdf`, tableHtml('GSTR-3B', `${gstin ?? ''} · ${periodLabel(period)}`, table, i18n.language)).catch(() => undefined);
  };

  /** A return's state; with the portal connected, its next steps too. Without it, only what the books know. */
  const returnCard = (r: ReturnType) => {
    const status = statusOf(r);
    const row = returnOf(r);
    const blocked = r === 'gstr3b' && statusOf('gstr1') !== 'filed';
    const saveLabel = status === 'none' || status === 'prepared' || status === 'failed' ? tr('compliance:returns.save') : tr('compliance:returns.saveAgain');
    return (
      // On a desktop the two returns sit side by side, each half the row.
      <Card key={r} style={[{ gap: t.spacing.md }, desktop ? { flex: 1, minWidth: 0 } : null]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: t.spacing.md }}>
          <Text variant="body" weight="700">
            {r === 'gstr1' ? 'GSTR-1' : 'GSTR-3B'}
          </Text>
          <Badge label={tr(`compliance:returns.state.${status}`)} tone={TONE[status]} size="sm" />
        </View>
        {status === 'filed' ? (
          <Text variant="caption">{tr('compliance:returns.arn', { arn: row?.arn ?? '', date: row?.filedOn ? formatDate(row.filedOn) : '' })}</Text>
        ) : !connected ? (
          row?.lastError ? (
            <Text variant="caption" tone="warn">
              {row.lastError}
            </Text>
          ) : null
        ) : (
          <>
            {row?.lastError ? (
              <Text variant="caption" tone="warn">
                {row.lastError}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              <Button title={saveLabel} size="sm" variant={status === 'submitted' ? 'secondary' : 'primary'} loading={busy === `${r}:save`} disabled={!!busy} onPress={() => void step(r, 'save', tr('compliance:returns.saved'))} />
              {status === 'saved' ? (
                r === 'gstr1' ? (
                  <Button title={tr('compliance:returns.proceed')} size="sm" loading={busy === `${r}:proceed`} disabled={!!busy} onPress={() => void step(r, 'proceed', tr('compliance:returns.proceeded'))} />
                ) : (
                  <Button title={tr('compliance:returns.offset')} size="sm" loading={busy === `${r}:offset`} disabled={!!busy} onPress={() => void step(r, 'offset', tr('compliance:returns.offsetDone'))} />
                )
              ) : null}
            </View>
            {status === 'submitted' && view?.filingEnabled ? (
              blocked ? (
                <Text variant="caption" tone="muted">
                  {tr('compliance:returns.gstr1First')}
                </Text>
              ) : (
                <>
                  <Button title={tr('compliance:returns.sendEvc')} size="sm" variant="secondary" icon="cellphone-message" loading={busy === `${r}:evc`} disabled={!!busy} onPress={() => void step(r, 'evc', tr('compliance:returns.evcSent'))} />
                  <TextField label={tr('compliance:returns.evcOtp')} hint={tr('compliance:returns.evcHint')} value={otp[r]} onChangeText={(v) => setOtp((o) => ({ ...o, [r]: v.replace(/\D/g, '').slice(0, 6) }))} keyboardType="number-pad" />
                  <Button title={tr('compliance:returns.file')} icon="send-check-outline" loading={busy === `${r}:file`} disabled={!!busy || otp[r].length !== 6} onPress={() => setAskFile(r)} />
                </>
              )
            ) : null}
          </>
        )}
      </Card>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.gstReturns') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        {!gstinsLoaded ? (
          <ReportSkeleton />
        ) : !gstins.length ? (
          <EmptyState icon="card-account-details-outline" title={tr('compliance:returns.noGstin')} message={tr('compliance:returns.noGstinBody')} actionLabel={tr('compliance:returns.addGstin')} onAction={() => router.push('/(app)/settings/company')} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              {/* The pickers share the row; a lone period picker takes all of it rather than leaving a gap. */}
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
            ) : !view ? (
              <ReportSkeleton />
            ) : null}
            {view ? (
              <>
                <KeyFigures
                  rows={[
                    { label: tr('compliance:returns.dueDate'), value: formatDate(view.dueDate!) },
                    { label: tr('compliance:returns.creditUsed'), value: formatMoney(add(...KINDS.map(usedFor))), tone: 'good' },
                    { label: tr('compliance:returns.cashToPay'), value: formatMoney(taxOf(s?.cash)), tone: taxOf(s?.cash).minor ? 'warn' : undefined },
                    // What challans have put in the portal's cash ledger, as the books hold it (RULES 6.21).
                    { label: tr('compliance:returns.cashLedger'), value: formatMoney(taxOf(s?.cashLedger)), tone: taxOf(s?.cashLedger).minor < taxOf(s?.cash).minor ? 'warn' : 'good' },
                  ]}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
                  <Button title={tr('compliance:returns.openUtilization')} icon="scale-balance" variant="secondary" size="sm" onPress={() => router.push(`/(app)/gst/utilization?gstin=${gstin}&period=${period}` as never)} />
                  <Button title={tr('compliance:returns.recordChallan')} icon="bank-plus" variant="ghost" size="sm" onPress={() => router.push('/(app)/gst/challan' as never)} />
                </View>
                {lateTotal.minor ? (
                  <Text variant="caption" tone="warn">
                    {tr('compliance:returns.lateFee', { amount: formatMoney(lateTotal) })}
                  </Text>
                ) : null}
                {!connected ? (
                  <Card>
                    <Text variant="caption" tone="muted">
                      {tr('compliance:returns.fromBooks')}
                    </Text>
                  </Card>
                ) : !view.filingEnabled ? (
                  <Card>
                    <Text variant="caption" tone="muted">
                      {tr('compliance:returns.filingOff')}
                    </Text>
                  </Card>
                ) : null}
                {/* Each return's state shows with or without the portal; its steps need the portal. */}
                {desktop ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.lg }}>
                    {returnCard('gstr1')}
                    {returnCard('gstr3b')}
                  </View>
                ) : (
                  <>
                    {returnCard('gstr1')}
                    {returnCard('gstr3b')}
                  </>
                )}
                {/* The 3B as a file, whichever layout is on screen. */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
                  <Button title={tr('compliance:returns.exportPdf')} icon="file-pdf-box" size="sm" variant="secondary" onPress={exportPdf} />
                  <Button title={tr('compliance:returns.exportExcel')} icon="file-excel-box" size="sm" variant="secondary" onPress={() => exportSheet('xlsx')} />
                  <Button title={tr('compliance:returns.exportCsv')} icon="file-delimited-outline" size="sm" variant="secondary" onPress={() => exportSheet('csv')} />
                </View>
                <Segmented
                  size="sm"
                  value={layout}
                  onChange={(v) => setLayout(v as 'summary' | 'sheet')}
                  options={[
                    { value: 'summary', label: tr('compliance:returns.layout.summary') },
                    { value: 'sheet', label: tr('compliance:returns.layout.sheet') },
                  ]}
                />
                {layout === 'sheet' ? (
                  <>
                    <ReportSection title={tr('compliance:returns.sheet.title31')}>
                      <DataTable headers={sheetHeaders} widths={SHEET_WIDTHS} minWidth={760} kinds={SHEET_KINDS} rows={sheetRows.filter((x) => x.table.startsWith('3.')).map((x) => sheetRow(x))} />
                    </ReportSection>
                    <ReportSection title={tr('compliance:returns.unregistered')}>
                      <DataTable
                        headers={[tr('compliance:returns.head.section'), tr('compliance:returns.head.taxable'), 'IGST']}
                        widths={[2, 1, 1]}
                        rows={[
                          ...supplies32.map((x) => [x.label, formatMoney(x.taxable), formatMoney(x.igst)]),
                          ...(view.interStateUnregistered ?? []).map((x) => [`   ${x.placeOfSupply ?? ''}`, formatMoney(x.taxable ?? z), formatMoney(x.igst ?? z)]),
                        ]}
                      />
                    </ReportSection>
                    <ReportSection title={tr('compliance:returns.itc')}>
                      <DataTable headers={sheetHeaders} widths={SHEET_WIDTHS} minWidth={760} kinds={SHEET_KINDS} rows={sheetRows.filter((x) => x.table.startsWith('4')).map((x) => sheetRow(x))} />
                    </ReportSection>
                    <ReportSection title={tr('compliance:returns.inwardExempt')}>
                      <DataTable
                        headers={[tr('compliance:returns.head.section'), tr('compliance:returns.head.interState'), tr('compliance:returns.head.intraState')]}
                        widths={[2, 1, 1]}
                        rows={[
                          [tr('compliance:returns.sheet.exemptFrom'), formatMoney(view.inwardExempt?.interState ?? z), formatMoney(view.inwardExempt?.intraState ?? z)],
                          [tr('compliance:returns.sheet.nonGstIn'), formatMoney(z), formatMoney(z)],
                        ]}
                      />
                    </ReportSection>
                    <ReportSection title={tr('compliance:returns.interestLateFee')}>
                      <DataTable headers={sheetHeaders} widths={SHEET_WIDTHS} minWidth={760} kinds={SHEET_KINDS} rows={sheetRows.filter((x) => x.table === '5.1').map((x) => sheetRow(x))} />
                    </ReportSection>
                    <ReportSection title={tr('compliance:returns.sheet.title61a')}>
                      <DataTable
                        headers={[tr('compliance:returns.head.tax'), tr('compliance:returns.sheet.payable'), ...KINDS.map((k) => tr('compliance:returns.sheet.viaCredit', { head: headOf(k) })), tr('compliance:returns.head.cash'), tr('compliance:returns.interestRow'), tr('compliance:returns.lateFeeRow')]}
                        widths={[0.8, 1.1, 1, 1, 1, 1, 1, 0.9, 0.9]}
                        minWidth={900}
                        rows={payment.map((p) => [headOf(p.k), formatMoney(p.payable), ...p.credit.map((x) => formatMoney(x)), formatMoney(p.cash), formatMoney(p.interest), formatMoney(p.late)])}
                      />
                    </ReportSection>
                    <ReportSection title={tr('compliance:returns.sheet.title61b')}>
                      <DataTable
                        headers={[tr('compliance:returns.head.tax'), tr('compliance:returns.sheet.payable'), tr('compliance:returns.head.cash')]}
                        widths={[1, 1, 1]}
                        rows={payment.map((p) => [headOf(p.k), formatMoney(p.reversePayable), formatMoney(p.reverseCash)])}
                      />
                    </ReportSection>
                    <ReportSection title={tr('compliance:returns.sheet.matrix')}>
                      <DataTable
                        headers={[tr('compliance:returns.sheet.creditOf'), ...KINDS.map((k) => tr('compliance:returns.sheet.paid', { head: headOf(k) })), tr('compliance:returns.sheet.used'), tr('compliance:returns.sheet.available'), tr('compliance:returns.head.forward')]}
                        widths={[0.9, 1, 1, 1, 1, 1, 1.1, 1.1]}
                        minWidth={820}
                        rows={matrix.map((x) => [headOf(x.from), ...x.to.map((y) => formatMoney(y)), formatMoney(x.used), formatMoney(x.available), formatMoney(x.forward)])}
                      />
                      <Text variant="caption" tone="muted" style={{ marginTop: t.spacing.sm, lineHeight: 18 }}>
                        {tr('compliance:returns.sheet.matrixNote')}
                      </Text>
                    </ReportSection>
                  </>
                ) : (
                  <>
                    <ReportSection title={tr('compliance:returns.outward')}>
                      <DataTable headers={headers} widths={[2, 1, 1, 1, 1, 1]} rows={OUTWARD.map((k) => amountsRow(`${tableLabel(OUTWARD_TABLE[k])} ${tr(`compliance:returns.outwardRow.${k}`)}`, view.outward?.[k]))} />
                      {breakupLinks(Object.values(OUTWARD_TABLE))}
                    </ReportSection>
                    <ReportSection title={tr('compliance:returns.unregistered')}>
                      {view.interStateUnregistered?.length ? (
                        <DataTable
                          headers={[tr('compliance:returns.head.placeOfSupply'), tr('compliance:returns.head.taxable'), 'IGST']}
                          widths={[2, 1, 1]}
                          rows={view.interStateUnregistered.map((x) => [x.placeOfSupply ?? '', formatMoney(x.taxable ?? add()), formatMoney(x.igst ?? add())])}
                        />
                      ) : (
                        <Text variant="caption" tone="muted">
                          {tr('compliance:returns.none')}
                        </Text>
                      )}
                      {breakupLinks(['3.2'])}
                    </ReportSection>
                    <ReportSection title={tr('compliance:returns.itc')}>
                      <DataTable headers={headers} widths={[2, 1, 1, 1, 1, 1]} rows={ITC.map((k) => amountsRow(`${tableLabel(ITC_TABLE[k])} ${tr(`compliance:returns.itcRow.${k}`)}`, view.itc?.[k]))} />
                      {breakupLinks(Object.values(ITC_TABLE))}
                    </ReportSection>
                    <ReportSection title={tr('compliance:returns.inwardExempt')}>
                      <DataTable
                        headers={[tr('compliance:returns.head.section'), tr('compliance:returns.head.interState'), tr('compliance:returns.head.intraState')]}
                        widths={[2, 1, 1]}
                        rows={[[tr('compliance:returns.exemptRow'), formatMoney(view.inwardExempt?.interState ?? add()), formatMoney(view.inwardExempt?.intraState ?? add())]]}
                      />
                      {breakupLinks(['5'])}
                    </ReportSection>
                    <ReportSection title={tr('compliance:returns.interestLateFee')}>
                      <DataTable headers={headers} widths={[2, 1, 1, 1, 1, 1]} rows={[amountsRow(tr('compliance:returns.interestRow'), view.interest), amountsRow(tr('compliance:returns.lateFeeRow'), view.lateFee)]} />
                    </ReportSection>
                    <ReportSection title={tr('compliance:returns.setOff')}>
                      <DataTable
                        headers={[tr('compliance:returns.head.tax'), tr('compliance:returns.head.liability'), tr('compliance:returns.head.credit'), tr('compliance:returns.head.cash'), tr('compliance:returns.head.cashLedger'), tr('compliance:returns.head.forward')]}
                        rows={KINDS.map((k) => [k === 'cess' ? tr('compliance:returns.head.cess') : k.toUpperCase(), formatMoney(s?.liability?.[k] ?? add()), formatMoney(usedFor(k)), formatMoney(s?.cash?.[k] ?? add()), formatMoney(s?.cashLedger?.[k] ?? add()), formatMoney(s?.carriedForward?.[k] ?? add())])}
                      />
                    </ReportSection>
                  </>
                )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      {/* A drawer on a desktop: the 3B table the documents add up to stays in view. */}
      <Sheet visible={!!breakup} onClose={() => setBreakup(null)} title={breakup ? tr('compliance:returns.breakupTitle', { table: tableLabel(breakup) }) : undefined} desktopAs="drawer">
        <View style={{ paddingBottom: t.spacing.lg }}>
          {sources.map((x, i) => (
            <ListRow
              key={`${x.type}-${x.id}`}
              title={x.number ?? tr(`compliance:returns.sourceType.${x.type ?? 'document'}`)}
              subtitle={[x.date ? formatDate(x.date) : '', x.partyName, !x.type || x.type === 'document' ? undefined : tr(`compliance:returns.sourceType.${x.type}`)].filter(Boolean).join(' · ')}
              right={
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="small" weight="600">
                    {formatMoney(x.taxable ?? add())}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatMoney(taxOf(x))}
                  </Text>
                </View>
              }
              divider={i < sources.length - 1}
              chevron={x.type === 'document' && !!x.kind}
              onPress={
                x.type === 'document' && x.kind
                  ? () => {
                      setBreakup(null);
                      router.push(detailRouteFor(x.kind as DocumentKind, x.id!) as never);
                    }
                  : undefined
              }
            />
          ))}
        </View>
      </Sheet>
      <ConfirmDialog
        visible={!!askFile}
        icon="send-check-outline"
        title={tr('compliance:returns.fileAskTitle', { name: askFile === 'gstr1' ? 'GSTR-1' : 'GSTR-3B', period: periodLabel(period) })}
        message={tr('compliance:returns.fileAskBody')}
        confirmLabel={tr('compliance:returns.file')}
        onCancel={() => setAskFile(null)}
        onConfirm={() => {
          const r = askFile!;
          setAskFile(null);
          return step(r, 'file', tr('compliance:returns.filed', { name: r === 'gstr1' ? 'GSTR-1' : 'GSTR-3B' }));
        }}
      />
      <SelectSheet visible={open === 'gstin'} onClose={() => setOpen(null)} title="GSTIN" options={gstins.map((g) => ({ value: g, label: g }))} value={gstin} onSelect={setGstin} searchable={false} />
      <SelectSheet visible={open === 'period'} onClose={() => setOpen(null)} title={tr('compliance:gstr2b.period')} options={periods.map((p) => ({ value: p, label: periodLabel(p) }))} value={period} onSelect={setPeriod} searchable={false} />
    </View>
  );
}
