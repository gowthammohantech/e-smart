import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
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
import { FieldGrid, FieldRow, FormContainer } from '@esmart/ui/components/Layout';
import { useToast } from '@esmart/ui/components/Toast';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { accountFor, chartOfAccounts, type Account } from '@esmart/core/domain/ledger/accounts';
import { receiptSourceRule } from '@esmart/core/domain/ledger/voucherRules';
import { fromMajor, money, zero } from '@esmart/core/lib/money';
import { toAmountInput } from '@esmart/core/lib/format';
import { nowISO, today } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import type { LedgerGroup, Voucher } from '@esmart/core/types';
import { useServerSave } from '../../components/useServerSave';
import { useLeaveGuard } from '../../components/useLeaveGuard';
import { useSaveShortcut } from '../../components/useSaveShortcut';
import { useGoBack } from '../../navigation/useGoBack';
import { useDebounced } from '../../components/useDebounced';
import { useAppStore } from '../../store/appStore';
import { usePartyRecord, usePartySearch, useServerBook } from '../../remote/queries';
import { uploadAttachment } from '../../remote/attachments';
import { knownToServer } from '../../remote/meta';
import { describeError } from '../../remote/errors';
import { useActiveCompany, useBaseCurrency, useCurrentUser, useDefaultBranchId, useParties } from '../../store/selectors';
import { useAccountName, useGroupName } from '../books/names';
import { CostCentreField } from '../books/CostCentreField';
import { useCostCentres } from '../../store/books';
import { ReceivedForSheet, type ReceiptCarry } from './ReceivedForSheet';
import { useAddParty } from '../contacts/AddPartyButton';

const CASH: LedgerGroup[] = ['cashInHand', 'bankAccounts'];

/** What a receipt voucher was for, and where the money went: its credit and its debit line. */
export const receiptLines = (v: Voucher) => ({ into: v.lines.find((l) => l.debit.minor > 0), source: v.lines.find((l) => l.credit.minor > 0) });

/**
 * Money in that isn't from an invoice: interest, rent, a refund, capital brought in. Saved as a
 * receipt voucher (Dr the cash or bank account, Cr what it's for), so it is on the books at once.
 * Taxable income belongs on an invoice, which charges and reports the GST. `voucher` edits one.
 * A customer picked as what it's for is money against their invoices: `onPickCustomer` hands over to
 * the payment form, with what was typed so far (`seed` brings it back the other way).
 */
