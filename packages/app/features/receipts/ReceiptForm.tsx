import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { AmountField, PickerField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { FieldRow, FormContainer } from '@esmart/ui/components/Layout';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { accountFor, chartOfAccounts, type Account } from '@esmart/core/domain/ledger/accounts';
import { fromMajor, money, zero } from '@esmart/core/lib/money';
import { toAmountInput } from '@esmart/core/lib/format';
import { nowISO, today } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import type { LedgerGroup, Voucher } from '@esmart/core/types';
import { useServerSave } from '../../components/useServerSave';
import { useDebounced } from '../../components/useDebounced';
import { useAppStore } from '../../store/appStore';
import { usePartyRecord, usePartySearch, useServerBook } from '../../remote/queries';
import { uploadAttachment } from '../../remote/attachments';
import { knownToServer } from '../../remote/meta';
import { describeError } from '../../remote/errors';
import { useActiveCompany, useBaseCurrency, useDefaultBranchId, useParties } from '../../store/selectors';
import { useAccountName, useGroupName } from '../books/names';
import { CostCentreField } from '../books/CostCentreField';

const CASH: LedgerGroup[] = ['cashInHand', 'bankAccounts'];
const INCOME: LedgerGroup[] = ['indirectIncomes', 'directIncomes'];

/** What a receipt voucher was for, and where the money went: its credit and its debit line. */
export const receiptLines = (v: Voucher) => ({ into: v.lines.find((l) => l.debit.minor > 0), source: v.lines.find((l) => l.credit.minor > 0) });

/**
 * Money in that isn't from an invoice: interest, rent, a refund, capital brought in. Saved as a
 * receipt voucher (Dr the cash or bank account, Cr what it's for), so it is on the books at once.
 * Taxable income belongs on an invoice, which charges and reports the GST. `voucher` edits one.
 */
export function ReceiptForm({ voucher, onSaved }: { voucher?: Voucher; onSaved: (id: string) => void }) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['books', 'common', 'purchases']);
  const toast = useToast();
  const { run: serverSave, saving, blocked } = useServerSave();
  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const defaultBranchId = useDefaultBranchId();
  const saveVoucher = useAppStore((s) => s.saveVoucher);
  const saveLedgerAccount = useAppStore((s) => s.saveLedgerAccount);
  // The chart the server names accounts from, rather than every posting worked out on the device.
  const { book } = useServerBook();
  const nameOf = useAccountName();
  const groupName = useGroupName();

  const initial = voucher ? receiptLines(voucher) : undefined;
  const [amount, setAmount] = useState(initial?.into ? toAmountInput(initial.into.debit) : '');
  const [date, setDate] = useState(voucher?.date ?? today());
  const [into, setInto] = useState(initial?.into?.account ?? '');
  const [source, setSource] = useState(initial?.source?.account ?? '');
  const [costCentreId, setCostCentreId] = useState<string | undefined>(initial?.source?.costCentreId);
  const [partyId, setPartyId] = useState<string | undefined>(voucher?.partyId);
  const [from, setFrom] = useState('');
  const [reference, setReference] = useState(voucher?.reference ?? '');
  const [narration, setNarration] = useState(voucher?.narration ?? '');
  const [slipUri, setSlipUri] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState<'into' | 'source' | 'party' | null>(null);
  const [partyQuery, setPartyQuery] = useState('');
  const partySearch = usePartySearch(undefined, useDebounced(partyQuery), picking === 'party');
  usePartyRecord(partyId);
  const party = useParties().find((p) => p.id === partyId);

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
  const attached = voucher?.attachmentIds?.length ?? 0;

  const addIncome = async (name: string) => {
    const id = uid('lac');
    const res = await serverSave(
      () => saveLedgerAccount({ id, companyId: company.id, name: name.trim(), group: 'indirectIncomes', openingBalance: zero(baseCurrency), status: 'active', createdAt: nowISO() }),
      tr('books:accounts.saved'),
      { icon: 'format-list-bulleted-type' },
    );
    if (res) setSource(`acc:${res.id ?? id}`);
  };

  const attachSlip = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) setSlipUri(result.assets[0].uri);
  };

  const save = async () => {
    if (!ready) return;
    // A photo picked here goes up first; a new voucher isn't on the server yet, so it links through attachmentIds.
    const attachmentIds = [...(voucher?.attachmentIds ?? [])];
    if (slipUri) {
      setUploading(true);
      try {
        const uploaded = await toast.promise(
          uploadAttachment({ companyId: company.id, uri: slipUri, name: 'Receipt', ...(voucher && knownToServer(voucher.id) && { entityType: 'voucher', entityId: voucher.id }) }),
          {
            loading: tr('purchases:form.receiptUploading'),
            success: tr('purchases:form.receiptAttached'),
            error: (err) => tr('purchases:form.receiptUploadFailed', { reason: describeError(err, tr) }),
            icon: 'paperclip-check',
          },
        );
        attachmentIds.push(uploaded.id);
      } catch {
        return;
      } finally {
        setUploading(false);
      }
    }
    const payer = from.trim();
    const record: Voucher = {
      ...(voucher ?? { id: uid('vch'), companyId: company.id, branchId: defaultBranchId ?? '', number: '', createdBy: '', createdAt: nowISO() }),
      kind: 'receipt',
      date,
      narration: [!partyId && payer && tr('books:receipts.fromNarration', { name: payer }), narration.trim()].filter(Boolean).join(' · ') || undefined,
      reference: reference.trim() || undefined,
      partyId,
      attachmentIds,
      lines: [
        { account: into, debit: money(minor, baseCurrency), credit: zero(baseCurrency) },
        { account: source, debit: zero(baseCurrency), credit: money(minor, baseCurrency), ...(costCentreId && { costCentreId }) },
      ],
    };
    const res = await serverSave(() => saveVoucher(record), tr('books:receipts.saved'), { icon: 'cash-plus' });
    if (res) onSaved(res.id ?? record.id);
  };

  const options = (list: Account[]) => list.map((a) => ({ value: a.key, label: nameOf(a), description: groupName(a.group) }));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormContainer wide>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          <AmountField label={tr('books:receipts.amount')} value={amount} onChangeValue={setAmount} currency={baseCurrency} size={desktop ? 'md' : 'lg'} required autoFocus={!voucher} />
          <FieldRow>
            <PickerField label={tr('books:receipts.source')} value={label(source)} placeholder={tr('books:receipts.pickSource')} onPress={() => setPicking('source')} icon="tag-outline" required hint={tr('books:receipts.sourceHint')} />
            <PickerField label={tr('books:receipts.into')} value={label(into)} placeholder={tr('books:receipts.pickInto')} onPress={() => setPicking('into')} icon="bank-outline" required />
          </FieldRow>
          <DateField label={tr('books:vouchers.date')} value={date} onChange={setDate} maximumDate={new Date()} />
          <PickerField
            label={tr('books:receipts.party')}
            value={party?.name}
            placeholder={tr('books:receipts.partyPlaceholder')}
            onPress={() => setPicking('party')}
            icon="account-outline"
            clearable
            onClear={() => setPartyId(undefined)}
          />
          {!partyId ? <TextField label={tr('books:receipts.from')} value={from} onChangeText={setFrom} placeholder={tr('books:receipts.fromPlaceholder')} icon="account-question-outline" /> : null}
          <FieldRow>
            <CostCentreField value={costCentreId} onChange={setCostCentreId} />
            <TextField label={tr('books:vouchers.reference')} value={reference} onChangeText={setReference} placeholder={tr('books:receipts.referencePlaceholder')} icon="pound" />
          </FieldRow>
          <TextField label={tr('books:vouchers.narration')} value={narration} onChangeText={setNarration} placeholder={tr('books:vouchers.narrationPlaceholder')} multiline />
          <Pressable onPress={() => void attachSlip()} accessibilityRole="button" accessibilityLabel={tr('books:receipts.attach')}>
            <Card variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
              <Icon name={slipUri || attached ? 'check-circle' : 'paperclip'} size={20} color={slipUri || attached ? t.c.good : t.c.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="600">
                  {slipUri ? tr('books:receipts.attachReady') : attached ? tr('books:receipts.attached', { count: attached }) : tr('books:receipts.attach')}
                </Text>
                <Text variant="caption" tone="muted">
                  {tr('books:receipts.attachHint')}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color={t.c.muted} />
            </Card>
          </Pressable>
        </ScrollView>
        <FormActions>
          <Button title={tr('books:receipts.save')} onPress={() => void save()} loading={saving || uploading} disabled={blocked || uploading || !ready} fullWidth shortcut="S" />
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
      <SelectSheet
        visible={picking === 'party'}
        onClose={() => setPicking(null)}
        title={tr('books:receipts.party')}
        options={(partySearch.data ?? []).map((p) => ({ value: p.id!, label: p.name!, description: p.phone ?? p.code }))}
        onQueryChange={setPartyQuery}
        loading={partySearch.isFetching}
        value={partyId}
        onSelect={setPartyId}
      />
    </KeyboardAvoidingView>
  );
}
