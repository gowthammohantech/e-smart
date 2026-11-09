import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { SkeletonGroup, SkeletonRows } from '@esmart/ui/components/Skeleton';
import { Button } from '@esmart/ui/components/Button';
import { PickerField, SwitchField, TextField } from '@esmart/ui/components/Field';
import { Sheet } from '@esmart/ui/components/Sheet';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Text } from '@esmart/ui/components/Text';
import { PAYMENT_METHODS } from '@esmart/core/data/masters';
import { paymentMethodLabel } from '@esmart/core/labels';
import { formatDate } from '@esmart/core/lib/date';
import { formatMoney } from '@esmart/core/lib/format';
import { money } from '@esmart/core/lib/money';
import { chartOfAccounts } from '@esmart/core/domain/ledger/accounts';
import { buysFrom, sellsTo } from '@esmart/core/domain/partyKinds';
import type { PaymentMethod } from '@esmart/core/types';
import { useDebounced } from '../../components/useDebounced';
import { createExpenseFromBankLine, createPaymentFromBankLine, createVoucherFromBankLine, excludeBankLine, type BankRecordRef, matchBankLine, useBankMatchSearch } from '../../remote/banking';
import { useOpenDocuments, usePartySearch, useServerBook, type BankLine } from '../../remote/queries';
import { useAccountName, useGroupName } from '../books/names';
import { useExpenseCategories, useHasModule } from '../../store/selectors';
import { SignedAmount, signedMoney, useBankAction, useRecordLabel } from './parts';

/*
 * Each sheet is mounted for one line (BankLinesView keys it by the line), so it opens empty every time.
 */

/** The line a sheet is about, as its header shows it. */
function LineSummary({ line }: { line: BankLine }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="small" weight="600">
          {line.description || '—'}
        </Text>
        <Text variant="caption" tone="muted">
          {[formatDate(line.date), line.reference].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <SignedAmount minor={line.amount.minor} currency={line.amount.currency} />
    </View>
  );
}

/** Find…: the payments and expenses on the account near the line's date; the same amount can be matched. */
export function FindMatchSheet({ line, onClose }: { line: BankLine | null; onClose: () => void }) {
  const { t: tr } = useTranslation(['banking']);
  const [query, setQuery] = useState('');
  const search = useBankMatchSearch(line, useDebounced(query));
  const labelOf = useRecordLabel();
  const { run } = useBankAction();
  if (!line) return null;
  const options = (search.data ?? []).map((c) => ({
    value: `${c.type}:${c.id}`,
    label: labelOf(c),
    description: [c.reference, signedMoney(c.amountMinor, line.amount.currency)].filter(Boolean).join(' · '),
    blocked: c.amountMinor !== line.amount.minor ? tr('banking:find.amountDiffers', { amount: signedMoney(c.amountMinor, line.amount.currency), line: signedMoney(line.amount.minor, line.amount.currency) }) : undefined,
  }));
  return (
    <SelectSheet
      visible
      onClose={onClose}
      title={tr('banking:find.title')}
      subtitle={tr('banking:find.subtitle', { amount: signedMoney(line.amount.minor, line.amount.currency), date: formatDate(line.date) })}
      options={options}
      onQueryChange={setQuery}
      loading={search.isFetching}
      searchPlaceholder={tr('banking:find.search')}
      emptyMessage={tr('banking:find.none')}
      onSelect={(v) => {
        const [type, id] = v.split(':') as [BankRecordRef['type'], string];
        onClose();
        void run('match', () => matchBankLine(line, { type, id }), tr('banking:lines.matched'));
      }}
    />
  );
}