export function ReceiptForm({
  voucher,
  onSaved,
  onPickCustomer,
  seed,
  initialSource,
  initialSourceLabel,
}: {
  voucher?: Voucher;
  onSaved: (id: string) => void;
  onPickCustomer?: (partyId: string, carry: ReceiptCarry) => void;
  seed?: ReceiptCarry;
  /** What it's for, picked on the payment form before it handed over. */
  initialSource?: string;
  initialSourceLabel?: string;
}) {
  const t = useTheme();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['books', 'common', 'purchases']);
  const toast = useToast();
  const goBack = useGoBack();
  const { run: serverSave, saving, blocked } = useServerSave();
  const company = useActiveCompany();
  const role = useCurrentUser()?.role;
  const baseCurrency = useBaseCurrency();
  const defaultBranchId = useDefaultBranchId();
  const saveVoucher = useAppStore((s) => s.saveVoucher);
  const saveLedgerAccount = useAppStore((s) => s.saveLedgerAccount);
  // The chart the server names accounts from, rather than every posting worked out on the device.
  const { book } = useServerBook();
  const nameOf = useAccountName();
  const groupName = useGroupName();

  const initial = voucher ? receiptLines(voucher) : undefined;
  const [amount, setAmount] = useState(initial?.into ? toAmountInput(initial.into.debit) : (seed?.amount ?? ''));
  const [date, setDate] = useState(voucher?.date ?? seed?.date ?? today());
  const [into, setInto] = useState(initial?.into?.account ?? '');
  const [source, setSource] = useState(initial?.source?.account ?? initialSource ?? '');
  /** The name of a contact picked from the server's search, which the chart on the device may not hold. */
  const [sourceName, setSourceName] = useState<string | undefined>(initialSourceLabel);
  const [costCentreId, setCostCentreId] = useState<string | undefined>(initial?.source?.costCentreId);
  const [partyId, setPartyId] = useState<string | undefined>(voucher?.partyId);
  const [from, setFrom] = useState('');
  const [reference, setReference] = useState(voucher?.reference ?? seed?.reference ?? '');
  const [narration, setNarration] = useState(voucher?.narration ?? seed?.notes ?? '');
  const [slipUri, setSlipUri] = useState<string | undefined>();
  /** The files already on a saved receipt, kept unless removed or replaced. */
  const [keptIds, setKeptIds] = useState<string[]>(voucher?.attachmentIds ?? []);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState<'into' | 'source' | 'party' | null>(null);
  const [partyQuery, setPartyQuery] = useState('');
  const partySearch = usePartySearch(undefined, useDebounced(partyQuery), picking === 'party');
  usePartyRecord(partyId);
  const party = useParties().find((p) => p.id === partyId);

  const chart = useMemo(() => chartOfAccounts(book).filter((a) => a.key !== 'sys:openingStock'), [book]);
  const cash = chart.filter((a) => CASH.includes(a.group));
  const label = (key: string) => {
    const a = key ? accountFor(key, book) : undefined;
    return a ? nameOf(a) : undefined;
  };
  // Received for a supplier or another contact: it is their ledger, so they are the party too.
  const sourceParty = source.startsWith('party:') ? source.slice('party:'.length) : undefined;

  // A supplier's ledger, a control account or earlier years' profit: an owner or admin posts it, saying why (the server asks too).
  const needsNarration = !!source && receiptSourceRule(source, role) === 'narration';

  const minor = fromMajor(amount || '0', baseCurrency).minor;
  const ready = minor > 0 && !!into && !!source && (!needsNarration || !!narration.trim());
  const attached = keptIds.length;
  // What the person has picked or typed, to tell an untouched form from one with changes to lose.
  const entered = JSON.stringify([amount, date, into, source, costCentreId, partyId, from, reference, narration, slipUri, keptIds]);
  const [untouched] = useState(entered);
  // Handed over from the payment form with an amount typed there: that is a change to lose too.
  const leaveGuard = useLeaveGuard(entered !== untouched || !!seed?.amount);
  // Under Suppliers: money from that supplier's ledger, as picking one there does.
  const addSupplier = useAddParty('supplier', (p) => {
    setSource(`party:${p.id}`);
    setSourceName(p.name);
    setPartyId(undefined);
  });
  /** Hands over to the payment form for a customer, with what was typed here. */
  const pickCustomer = async (id: string) => {
    if (!onPickCustomer) return;
    await leaveGuard.release();
    onPickCustomer(id, { amount, date, reference, notes: narration });
  };
  const addCustomer = useAddParty('customer', (p) => void pickCustomer(p.id));

  const addIncome = async (name: string) => {
    const id = uid('lac');
    const res = await serverSave(
      () => saveLedgerAccount({ id, companyId: company.id, name: name.trim(), group: 'indirectIncomes', openingBalance: zero(baseCurrency), status: 'active', createdAt: nowISO() }),
      tr('books:accounts.saved'),
      { icon: 'format-list-bulleted-type' },
    );
    if (res) setSource(`acc:${res.id ?? id}`);
  };

  // A photo taken or picked here replaces any file already on the receipt.
  const attachSlip = async (from: 'camera' | 'library') => {
    if (from === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        toast.show(tr('purchases:form.cameraDenied'), 'warning', { icon: 'camera-outline' });
        return;
      }
    }
    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) setSlipUri(result.assets[0].uri);
  };

  const save = async () => {
    if (!ready) return;
    // A photo picked here goes up first; a new voucher isn't on the server yet, so it links through attachmentIds.
    const attachmentIds = slipUri ? [] : [...keptIds];
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
      narration: [!partyId && !sourceParty && payer && tr('books:receipts.fromNarration', { name: payer }), narration.trim()].filter(Boolean).join(' · ') || undefined,
      reference: reference.trim() || undefined,
      partyId: sourceParty ?? partyId,
      attachmentIds,
      lines: [
        { account: into, debit: money(minor, baseCurrency), credit: zero(baseCurrency) },
        { account: source, debit: zero(baseCurrency), credit: money(minor, baseCurrency), ...(costCentreId && { costCentreId }) },
      ],
    };
    const res = await serverSave(() => saveVoucher(record), tr('books:receipts.saved'), { icon: 'cash-plus' });
    if (!res) return;
    await leaveGuard.release();
    onSaved(res.id ?? record.id);
  };
  useSaveShortcut(() => void save(), !saving && !uploading && ready);

  const options = (list: Account[]) => list.map((a) => ({ value: a.key, label: nameOf(a), description: groupName(a.group) }));

  const amountField = <AmountField label={tr('books:receipts.amount')} value={amount} onChangeValue={setAmount} currency={baseCurrency} size={desktop ? 'md' : 'lg'} required autoFocus={!voucher} />;
  // A post-dated cheque or a receipt booked ahead is allowed, as on a payment.
  const dateField = <DateField label={tr('books:vouchers.date')} value={date} onChange={setDate} />;
  // The cost centre field shows nothing until the business has one; known here so the grid can pair what shows.
  const hasCostCentres = useCostCentres().length > 0 || !!costCentreId;
  const referenceField = <TextField label={tr('books:vouchers.reference')} value={reference} onChangeText={setReference} placeholder={tr('books:receipts.referencePlaceholder')} icon="pound" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormContainer wide>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          {/* A desktop pairs the short fields: amount with date, the source with where it went. */}
          {desktop ? (
            <FieldRow>
              {amountField}
              {dateField}
            </FieldRow>
          ) : (
            amountField
          )}
          <FieldRow>
            <PickerField label={tr('books:receipts.source')} value={label(source) ?? sourceName} placeholder={tr('books:receipts.pickSource')} onPress={() => setPicking('source')} icon="tag-outline" required hint={tr('books:receipts.sourceHint')} />
            <PickerField label={tr('books:receipts.into')} value={label(into)} placeholder={tr('books:receipts.pickInto')} onPress={() => setPicking('into')} icon="bank-outline" required />
          </FieldRow>
          {desktop ? null : dateField}
          {(() => {
            // Received for a contact's ledger: who it was from is already said.
            const partyField = sourceParty ? null : (
              <PickerField
                label={tr('books:receipts.party')}
                value={party?.name}
                placeholder={tr('books:receipts.partyPlaceholder')}
                onPress={() => setPicking('party')}
                icon="account-outline"
                clearable
                onClear={() => setPartyId(undefined)}
              />
            );
            const fromField = !partyId && !sourceParty ? <TextField label={tr('books:receipts.from')} value={from} onChangeText={setFrom} placeholder={tr('books:receipts.fromPlaceholder')} icon="account-question-outline" /> : null;
            const costCentreField = hasCostCentres ? <CostCentreField value={costCentreId} onChange={setCostCentreId} /> : null;
            // A desktop pairs whichever of these show, two to a row; an odd one out takes the row.
            return desktop ? (
              <FieldGrid items={[partyField, fromField, referenceField, costCentreField]} />
            ) : (
              <>
                {partyField}
                {fromField}
                {costCentreField}
                {referenceField}
              </>
            );
          })()}
          <TextField
            label={tr('books:vouchers.narration')}
            value={narration}
            onChangeText={setNarration}
            placeholder={tr('books:vouchers.narrationPlaceholder')}
            multiline
            required={needsNarration}
            hint={needsNarration ? tr('books:receipts.narrationRequired') : undefined}
          />
          <Card variant="flat" style={{ gap: t.spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
              {slipUri ? (
                <Image source={{ uri: slipUri }} style={{ width: 48, height: 48, borderRadius: t.radius.sm, backgroundColor: t.c.card2 }} accessibilityIgnoresInvertColors />
              ) : (
                <Icon name={attached ? 'check-circle' : 'paperclip'} size={20} color={attached ? t.c.good : t.c.primary} />
              )}
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="600">
                  {slipUri ? tr('books:receipts.attachReady') : attached ? tr('books:receipts.attached', { count: attached }) : tr('books:receipts.attach')}
                </Text>
                <Text variant="caption" tone="muted">
                  {tr('books:receipts.attachHint')}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
              {Platform.OS !== 'web' ? (
                <Button title={tr('purchases:form.takePhoto')} icon="camera-outline" size="sm" variant="secondary" onPress={() => void attachSlip('camera')} />
              ) : null}
              <Button title={tr('purchases:form.choosePhoto')} icon="image-outline" size="sm" variant="secondary" onPress={() => void attachSlip('library')} />
              {slipUri || attached ? (
                <Button
                  title={tr('purchases:form.removeReceipt')}
                  icon="trash-can-outline"
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    setSlipUri(undefined);
                    setKeptIds([]);
                  }}
                />
              ) : null}
            </View>
          </Card>
        </ScrollView>
        <FormActions>
          {desktop ? <Button title={tr('common:action.cancel')} variant="ghost" onPress={() => goBack(voucher ? `/(app)/receipts/${voucher.id}` : '/(app)/receipts')} /> : null}
          <Button title={tr('books:receipts.save')} onPress={() => void save()} loading={saving || uploading} disabled={blocked || uploading || !ready} fullWidth={!desktop} shortcut="S" />
        </FormActions>
      </FormContainer>

      <ReceivedForSheet
        visible={picking === 'source'}
        onClose={() => setPicking(null)}
        value={source}
        // A saved receipt voucher stays one: its customers' money goes through Receipts as a payment.
        customers={!!onPickCustomer}
        onPick={(picked) => {
          if (picked.kind === 'customer') {
            void pickCustomer(picked.partyId);
            return;
          }
          setSource(picked.key);
          setSourceName(picked.label);
          if (picked.key.startsWith('party:')) setPartyId(undefined);
        }}
        onCreateIncome={(name) => void addIncome(name)}
        onAdd={(kind) => (kind === 'supplier' ? addSupplier : onPickCustomer ? addCustomer : undefined)?.(() => setPicking(null))}
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
      {leaveGuard.dialog}
    </KeyboardAvoidingView>
  );
}
