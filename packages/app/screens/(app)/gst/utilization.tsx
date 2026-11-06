import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import type { Schema } from '@esmart/api-contract';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { Card } from '@esmart/ui/components/Card';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { AmountField, PickerField, TextField } from '@esmart/ui/components/Field';
import { FormContainer, FormSection } from '@esmart/ui/components/Layout';
import { ListRow } from '@esmart/ui/components/ListRow';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { cashUsed, creditMayPay, HEADS, setOffIssues, type Heads, type SetOff, type SetOffInput } from '@esmart/core/domain/gstUtilization';
import { formatDate, today } from '@esmart/core/lib/date';
import { formatMoney, toAmountInput } from '@esmart/core/lib/format';
import { fromMajor, money } from '@esmart/core/lib/money';
import { api } from '../../../remote/api';
import { describeError } from '../../../remote/errors';
import { useActiveCompany, useBaseCurrency, useBranches } from '../../../store/selectors';
import { periodLabel, recentPeriods } from '../../../features/compliance/periods';
import { DataTable, KeyFigures } from '../../../features/reports/reportParts';
import { useAccountName } from '../../../features/books/names';

type UtilView = Schema<'GstUtilizationView'>;
type Head = (typeof HEADS)[number];
/** The cash parts a user may edit; reverse charge is fixed by 3B and shown, not typed. */
const CASH_ROWS = ['cash', 'oldReverseCharge', 'interest', 'lateFee'] as const;
type CashRow = (typeof CASH_ROWS)[number];
type Inputs = { credit: Record<Head, Record<Head, string>>; cash: Record<CashRow, Record<Head, string>> };

const isGstin = (g?: string | null): g is string => !!g && g.length === 15;
const emptyHeads = (): Record<Head, string> => ({ igst: '', cgst: '', sgst: '', cess: '' });

/**
 * The utilization entry (GST set-off) for a GSTIN and period (RULES 6.21, pending CA): the liability
 * from the period's GSTR-3B, the credit available and the GST cash ledger the books hold, prefilled in
 * the rule 88A order and editable within those rules. Posting makes one GST journal; a period already
 * set off shows that journal, to view or reverse.
 */