/** Record payment: money in from a customer, or out to a supplier, through this bank. */
export function RecordPaymentSheet({ line, onClose }: { line: BankLine | null; onClose: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['banking', 'common']);
  const into = (line?.amount.minor ?? 0) > 0;
  const [partyId, setPartyId] = useState<string>();
  const [partyName, setPartyName] = useState<string>();
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [notes, setNotes] = useState('');
  const [partyOpen, setPartyOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [partyQuery, setPartyQuery] = useState('');
  const parties = usePartySearch(into ? 'customer' : 'supplier', useDebounced(partyQuery), partyOpen);
  // What the money settles: the party's open invoices (or bills), oldest first, ticked until the line's amount runs out.
  const open = useOpenDocuments(partyId, into ? ['invoice', 'debitNote', 'openingInvoice'] : ['purchaseBill', 'supplierDebitNote', 'openingBill']);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const { run, busy } = useBankAction();
  const lineCurrency = line?.amount.currency;
  const docs = useMemo(
    () => (open.data ?? []).filter((d) => d.grandTotal.currency === lineCurrency && (d.outstanding?.minor ?? 0) > 0).sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number)),
    [open.data, lineCurrency],
  );
  if (!line) return null;
  const amount = Math.abs(line.amount.minor);
  const allocations = docs.reduce<{ documentId: string; amountMinor: number }[]>((acc, d) => {
    const used = acc.reduce((sum, a) => sum + a.amountMinor, 0);
    acc.push({ documentId: d.id, amountMinor: unticked.has(d.id) ? 0 : Math.min(amount - used, d.outstanding!.minor) });
    return acc;
  }, []);
  const left = amount - allocations.reduce((sum, a) => sum + a.amountMinor, 0);
  const cur = line.amount.currency;
  const allowed = (parties.data ?? []).filter((p) => p.kind && (into ? sellsTo(p.kind) : buysFrom(p.kind)));
  // Until the party's open invoices are here, a save would settle none of them and book it all as an advance.
  const docsLoading = !!partyId && open.isPending;
  const save = async () => {
    if (!partyId || docsLoading) return;
    const ok = await run('payment', () => createPaymentFromBankLine(line, { partyId, method, notes, allocations }), tr(into ? 'banking:record.paymentInSaved' : 'banking:record.paymentOutSaved'));
    if (ok) onClose();
  };
  return (
    <>
      <Sheet
        visible={!partyOpen && !methodOpen}
        onClose={onClose}
        title={tr(into ? 'banking:record.paymentInTitle' : 'banking:record.paymentOutTitle')}
        footer={<Button title={tr('banking:record.savePayment')} onPress={() => void save()} loading={busy === 'payment'} disabled={!partyId || docsLoading || !!busy} fullWidth />}
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <LineSummary line={line} />
          <PickerField
            label={tr(into ? 'banking:record.customer' : 'banking:record.supplier')}
            required
            value={partyName}
            placeholder={tr('banking:record.pickParty')}
            onPress={() => setPartyOpen(true)}
            icon="account-outline"
          />
          {docsLoading ? (
            <SkeletonGroup>
              <SkeletonRows rows={2} kind="list" icon={false} />
            </SkeletonGroup>
          ) : null}
          {partyId && docs.length ? (
            <View style={{ gap: t.spacing.sm }}>
              <Text variant="small" weight="600">
                {tr(into ? 'banking:record.settlesInvoices' : 'banking:record.settlesBills')}
              </Text>
              {docs.map((d, i) => (
                <SwitchField
                  key={d.id}
                  label={`${d.number} · ${formatDate(d.date)}`}
                  description={
                    allocations[i].amountMinor
                      ? tr('banking:record.allocates', { amount: formatMoney(money(allocations[i].amountMinor, cur)), due: formatMoney(d.outstanding!) })
                      : tr('banking:record.due', { due: formatMoney(d.outstanding!) })
                  }
                  value={!unticked.has(d.id)}
                  onValueChange={(on) =>
                    setUnticked((prev) => {
                      const next = new Set(prev);
                      if (on) next.delete(d.id);
                      else next.add(d.id);
                      return next;
                    })
                  }
                />
              ))}
              <Text variant="caption" tone={left ? 'warn' : 'muted'}>
                {left ? tr(into ? 'banking:record.advanceIn' : 'banking:record.advanceOut', { amount: formatMoney(money(left, cur)) }) : tr('banking:record.allAllocated')}
              </Text>
            </View>
          ) : null}
          <PickerField label={tr('banking:record.method')} value={paymentMethodLabel(tr, method)} onPress={() => setMethodOpen(true)} icon="credit-card-outline" />
          <TextField label={tr('banking:record.notes')} value={notes} onChangeText={setNotes} placeholder={tr('banking:record.optional')} multiline />
          <Text variant="caption" tone="muted">
            {tr('banking:record.paymentHint')}
          </Text>
        </View>
      </Sheet>
      <SelectSheet
        visible={partyOpen}
        onClose={() => setPartyOpen(false)}
        title={tr(into ? 'banking:record.customer' : 'banking:record.supplier')}
        options={allowed.map((p) => ({ value: p.id!, label: p.name! }))}
        onQueryChange={setPartyQuery}
        loading={parties.isFetching}
        value={partyId}
        emptyMessage={tr('banking:record.noParty')}
        onSelect={(v) => {
          setPartyId(v);
          setPartyName(allowed.find((p) => p.id === v)?.name);
          setUnticked(new Set());
          setPartyOpen(false);
        }}
      />
      <SelectSheet
        visible={methodOpen}
        onClose={() => setMethodOpen(false)}
        title={tr('banking:record.method')}
        options={PAYMENT_METHODS.map((value) => ({ value, label: paymentMethodLabel(tr, value) }))}
        value={method}
        searchable={false}
        onSelect={(v) => {
          setMethod(v as PaymentMethod);
          setMethodOpen(false);
        }}
      />
    </>
  );
}

