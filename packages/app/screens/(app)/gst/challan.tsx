import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { Card } from '@esmart/ui/components/Card';
import { AmountField, PickerField, TextField } from '@esmart/ui/components/Field';
import { FormContainer, FormSection } from '@esmart/ui/components/Layout';
import { ListRow } from '@esmart/ui/components/ListRow';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { formatDate, nowISO, today } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { fromMajor, money } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import type { GstChallan, GstChallanHead, Voucher } from '@esmart/core/types';
import { useServerSave } from '../../../components/useServerSave';
import { useVoucherPages } from '../../../remote/queries';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useBaseCurrency, useDefaultBranchId, usePaymentAccounts } from '../../../store/selectors';

const HEADS = ['igst', 'cgst', 'sgst', 'cess'] as const;
const PARTS = ['tax', 'interest', 'penalty', 'fee', 'others'] as const;
type Head = (typeof HEADS)[number];
type Part = (typeof PARTS)[number];

/**
 * A GST challan (PMT-06): money paid from a bank or cash account into the portal's electronic cash
 * ledger, head by head and split as the challan splits it. Posts Dr GST cash ledger / Cr bank; the
 * set-off on the Utilization screen then takes it out (RULES 6.21).
 */
export default function GstChallanScreen() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['compliance', 'books', 'common']);
  const params = useLocalSearchParams<{ igst?: string; cgst?: string; sgst?: string; cess?: string; back?: string }>();
  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const defaultBranchId = useDefaultBranchId();
  const accounts = usePaymentAccounts().filter((a) => a.currency === baseCurrency);
  const saveVoucher = useAppStore((s) => s.saveVoucher);
  const { run: serverSave, saving, blocked } = useServerSave();
  const recent = useVoucherPages({ kind: 'gstChallan', status: 'posted' });

  const [bank, setBank] = useState<string | undefined>(accounts.find((a) => a.type === 'bank')?.id);
  const [picking, setPicking] = useState(false);
  const [cpin, setCpin] = useState('');
  const [cin, setCin] = useState('');
  const [brn, setBrn] = useState('');
  const [date, setDate] = useState(today());
  // Opened from Utilization with what is short: the tax under each head, in rupees.
  const [amounts, setAmounts] = useState<Record<Head, Record<Part, string>>>(() =>
    Object.fromEntries(HEADS.map((h) => [h, { tax: params[h] ?? '', interest: '', penalty: '', fee: '', others: '' }])) as Record<Head, Record<Part, string>>,
  );
  const minor = (v: string) => fromMajor(v || '0', baseCurrency).minor;
  const headTotal = (h: Head) => PARTS.reduce((a, p) => a + minor(amounts[h][p]), 0);
  const total = HEADS.reduce((a, h) => a + headTotal(h), 0);
  const cpinBad = !/^[0-9A-Za-z]{14}$/.test(cpin.trim());
  const problem = !bank ? tr('compliance:challan.pickBank') : cpinBad ? tr('compliance:challan.cpinInvalid') : total <= 0 ? tr('compliance:challan.noAmount') : null;

  const save = async () => {
    if (problem || !bank) return;
    const heads: GstChallan['heads'] = {};
    for (const h of HEADS) {
      if (!headTotal(h)) continue;
      heads[h] = Object.fromEntries(PARTS.map((p) => [p, minor(amounts[h][p])])) as GstChallanHead;
    }
    const record: Voucher = {
      id: uid('vch'),
      companyId: company.id,
      branchId: defaultBranchId ?? '',
      kind: 'gstChallan',
      number: '',
      status: 'posted',
      date,
      reference: cpin.trim(),
      narration: tr('compliance:challan.narration', { cpin: cpin.trim() }),
      gstChallan: { cpin: cpin.trim(), ...(cin.trim() && { cin: cin.trim() }), ...(brn.trim() && { brn: brn.trim() }), depositedOn: date, heads },
      lines: [
        ...HEADS.filter((h) => headTotal(h)).map((h) => ({ account: `sys:gstCashLedger:${h}`, debit: money(headTotal(h), baseCurrency), credit: money(0, baseCurrency) })),
        { account: `pay:${bank}`, debit: money(0, baseCurrency), credit: money(total, baseCurrency) },
      ],
      createdBy: '',
      createdAt: nowISO(),
    };
    const res = await serverSave(() => saveVoucher(record), tr('compliance:challan.saved'), { icon: 'bank-plus', detail: formatMoney(money(total, baseCurrency)) });
    if (!res) return;
    if (params.back) router.back();
    else {
      setCpin('');
      setCin('');
      setBrn('');
      setAmounts(Object.fromEntries(HEADS.map((h) => [h, { tax: '', interest: '', penalty: '', fee: '', others: '' }])) as Record<Head, Record<Part, string>>);
      void recent.refetch();
    }
  };

  const headLabel = (h: Head) => (h === 'cess' ? tr('compliance:returns.head.cess') : h.toUpperCase());
  const rows = recent.rows.slice(0, 10);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: tr('compliance:challan.title') }} />
      <FormContainer wide>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          <Text variant="small" tone="muted">
            {tr('compliance:challan.hint')}
          </Text>
          <PickerField label={tr('compliance:challan.paidFrom')} value={accounts.find((a) => a.id === bank)?.name} placeholder={tr('books:transfer.pickAccount')} onPress={() => setPicking(true)} icon="bank-outline" required />
          <TextField label={tr('compliance:challan.cpin')} value={cpin} onChangeText={(v) => setCpin(v.replace(/[^0-9A-Za-z]/g, '').slice(0, 14))} hint={tr('compliance:challan.cpinHint')} required />
          <View style={{ flexDirection: 'row', gap: t.spacing.md, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 200 }}>
              <TextField label={tr('compliance:challan.cin')} value={cin} onChangeText={(v) => setCin(v.slice(0, 20))} />
            </View>
            <View style={{ flex: 1, minWidth: 200 }}>
              <TextField label={tr('compliance:challan.brn')} value={brn} onChangeText={(v) => setBrn(v.slice(0, 40))} />
            </View>
          </View>
          <DateField label={tr('compliance:challan.depositedOn')} value={date} onChange={setDate} maximumDate={new Date()} />
          {HEADS.map((h) => (
            <FormSection key={h} title={`${headLabel(h)} · ${formatMoney(money(headTotal(h), baseCurrency))}`}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.md }}>
                {PARTS.map((p) => (
                  <View key={p} style={{ flexGrow: 1, flexBasis: 140 }}>
                    <AmountField label={tr(`compliance:challan.part.${p}`)} value={amounts[h][p]} onChangeValue={(v) => setAmounts((a) => ({ ...a, [h]: { ...a[h], [p]: v } }))} currency={baseCurrency} align="right" />
                  </View>
                ))}
              </View>
            </FormSection>
          ))}
          <Text variant="body" weight="700">
            {tr('compliance:challan.total', { amount: formatMoney(money(total, baseCurrency)) })}
          </Text>
          {problem && (cpin || total) ? (
            <Text variant="caption" tone="bad">
              {problem}
            </Text>
          ) : null}
          <FormSection title={tr('compliance:challan.recent')}>
            {rows.length ? (
              <Card padded={false}>
                {rows.map((v, i) => (
                  <ListRow
                    key={v.id}
                    title={v.gstChallan?.cpin ?? v.number}
                    subtitle={[v.number, formatDate(v.date), v.gstChallan?.cin].filter(Boolean).join(' · ')}
                    right={
                      <Text variant="small" weight="600">
                        {formatMoney(money(v.lines.reduce((a, l) => a + l.debit.minor, 0), baseCurrency))}
                      </Text>
                    }
                    divider={i < rows.length - 1}
                    chevron
                    onPress={() => router.push(`/(app)/books/vouchers/${v.id}` as never)}
                  />
                ))}
              </Card>
            ) : (
              <Text variant="small" tone="muted">
                {tr('compliance:challan.none')}
              </Text>
            )}
          </FormSection>
        </ScrollView>
        <FormActions>
          <Button title={tr('compliance:challan.save')} onPress={() => void save()} loading={saving} disabled={blocked || !!problem} fullWidth size="lg" shortcut="S" />
        </FormActions>
      </FormContainer>
      <SelectSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={tr('books:transfer.pickAccount')}
        options={accounts.map((a) => ({ value: a.id, label: a.name, description: tr(a.type === 'cash' ? 'books:group.cashInHand' : 'books:group.bankAccounts') }))}
        value={bank}
        onSelect={setBank}
      />
    </KeyboardAvoidingView>
  );
}
