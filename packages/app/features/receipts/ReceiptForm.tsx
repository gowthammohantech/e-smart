import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { AmountField, PickerField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { FormContainer } from '@esmart/ui/components/Layout';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';
import { accountFor, chartOfAccounts, type Account } from '@esmart/core/domain/ledger/accounts';
import { fromMajor, money, zero } from '@esmart/core/lib/money';
import { nowISO, today } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import type { LedgerGroup, Voucher } from '@esmart/core/types';
import { useServerSave } from '../../components/useServerSave';
import { useAppStore } from '../../store/appStore';
import { useBooks } from '../../store/books';
import { useActiveCompany, useBaseCurrency, useDefaultBranchId } from '../../store/selectors';
import { useAccountName, useGroupName } from '../books/names';

const CASH: LedgerGroup[] = ['cashInHand', 'bankAccounts'];
const INCOME: LedgerGroup[] = ['indirectIncomes', 'directIncomes'];

/**
 * Money in that isn't from an invoice: interest, rent, a refund, capital brought in. Saved as a
 * receipt voucher (Dr the cash or bank account, Cr what it's for), so it is on the books at once.
 * Taxable income belongs on an invoice, which charges and reports the GST.
 */
export function ReceiptForm({ onSaved }: { onSaved: (id: string) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['books', 'common']);
  const { run: serverSave, saving, blocked } = useServerSave();
  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const defaultBranchId = useDefaultBranchId();
  const saveVoucher = useAppStore((s) => s.saveVoucher);
  const saveLedgerAccount = useAppStore((s) => s.saveLedgerAccount);
  const { book } = useBooks();
  const nameOf = useAccountName();
  const groupName = useGroupName();

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [into, setInto] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');
  const [picking, setPicking] = useState<'into' | 'source' | null>(null);

  const chart = useMemo(() => chartOfAccounts(book).filter((a) => a.key !== 'sys:openingStock'), [book]);
  const cash = chart.filter((a) => CASH.includes(a.group));
  // Incomes first; any other account that isn't cash or bank (a loan, capital) after them.
  const sources = useMemo(() => {
    const rest = chart.filter((a) => !CASH.includes(a.group));
    return [...rest.filter((a) => INCOME.includes(a.group)), ...rest.filter((a) => !INCOME.includes(a.group))];
  }, [chart]);
  const label = (key: string) => {
    const a = key ? accountFor(key, book) : undefined;
    return a ? nameOf(a) : undefined;
  };

  const minor = fromMajor(amount || '0', baseCurrency).minor;
  const ready = minor > 0 && !!into && !!source;

  const addIncome = async (name: string) => {
    const id = uid('lac');
    const res = await serverSave(
      () => saveLedgerAccount({ id, companyId: company.id, name: name.trim(), group: 'indirectIncomes', openingBalance: zero(baseCurrency), status: 'active', createdAt: nowISO() }),
      tr('books:accounts.saved'),
      { icon: 'format-list-bulleted-type' },
    );
    if (res) setSource(`acc:${res.id ?? id}`);
  };

  const save = async () => {
    if (!ready) return;
    const party = from.trim();
    const record: Voucher = {
      id: uid('vch'),
      companyId: company.id,
      branchId: defaultBranchId ?? '',
      kind: 'receipt',
      number: '',
      date,
      narration: [party && tr('books:receipts.fromNarration', { name: party }), narration.trim()].filter(Boolean).join(' · ') || undefined,
      reference: reference.trim() || undefined,
      lines: [
        { account: into, debit: money(minor, baseCurrency), credit: zero(baseCurrency) },
        { account: source, debit: zero(baseCurrency), credit: money(minor, baseCurrency) },
      ],
      createdBy: '',
      createdAt: nowISO(),
    };
    const res = await serverSave(() => saveVoucher(record), tr('books:receipts.saved'), { icon: 'cash-plus' });
    if (res) onSaved(res.id ?? record.id);
  };

  const options = (list: Account[]) => list.map((a) => ({ value: a.key, label: nameOf(a), description: groupName(a.group) }));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormContainer>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          <AmountField label={tr('books:receipts.amount')} value={amount} onChangeValue={setAmount} currency={baseCurrency} size="lg" required autoFocus />
          <PickerField label={tr('books:receipts.source')} value={label(source)} placeholder={tr('books:receipts.pickSource')} onPress={() => setPicking('source')} icon="tag-outline" required hint={tr('books:receipts.sourceHint')} />
          <PickerField label={tr('books:receipts.into')} value={label(into)} placeholder={tr('books:receipts.pickInto')} onPress={() => setPicking('into')} icon="bank-outline" required />
          <DateField label={tr('books:vouchers.date')} value={date} onChange={setDate} maximumDate={new Date()} />
          <TextField label={tr('books:receipts.from')} value={from} onChangeText={setFrom} placeholder={tr('books:receipts.fromPlaceholder')} icon="account-outline" />
          <TextField label={tr('books:vouchers.reference')} value={reference} onChangeText={setReference} placeholder={tr('books:receipts.referencePlaceholder')} icon="pound" />
          <TextField label={tr('books:vouchers.narration')} value={narration} onChangeText={setNarration} placeholder={tr('books:vouchers.narrationPlaceholder')} multiline />
        </ScrollView>
        <FormActions>
          <Button title={tr('books:receipts.save')} onPress={() => void save()} loading={saving} disabled={blocked || !ready} fullWidth size="lg" shortcut="S" />
        </FormActions>
      </FormContainer>

      <SelectSheet
        visible={picking === 'source'}
        onClose={() => setPicking(null)}
        title={tr('books:receipts.pickSource')}
        options={options(sources)}
        value={source}
        onSelect={setSource}
        onCreate={(q) => void addIncome(q)}
        createLabel={(q) => tr('books:receipts.newIncome', { name: q })}
      />
      <SelectSheet visible={picking === 'into'} onClose={() => setPicking(null)} title={tr('books:receipts.pickInto')} options={options(cash)} value={into} onSelect={setInto} />
    </KeyboardAvoidingView>
  );
}