/** Record expense: a debit line as an expense under a category, from a supplier if there was one. */
export function RecordExpenseSheet({ line, onClose }: { line: BankLine | null; onClose: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['banking', 'common']);
  const categories = useExpenseCategories();
  const [categoryId, setCategoryId] = useState<string>();
  const [supplierId, setSupplierId] = useState<string>();
  const [supplierName, setSupplierName] = useState<string>();
  const [notes, setNotes] = useState('');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierQuery, setSupplierQuery] = useState('');
  const suppliers = usePartySearch('supplier', useDebounced(supplierQuery), supplierOpen);
  const { run, busy } = useBankAction();
  if (!line) return null;
  const allowed = (suppliers.data ?? []).filter((p) => p.kind && buysFrom(p.kind));
  const save = async () => {
    if (!categoryId) return;
    const ok = await run('expense', () => createExpenseFromBankLine(line, { categoryId, supplierId, notes }), tr('banking:record.expenseSaved'));
    if (ok) onClose();
  };
  return (
    <>
      <Sheet
        visible={!categoryOpen && !supplierOpen}
        onClose={onClose}
        title={tr('banking:record.expenseTitle')}
        footer={<Button title={tr('banking:record.saveExpense')} onPress={() => void save()} loading={busy === 'expense'} disabled={!categoryId || !!busy} fullWidth />}
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <LineSummary line={line} />
          <PickerField
            label={tr('banking:record.category')}
            required
            value={categories.find((c) => c.id === categoryId)?.name}
            placeholder={tr('banking:record.pickCategory')}
            onPress={() => setCategoryOpen(true)}
            icon="shape-outline"
            hint={categories.length ? undefined : tr('banking:record.noCategories')}
          />
          <PickerField
            label={tr('banking:record.supplier')}
            value={supplierName}
            placeholder={tr('banking:record.optional')}
            onPress={() => setSupplierOpen(true)}
            icon="account-outline"
            clearable={!!supplierId}
            onClear={() => {
              setSupplierId(undefined);
              setSupplierName(undefined);
            }}
          />
          <TextField label={tr('banking:record.notes')} value={notes} onChangeText={setNotes} placeholder={tr('banking:record.optional')} multiline />
        </View>
      </Sheet>
      <SelectSheet
        visible={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title={tr('banking:record.category')}
        options={categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon as never }))}
        value={categoryId}
        emptyMessage={tr('banking:record.noCategories')}
        onSelect={(v) => {
          setCategoryId(v);
          setCategoryOpen(false);
        }}
      />
      <SelectSheet
        visible={supplierOpen}
        onClose={() => setSupplierOpen(false)}
        title={tr('banking:record.supplier')}
        options={allowed.map((p) => ({ value: p.id!, label: p.name! }))}
        onQueryChange={setSupplierQuery}
        loading={suppliers.isFetching}
        value={supplierId}
        emptyMessage={tr('banking:record.noParty')}
        onSelect={(v) => {
          setSupplierId(v);
          setSupplierName(allowed.find((p) => p.id === v)?.name);
          setSupplierOpen(false);
        }}
      />
    </>
  );
}

