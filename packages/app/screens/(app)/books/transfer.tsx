import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
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
import type { Voucher } from '@esmart/core/types';
import { CardRowsSkeleton } from '../../../components/ScreenSkeleton';
import { useServerSave } from '../../../components/useServerSave';
import { useVoucherPages } from '../../../remote/queries';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useBaseCurrency, useDefaultBranchId, usePaymentAccounts } from '../../../store/selectors';

/**
 * The transfer entry: money from one cash or bank account to another (a deposit, a withdrawal, a
 * transfer between banks), posted as a contra voucher. The server checks it as any contra
 * (apps/api/src/modules/books/handlers.ts): cash and bank only, and never more than the account holds.
 */
export default function TransferScreen() {
  // On web the page stays put across a business switch; the picked accounts belong to the old one.
  const companyId = useAppStore((s) => s.activeCompanyId);
  return <TransferForm key={companyId} />;
}

function TransferForm() {
  const t = useTheme();
  const router = useRouter();
  const { t: tr } = useTranslation(['books', 'common']);
  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const defaultBranchId = useDefaultBranchId();
  const accounts = usePaymentAccounts().filter((a) => a.currency === baseCurrency);
  const saveVoucher = useAppStore((s) => s.saveVoucher);
  const { run: serverSave, saving, blocked } = useServerSave();
  const recent = useVoucherPages({ kind: 'contra', status: 'posted' });

  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const minor = fromMajor(amount || '0', baseCurrency).minor;
  const nameOf = (id?: string) => accounts.find((a) => a.id === id)?.name;
  const problem = !from || !to ? tr('books:transfer.pickBoth') : from === to ? tr('books:transfer.same') : minor <= 0 ? tr('books:transfer.noAmount') : null;

  const save = async () => {
    if (problem || !from || !to) return;
    const record: Voucher = {
      id: uid('vch'),
      companyId: company.id,
      branchId: defaultBranchId ?? '',
      kind: 'contra',
      number: '',
      status: 'posted',
      date,
      reference: reference.trim() || undefined,
      narration: narration.trim() || tr('books:transfer.defaultNarration', { from: nameOf(from), to: nameOf(to) }),
      lines: [
        { account: `pay:${to}`, debit: money(minor, baseCurrency), credit: money(0, baseCurrency) },
        { account: `pay:${from}`, debit: money(0, baseCurrency), credit: money(minor, baseCurrency) },
      ],
      createdBy: '',
      createdAt: nowISO(),
    };
    const res = await serverSave(() => saveVoucher(record), tr('books:transfer.saved'), { icon: 'bank-transfer', detail: formatMoney(money(minor, baseCurrency)) });
    if (res) {
      setAmount('');
      setReference('');
      setNarration('');
      void recent.refetch();
    }
  };

  const options = accounts.map((a) => ({ value: a.id, label: a.name, description: tr(a.type === 'cash' ? 'books:group.cashInHand' : 'books:group.bankAccounts') }));
  const rows = recent.rows.slice(0, 10);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: tr('books:transfer.title') }} />
      <FormContainer wide>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          <Text variant="small" tone="muted">
            {tr('books:transfer.hint')}
          </Text>
          <PickerField label={tr('books:transfer.from')} value={nameOf(from)} placeholder={tr('books:transfer.pickAccount')} onPress={() => setPicking('from')} icon="bank-outline" required />
          <PickerField label={tr('books:transfer.to')} value={nameOf(to)} placeholder={tr('books:transfer.pickAccount')} onPress={() => setPicking('to')} icon="bank-outline" required />
          <AmountField label={tr('books:transfer.amount')} value={amount} onChangeValue={setAmount} currency={baseCurrency} required />
          <DateField label={tr('books:vouchers.date')} value={date} onChange={setDate} maximumDate={new Date()} />
          <TextField label={tr('books:vouchers.reference')} value={reference} onChangeText={setReference} hint={tr('books:transfer.referenceHint')} icon="pound" />
          <TextField label={tr('books:vouchers.narration')} value={narration} onChangeText={setNarration} placeholder={tr('books:vouchers.narrationPlaceholder')} multiline />
          {problem && (from || to || amount) ? (
            <Text variant="caption" tone="bad">
              {problem}
            </Text>
          ) : null}

          <FormSection title={tr('books:transfer.recent')} action={<Button title={tr('books:transfer.allContras')} variant="ghost" size="sm" onPress={() => router.push('/(app)/books/vouchers?kind=contra' as never)} />}>
            {/* Not "No transfers yet" while they're on their way. */}
            {!rows.length && recent.isPending ? (
              <Card padded={false}>
                <CardRowsSkeleton rows={3} kind="list" />
              </Card>
            ) : rows.length ? (
              <Card padded={false}>
                {rows.map((v, i) => {
                  const into = v.lines.find((l) => l.debit.minor > 0);
                  const out = v.lines.find((l) => l.credit.minor > 0);
                  const name = (key?: string) => nameOf(key?.replace(/^pay:/, '')) ?? key;
                  return (
                    <ListRow
                      key={v.id}
                      title={`${name(out?.account)} → ${name(into?.account)}`}
                      subtitle={[v.number, formatDate(v.date), v.reference].filter(Boolean).join(' · ')}
                      right={
                        <Text variant="small" weight="600">
                          {formatMoney(into?.debit ?? money(0, baseCurrency))}
                        </Text>
                      }
                      divider={i < rows.length - 1}
                      chevron
                      onPress={() => router.push(`/(app)/books/vouchers/${v.id}` as never)}
                    />
                  );
                })}
              </Card>
            ) : (
              <Text variant="small" tone="muted">
                {tr('books:transfer.none')}
              </Text>
            )}
          </FormSection>
        </ScrollView>
        <View>
          <FormActions>
            <Button title={tr('books:transfer.save')} onPress={() => void save()} loading={saving} disabled={blocked || !!problem} fullWidth shortcut="S" />
          </FormActions>
        </View>
      </FormContainer>
      <SelectSheet
        visible={!!picking}
        onClose={() => setPicking(null)}
        title={tr('books:transfer.pickAccount')}
        options={options.filter((o) => o.value !== (picking === 'from' ? to : from))}
        value={picking === 'from' ? from : to}
        onSelect={(id) => (picking === 'from' ? setFrom(id) : setTo(id))}
      />
    </KeyboardAvoidingView>
  );
}
