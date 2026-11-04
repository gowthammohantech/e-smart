import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import type { Schema } from '@esmart/api-contract';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { PickerField, TextField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { api } from '../../../remote/api';
import { describeError } from '../../../remote/errors';
import { useActiveCompany } from '../../../store/selectors';
import { periodLabel, recentPeriods } from '../../../features/compliance/periods';
import { DataTable, KeyFigures, ReportSection } from '../../../features/reports/reportParts';

type View3b = Schema<'Gstr3bView'>;
type Amounts = Schema<'GstAmounts'>;
type Money = Schema<'Money'>;
type ReturnType = 'gstr1' | 'gstr3b';
type Status = NonNullable<Schema<'GstReturn'>['status']> | 'none';

const KINDS = ['igst', 'cgst', 'sgst', 'cess'] as const;
const TONE: Record<Status, 'success' | 'warning' | 'danger' | 'neutral'> = { none: 'neutral', notFiled: 'neutral', prepared: 'neutral', saved: 'neutral', submitted: 'warning', filed: 'success', failed: 'danger' };
const OUTWARD = ['taxable', 'zeroRated', 'nilExempt', 'reverseCharge', 'nonGst'] as const;
const ITC = ['importOfGoods', 'importOfServices', 'reverseCharge', 'allOther', 'reversedRules', 'reversedOther', 'reclaimed', 'net'] as const;

const add = (...m: (Money | undefined)[]): Money => ({ minor: m.reduce((s, x) => s + (x?.minor ?? 0), 0), currency: m.find(Boolean)?.currency ?? 'INR' });
const taxOf = (a?: Amounts) => add(a?.igst, a?.cgst, a?.sgst, a?.cess);

/**
 * Filing a period's GST: GSTR-1 from the sales register, then GSTR-3B from the books and the claimed
 * 2B. Each is saved to the portal, frozen (GSTR-1) or set off (3B), and filed with the EVC code the
 * portal sends the authorised signatory. Filing 3B closes the books through the period.
 */
export default function GstReturnsScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['compliance', 'nav']);
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
    return api.GET('/companies/{companyId}/gst/gstr3b', { params: { path, query: { gstin, period } } }).then(({ data, error }) => {
      if (error) toast.show(describeError(error, tr), 'error');
      else setView(data ?? null);
    });
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
  const s = view?.setOff;
  const usedFor = (k: (typeof KINDS)[number]) => add(...KINDS.map((from) => s?.credit?.[from]?.[k]));
  const lateTotal = add(taxOf(view?.interest), taxOf(view?.lateFee));

  const returnCard = (r: ReturnType) => {
    const status = statusOf(r);
    const row = returnOf(r);
    const blocked = r === 'gstr3b' && statusOf('gstr1') !== 'filed';
    const saveLabel = status === 'none' || status === 'prepared' || status === 'failed' ? tr('compliance:returns.save') : tr('compliance:returns.saveAgain');
    return (
      <Card key={r} style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: t.spacing.md }}>
          <Text variant="body" weight="700">
            {r === 'gstr1' ? 'GSTR-1' : 'GSTR-3B'}
          </Text>
          <Badge label={tr(`compliance:returns.state.${status}`)} tone={TONE[status]} size="sm" />
        </View>
        {status === 'filed' ? (
          <Text variant="caption">{tr('compliance:returns.arn', { arn: row?.arn ?? '', date: row?.filedOn ? formatDate(row.filedOn) : '' })}</Text>
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
                  <Button title={tr('compliance:returns.file')} icon="send-check-outline" loading={busy === `${r}:file`} disabled={!!busy || otp[r].length !== 6} onPress={() => void step(r, 'file', tr('compliance:returns.filed', { name: r === 'gstr1' ? 'GSTR-1' : 'GSTR-3B' }))} />
                </>
              )
            ) : null}
          </>
        )}
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.gstReturns') }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40, gap: t.spacing.lg }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        {!gstins.length ? (
          <EmptyState icon="link-variant-off" title={tr('compliance:gstr2b.notConnected')} message={tr('compliance:returns.notConnectedBody')} actionLabel={tr('nav:title.gstPortal')} onAction={() => router.push('/(app)/settings/gst-portal')} />
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
            {view ? (
              <>
                <KeyFigures
                  rows={[
                    { label: tr('compliance:returns.dueDate'), value: formatDate(view.dueDate!) },
                    { label: tr('compliance:returns.creditUsed'), value: formatMoney(add(...KINDS.map(usedFor))), tone: 'good' },
                    { label: tr('compliance:returns.cashToPay'), value: formatMoney(taxOf(s?.cash)), tone: taxOf(s?.cash).minor ? 'warn' : undefined },
                  ]}
                />
                {lateTotal.minor ? (
                  <Text variant="caption" tone="warn">
                    {tr('compliance:returns.lateFee', { amount: formatMoney(lateTotal) })}
                  </Text>
                ) : null}
                {!view.filingEnabled ? (
                  <Card>
                    <Text variant="caption" tone="muted">
                      {tr('compliance:returns.filingOff')}
                    </Text>
                  </Card>
                ) : null}
                {returnCard('gstr1')}
                {returnCard('gstr3b')}
                <ReportSection title={tr('compliance:returns.outward')}>
                  <DataTable headers={headers} widths={[2, 1, 1, 1, 1, 1]} rows={OUTWARD.map((k) => amountsRow(tr(`compliance:returns.outwardRow.${k}`), view.outward?.[k]))} />
                </ReportSection>
                <ReportSection title={tr('compliance:returns.itc')}>
                  <DataTable headers={headers} widths={[2, 1, 1, 1, 1, 1]} rows={ITC.map((k) => amountsRow(tr(`compliance:returns.itcRow.${k}`), view.itc?.[k]))} />
                </ReportSection>
                <ReportSection title={tr('compliance:returns.setOff')}>
                  <DataTable
                    headers={[tr('compliance:returns.head.tax'), tr('compliance:returns.head.liability'), tr('compliance:returns.head.credit'), tr('compliance:returns.head.cash'), tr('compliance:returns.head.forward')]}
                    rows={KINDS.map((k) => [k === 'cess' ? tr('compliance:returns.head.cess') : k.toUpperCase(), formatMoney(s?.liability?.[k] ?? add()), formatMoney(usedFor(k)), formatMoney(s?.cash?.[k] ?? add()), formatMoney(s?.carriedForward?.[k] ?? add())])}
                  />
                </ReportSection>
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