/**
 * Record to an account: interest the bank paid, a loan in or out, capital brought in, drawings. A
 * receipt voucher for money in, a journal for money out, against any account that isn't cash or bank
 * (a transfer between those is a contra, matched with Find). Parties and stock aren't offered: a
 * party's money is a payment, and stock moves with documents.
 */
export function RecordVoucherSheet({ line, onClose }: { line: BankLine | null; onClose: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['banking', 'common']);
  const { book, loaded } = useServerBook();
  const nameOf = useAccountName();
  const groupName = useGroupName();
  const [account, setAccount] = useState<string>();
  const [narration, setNarration] = useState(line?.description ?? '');
  const [picking, setPicking] = useState(false);
  const { run, busy } = useBankAction();
  const accounts = useMemo(
    () => chartOfAccounts(book).filter((a) => !['cashInHand', 'bankAccounts', 'stockInHand', 'sundryDebtors', 'sundryCreditors'].includes(a.group) && a.kind !== 'party'),
    [book],
  );
  if (!line) return null;
  const into = line.amount.minor > 0;
  const chosen = accounts.find((a) => a.key === account);
  const save = async () => {
    if (!account) return;
    const ok = await run('voucher', () => createVoucherFromBankLine(line, { account, narration }), tr('banking:record.voucherSaved'));
    if (ok) onClose();
  };
  return (
    <>
      <Sheet
        visible={!picking}
        onClose={onClose}
        title={tr(into ? 'banking:record.voucherInTitle' : 'banking:record.voucherOutTitle')}
        footer={<Button title={tr('banking:record.saveVoucher')} onPress={() => void save()} loading={busy === 'voucher'} disabled={!account || !!busy} fullWidth />}
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <LineSummary line={line} />
          <PickerField
            label={tr(into ? 'banking:record.accountIn' : 'banking:record.accountOut')}
            required
            value={chosen ? nameOf(chosen) : undefined}
            placeholder={tr('banking:record.pickAccount')}
            onPress={() => setPicking(true)}
            icon="book-open-variant"
          />
          <TextField label={tr('banking:record.narration')} value={narration} onChangeText={setNarration} placeholder={tr('banking:record.optional')} maxLength={500} />
          <Text variant="caption" tone="muted">
            {tr(into ? 'banking:record.voucherInHint' : 'banking:record.voucherOutHint')}
          </Text>
        </View>
      </Sheet>
      <SelectSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title={tr('banking:record.pickAccount')}
        // The chart is still on its way: shimmer rows, not a short list of system accounts.
        options={loaded ? accounts.map((a) => ({ value: a.key, label: nameOf(a), description: groupName(a.group) })) : []}
        loading={!loaded}
        value={account}
        onSelect={(v) => {
          setAccount(v);
          setPicking(false);
        }}
      />
    </>
  );
}

/** Exclude: a line the books needn't have (a transfer already in, a bank's own reversal), with why. */
export function ExcludeSheet({ line, onClose }: { line: BankLine | null; onClose: () => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['banking']);
  const [reason, setReason] = useState('');
  const { run, busy } = useBankAction();
  if (!line) return null;
  const save = async () => {
    const ok = await run('exclude', () => excludeBankLine(line, reason), tr('banking:lines.excludedToast'));
    if (ok) onClose();
  };
  return (
    <Sheet
      visible
      onClose={onClose}
      title={tr('banking:exclude.title')}
      footer={<Button title={tr('banking:exclude.confirm')} variant="danger" onPress={() => void save()} loading={busy === 'exclude'} disabled={!!busy} fullWidth />}
    >
      <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
        <LineSummary line={line} />
        <Text variant="small" tone="muted">
          {tr('banking:exclude.body')}
        </Text>
        <TextField label={tr('banking:exclude.reason')} value={reason} onChangeText={setReason} placeholder={tr('banking:exclude.reasonPlaceholder')} maxLength={500} />
      </View>
    </Sheet>
  );
}