export default function GstUtilizationScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { t: tr } = useTranslation(['compliance', 'books', 'common']);
  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const branches = useBranches();
  const accountName = useAccountName();
  const params = useLocalSearchParams<{ gstin?: string; period?: string }>();
  const periods = useMemo(() => recentPeriods(), []);
  const gstins = useMemo(() => [...new Set([company.taxRegistration?.identifier, ...branches.map((b) => b.gstin)].filter(isGstin))], [company, branches]);
  const [gstin, setGstin] = useState<string | undefined>(isGstin(params.gstin) ? params.gstin : undefined);
  const [period, setPeriod] = useState(params.period && /^\d{6}$/.test(params.period) ? params.period : periods[0]);
  const [date, setDate] = useState(today());
  const [narration, setNarration] = useState('');
  const [open, setOpen] = useState<'gstin' | 'period' | null>(null);
  const [view, setView] = useState<UtilView | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inputs, setInputs] = useState<Inputs | null>(null);
  const g = gstin ?? gstins[0];

  const toInputs = (s: SetOff): Inputs => {
    const str = (m: number) => (m ? toAmountInput(money(m, baseCurrency)) : '');
    const heads = (h: Heads) => Object.fromEntries(HEADS.map((k) => [k, str(h[k])])) as Record<Head, string>;
    return { credit: Object.fromEntries(HEADS.map((k) => [k, heads(s.credit[k])])) as Inputs['credit'], cash: Object.fromEntries(CASH_ROWS.map((r) => [r, heads(s[r])])) as Inputs['cash'] };
  };

  const load = useCallback(async () => {
    if (!g) return;
    setLoading(true);
    try {
      const { data, error } = await api.GET('/companies/{companyId}/gst/utilization', { params: { path: { companyId: company.id }, query: { gstin: g, period, date } } });
      if (error) toast.show(describeError(error, tr), 'error');
      else {
        setView(data ?? null);
        if (data) setInputs((cur) => cur ?? toInputs(data.prefill as SetOff));
      }
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, period, date, company.id]);
  // A new GSTIN or period starts from the prefill again; a new date only reads the cash ledger again.
  useEffect(() => setInputs(null), [g, period]);
  // Back from recording a challan: the cash ledger has moved.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const minor = (v: string) => fromMajor(v || '0', baseCurrency).minor;
  const heads = (r: Record<Head, string>): Heads => ({ igst: minor(r.igst), cgst: minor(r.cgst), sgst: minor(r.sgst), cess: minor(r.cess) });
  const setOff: SetOff | null =
    view && inputs
      ? {
          credit: { igst: heads(inputs.credit.igst), cgst: heads(inputs.credit.cgst), sgst: heads(inputs.credit.sgst), cess: heads(inputs.credit.cess) },
          cash: heads(inputs.cash.cash),
          reverseCharge: view.reverseCharge,
          oldReverseCharge: heads(inputs.cash.oldReverseCharge),
          interest: heads(inputs.cash.interest),
          lateFee: heads(inputs.cash.lateFee),
        }
      : null;
  const input: SetOffInput | null = view
    ? { forward: view.forward, reverseCharge: view.reverseCharge, available: view.available, cashBalance: view.cashBalance, oldReverseChargeOpen: view.oldReverseChargeOpen, interest: view.interest, lateFee: view.lateFee }
    : null;
  const issues = input && setOff ? setOffIssues(input, setOff) : [];
  const short = issues.filter((i) => i.code === 'CASH_LEDGER_SHORT');
  const rules = issues.filter((i) => i.code !== 'CASH_LEDGER_SHORT');
  const needed = setOff ? cashUsed(setOff) : null;
  const m = (minorAmount: number) => formatMoney(money(minorAmount, baseCurrency));
  const headLabel = (h: Head) => (h === 'cess' ? tr('compliance:returns.head.cess') : h.toUpperCase());
  const existing = view?.existing ?? [];

  const post = async () => {
    if (!g || !setOff || issues.length) return;
    setBusy(true);
    try {
      const { error } = await api.POST('/companies/{companyId}/gst/utilization', { params: { path: { companyId: company.id } }, body: { gstin: g, period, date, narration: narration.trim() || undefined, setOff } });
      if (error) toast.show(describeError(error, tr), 'error');
      else {
        toast.show(tr('compliance:utilization.posted'), 'success', { icon: 'check-all' });
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const reverse = async (v: Schema<'Voucher'>) => {
    setBusy(true);
    try {
      const { error } = await api.DELETE('/companies/{companyId}/vouchers/{id}', { params: { path: { companyId: company.id, id: v.id! } } });
      if (error) toast.show(describeError(error, tr), 'error');
      else {
        toast.show(tr('compliance:utilization.reversed'), 'success', { icon: 'undo' });
        setInputs(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const recordChallan = () => {
    if (!needed || !view) return;
    const q = HEADS.map((h) => `${h}=${toAmountInput(money(Math.max(needed[h] - view.cashBalance[h], 0), baseCurrency))}`).join('&');
    router.push(`/(app)/gst/challan?back=1&${q}` as never);
  };

  const field = (value: string, onChange: (v: string) => void, label: string) => (
    <View style={{ flexGrow: 1, flexBasis: 120 }}>
      <AmountField label={label} value={value} onChangeValue={onChange} currency={baseCurrency} align="right" />
    </View>
  );

  if (!gstins.length) {
    return (
      <>
        <Stack.Screen options={{ title: tr('compliance:utilization.title') }} />
        <EmptyState icon="card-account-details-outline" title={tr('compliance:returns.noGstin')} message={tr('compliance:returns.noGstinBody')} actionLabel={tr('compliance:returns.addGstin')} onAction={() => router.push('/(app)/settings/company')} />
      </>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('compliance:utilization.title') }} />
      <FormContainer wide>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          <Text variant="small" tone="muted">
            {tr('compliance:utilization.hint')}
          </Text>
          <View style={{ flexDirection: 'row', gap: t.spacing.md, flexWrap: 'wrap' }}>
            {gstins.length > 1 ? (
              <View style={{ flex: 1, minWidth: 200 }}>
                <PickerField label="GSTIN" value={g} onPress={() => setOpen('gstin')} />
              </View>
            ) : null}
            <View style={{ flex: 1, minWidth: 160 }}>
              <PickerField label={tr('compliance:gstr2b.period')} value={periodLabel(period)} onPress={() => setOpen('period')} icon="calendar-month-outline" />
            </View>
            <View style={{ flex: 1, minWidth: 160 }}>
              <DateField label={tr('compliance:utilization.date')} value={date} onChange={setDate} maximumDate={new Date()} />
            </View>
          </View>

          {loading && !view ? <ActivityIndicator /> : null}
          {view ? (
            <>
              {!view.outputCheck.ok ? (
                <Card style={{ borderColor: t.c.warn, borderWidth: 1, gap: t.spacing.sm }}>
                  <Text variant="body" weight="700" tone="warn">
                    {tr('compliance:utilization.outputMismatch')}
                  </Text>
                  <Text variant="small" tone="muted">
                    {tr('compliance:utilization.outputMismatchBody')}
                  </Text>
                  <DataTable
                    headers={[tr('compliance:returns.head.tax'), tr('compliance:utilization.outputBooks'), tr('compliance:utilization.outputReturn'), tr('compliance:utilization.difference')]}
                    rows={HEADS.filter((h) => view.outputCheck.difference[h]).map((h) => [headLabel(h), m(view.outputCheck.books[h]), m(view.outputCheck.expected[h]), m(view.outputCheck.difference[h])])}
                  />
                </Card>
              ) : null}

              <FormSection title={tr('compliance:utilization.position')}>
                <DataTable
                  headers={[tr('compliance:returns.head.tax'), tr('compliance:utilization.forward'), tr('compliance:utilization.reverseCharge'), tr('compliance:utilization.available'), tr('compliance:returns.head.cashLedger'), tr('compliance:utilization.interestLateFee')]}
                  rows={HEADS.map((h) => [headLabel(h), m(view.forward[h]), m(view.reverseCharge[h]), m(view.available[h]), m(view.cashBalance[h]), m(view.interest[h] + view.lateFee[h])])}
                />
                {HEADS.some((h) => view.oldReverseChargeOpen[h]) ? (
                  <Text variant="caption" tone="muted">
                    {tr('compliance:utilization.oldRcmOpen', { amount: m(HEADS.reduce((a, h) => a + view.oldReverseChargeOpen[h], 0)) })}
                  </Text>
                ) : null}
              </FormSection>

              {existing.length ? (
                <FormSection title={tr('compliance:utilization.existing')}>
                  {existing.map((v) => (
                    <Card key={v.id} padded={false}>
                      <ListRow title={`${v.number} · ${formatDate(v.date)}`} subtitle={v.narration} chevron onPress={() => router.push(`/(app)/books/vouchers/${v.id}` as never)} divider />
                      {v.lines.map((l, i) => (
                        <ListRow
                          key={`${l.account}-${i}`}
                          title={accountName({ key: l.account, name: l.account, kind: l.account.startsWith('sys:') ? 'system' : 'custom' })}
                          right={
                            <Text variant="small" weight="600">
                              {l.debit.minor ? `${formatMoney(l.debit)} ${tr('books:accounts.dr')}` : `${formatMoney(l.credit)} ${tr('books:accounts.cr')}`}
                            </Text>
                          }
                          divider={i < v.lines.length - 1}
                        />
                      ))}
                      <View style={{ padding: t.spacing.md, flexDirection: 'row', gap: t.spacing.sm }}>
                        <Button title={tr('compliance:utilization.reverse')} icon="undo" variant="secondary" size="sm" loading={busy} onPress={() => void reverse(v)} />
                      </View>
                    </Card>
                  ))}
                  <Text variant="caption" tone="muted">
                    {tr('compliance:utilization.existingHint')}
                  </Text>
                </FormSection>
              ) : inputs && setOff ? (
                <>
                  <FormSection title={tr('compliance:utilization.credit')}>
                    {HEADS.map((from) => (
                      <View key={from} style={{ gap: t.spacing.sm }}>
                        <Text variant="small" weight="600">
                          {tr('compliance:utilization.creditFrom', { head: headLabel(from), amount: m(view.available[from]) })}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md }}>
                          {HEADS.filter((to) => creditMayPay(from, to)).map((to) =>
                            field(inputs.credit[from][to], (v) => setInputs((x) => x && { ...x, credit: { ...x.credit, [from]: { ...x.credit[from], [to]: v } } }), tr('compliance:utilization.toHead', { head: headLabel(to) })),
                          )}
                        </View>
                      </View>
                    ))}
                  </FormSection>
                  <FormSection title={tr('compliance:utilization.cashSection')}>
                    {CASH_ROWS.filter((r) => r !== 'oldReverseCharge' || HEADS.some((h) => view.oldReverseChargeOpen[h])).map((r) => (
                      <View key={r} style={{ gap: t.spacing.sm }}>
                        <Text variant="small" weight="600">
                          {tr(`compliance:utilization.row.${r}`)}
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md }}>
                          {HEADS.map((h) => field(inputs.cash[r][h], (v) => setInputs((x) => x && { ...x, cash: { ...x.cash, [r]: { ...x.cash[r], [h]: v } } }), headLabel(h)))}
                        </View>
                      </View>
                    ))}
                    <Text variant="caption" tone="muted">
                      {tr('compliance:utilization.rcmCash', { amount: m(HEADS.reduce((a, h) => a + view.reverseCharge[h], 0)) })}
                    </Text>
                  </FormSection>
                  {needed ? (
                    <KeyFigures
                      rows={HEADS.filter((h) => needed[h] || view.cashBalance[h]).map((h) => ({
                        label: tr('compliance:utilization.cashNeeded', { head: headLabel(h) }),
                        value: `${m(needed[h])} / ${m(view.cashBalance[h])}`,
                        tone: needed[h] > view.cashBalance[h] ? 'bad' : 'good',
                      }))}
                    />
                  ) : null}
                  {rules.map((i) => (
                    <Text key={i.field + i.message} variant="caption" tone="bad">
                      {i.message}
                    </Text>
                  ))}
                  {short.length ? (
                    <Card style={{ gap: t.spacing.sm }}>
                      <Text variant="body" weight="700" tone="bad">
                        {tr('compliance:utilization.short')}
                      </Text>
                      {short.map((i) => (
                        <Text key={i.field} variant="small" tone="muted">
                          {i.message}
                        </Text>
                      ))}
                      <Button title={tr('compliance:returns.recordChallan')} icon="bank-plus" size="sm" onPress={recordChallan} />
                    </Card>
                  ) : null}
                  <TextField label={tr('books:vouchers.narration')} value={narration} onChangeText={setNarration} placeholder={tr('compliance:utilization.narrationPlaceholder', { period: periodLabel(period) })} />
                  <Button title={tr('compliance:utilization.resetPrefill')} icon="restore" variant="ghost" size="sm" onPress={() => setInputs(toInputs(view.prefill as SetOff))} />
                </>
              ) : null}
            </>
          ) : null}
        </ScrollView>
        {view && !existing.length ? (
          <FormActions>
            <Button title={tr('compliance:utilization.post')} onPress={() => void post()} loading={busy} disabled={busy || !!issues.length} fullWidth size="lg" shortcut="S" />
          </FormActions>
        ) : null}
      </FormContainer>
      <SelectSheet visible={open === 'gstin'} onClose={() => setOpen(null)} title="GSTIN" options={gstins.map((x) => ({ value: x, label: x }))} value={g} onSelect={setGstin} />
      <SelectSheet visible={open === 'period'} onClose={() => setOpen(null)} title={tr('compliance:gstr2b.period')} options={periods.map((p) => ({ value: p, label: periodLabel(p) }))} value={period} onSelect={setPeriod} />
    </View>
  );
}
