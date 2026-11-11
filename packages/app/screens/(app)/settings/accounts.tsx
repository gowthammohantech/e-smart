import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Cell, DataTable } from '@esmart/ui/components/DataTable';
import { Sheet } from '@esmart/ui/components/Sheet';
import { AmountField, PickerField, Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { CURRENCIES } from '@esmart/core/lib/currencies';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { today } from '@esmart/core/lib/date';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { PaymentAccount } from '@esmart/core/types';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useBaseCurrency, useHasModule, usePaymentAccounts } from '../../../store/selectors';
import { useCompanyUsage } from '../../../remote/queries';
import { formatMoney } from '@esmart/core/lib/format';
import { money, toMajor } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { SheetActions } from '../../../features/company/SheetActions';
import { paymentAccountFromForm } from '../../../features/settings/paymentAccountForm';
import { useServerSave } from '../../../components/useServerSave';
import { Skeleton, SkeletonGroup } from '@esmart/ui/components/Skeleton';

/** A sample UPI ID for the field's placeholder: an address, the same in every language. */
const UPI_SAMPLE = 'business@okhdfc';

export default function AccountSettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  const { t: tr } = useTranslation(['nav', 'settings', 'common']);
  const { run: serverSave, saving } = useServerSave();

  const company = useActiveCompany();
  // The bank account the invoices print (Business profile), where customers pay.
  const invoiceAccountId = company?.bankDetails?.paymentAccountId;
  const baseCurrency = useBaseCurrency();
  const accounts = usePaymentAccounts();
  const usageQuery = useCompanyUsage();
  const usage = usageQuery.data;
  // Until the server answers, a balance would only be the opening one: a placeholder instead.
  const balancesPending = !usage && !usageQuery.isError;
  const savePaymentAccount = useAppStore((s) => s.savePaymentAccount);
  const removePaymentAccount = useAppStore((s) => s.removePaymentAccount);

  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PaymentAccount | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<PaymentAccount['type']>('bank');
  // An account keeps the currency it was made in; another currency is a full-plan (fx) choice.
  const [currency, setCurrency] = useState(baseCurrency);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const hasFx = useHasModule('fx');
  const [accountNumber, setAccountNumber] = useState('');
  // What a customer needs to pay into it; printed on invoices when the business profile picks this account.
  const [holderName, setHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [errors, setErrors] = useState<{ ifsc?: string; upiId?: string }>({});
  const [openingBalance, setOpeningBalance] = useState('');
  // Blank: the balance stands at the start of the books. A date: it stands on that day.
  const [openingBalanceDate, setOpeningBalanceDate] = useState<string | undefined>(undefined);
  const [isDefault, setIsDefault] = useState(false);
  const typeLabels: Record<PaymentAccount['type'], string> = {
    bank: tr('settings:accounts.typeBank'),
    cash: tr('settings:accounts.typeCash'),
    wallet: tr('settings:accounts.typeWallet'),
  };

  /** Running balance: opening + money in − money out − expenses paid from it. */
  // From the server, which has every payment, expense and voucher; a new account starts at its opening.
  const balances = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, usage?.paymentAccounts[a.id]?.balance.minor ?? Math.round(a.openingBalance.minor * (a.openingRate ?? 1))])) as Record<string, number>,
    [accounts, usage],
  );

  const totalCash = Object.values(balances).reduce((a, b) => a + b, 0);
  // Bank, cash and wallet each summed, for the cells beside the total on a desktop.
  const typeTotals = (['bank', 'cash', 'wallet'] as const)
    .filter((type) => accounts.some((a) => a.type === type))
    .map((type) => ({ type, total: accounts.filter((a) => a.type === type).reduce((sum, a) => sum + (balances[a.id] ?? 0), 0) }));

  // Once money has gone through an account it stays, and so does its type: past
  // payments used methods the type allows. The server refuses both too. What's on this
  // device counts as well: the server's answer may be from before the last entry, or out of reach.
  const payments = useAppStore((s) => s.payments);
  const expenses = useAppStore((s) => s.expenses);
  const vouchers = useAppStore((s) => s.vouchers);
  const usedHere = (id: string) =>
    payments.some((p) => p.accountId === id) ||
    expenses.some((e) => e.accountId === id) ||
    vouchers.some((v) => v.lines.some((l) => l.account === `pay:${id}`));
  const inUse = !!editing?.id && ((usage?.paymentAccounts[editing.id]?.inUse ?? true) || usedHere(editing.id));
  // The business profile prints this account's details on invoices.
  const onInvoices = !!editing?.id && invoiceAccountId === editing.id;

  const open = (a?: PaymentAccount) => {
    setEditing(a ?? ({ id: '', companyId: company.id, name: '', type: 'bank', currency: baseCurrency, openingBalance: money(0, baseCurrency), isDefault: false } as PaymentAccount));
    setName(a?.name ?? '');
    setType(a?.type ?? 'bank');
    setCurrency(a?.currency ?? baseCurrency);
    setAccountNumber(a?.accountNumber ?? '');
    setHolderName(a?.accountHolderName ?? '');
    setBankName(a?.bankName ?? '');
    setBranchName(a?.branchName ?? '');
    setIfsc(a?.ifsc ?? '');
    setUpiId(a?.upiId ?? '');
    setErrors({});
    setOpeningBalance(a ? String(toMajor(a.openingBalance)) : '');
    setOpeningBalanceDate(a?.openingBalanceDate);
    setIsDefault(a?.isDefault ?? false);
  };

  const save = async () => {
    if (!editing || !name.trim()) return;
    // The same shapes the server checks, said here in words.
    const next = {
      ifsc: type === 'bank' && ifsc.trim() && !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc.trim()) ? tr('settings:company.ifscInvalid') : undefined,
      upiId: type === 'bank' && upiId.trim() && !/^[A-Za-z0-9.\-_]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$/.test(upiId.trim()) ? tr('settings:company.upiInvalid') : undefined,
    };
    setErrors(next);
    if (next.ifsc || next.upiId) return;
    const text = (v: string) => v.trim() || undefined;
    const account = {
      ...paymentAccountFromForm(
        editing,
        { name, type, currency, accountNumber, openingBalance, openingBalanceDate, isDefault },
        { id: editing.id || uid('acc'), companyId: company.id },
      ),
      // Only a bank account prints on invoices (it is what customers pay into), so only it keeps these.
      accountHolderName: type === 'bank' ? text(holderName) : undefined,
      bankName: type === 'bank' ? text(bankName) : undefined,
      branchName: type === 'bank' ? text(branchName) : undefined,
      ifsc: type === 'bank' ? text(ifsc)?.toUpperCase() : undefined,
      upiId: type === 'bank' ? text(upiId)?.toLowerCase() : undefined,
    };
    // The sheet stays open until the server has it, so a refusal can be fixed here.
    const res = await serverSave(
      () => savePaymentAccount(account),
      editing.id ? tr('settings:accounts.updated') : tr('settings:accounts.added'),
      { icon: 'bank-check' },
    );
    if (res) setEditing(null);
  };

  // Ctrl+S (⌘+S) does what Save does, while the form is open.
  useSaveShortcut(save, !!editing && !currencyOpen);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: tr('nav:title.paymentAccounts') }} />

      {/* The add button sits in the page header on a desktop, so no room is kept for a bottom bar.
          The total and the list both fill the page column, so they share one right edge. */}
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: desktop ? t.spacing.xxl : 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ paddingVertical: t.spacing.xl, ...(desktop ? { flexDirection: 'row', gap: t.spacing.xl } : null) }}>
          <View style={{ gap: 5, ...(desktop ? { flex: 2, minWidth: 0 } : null) }}>
            <Text variant="caption" tone="muted">{tr('settings:accounts.cashAndBank')}</Text>
            {balancesPending ? (
              <SkeletonGroup style={{ paddingVertical: 4 }}>
                <Skeleton height={28} width={160} />
              </SkeletonGroup>
            ) : (
              <Text variant="h1" weight="700" tone={totalCash >= 0 ? 'default' : 'bad'}>
                {formatMoney(money(totalCash, baseCurrency))}
              </Text>
            )}
            <Text variant="caption" tone="muted">{tr('settings:accounts.cashCaption')}</Text>
          </View>
          {/* A desktop fills the rest of the row with the total by kind, as equal cells. */}
          {desktop
            ? typeTotals.map((x) => (
                <View key={x.type} style={{ flex: 1, minWidth: 0, gap: 5, paddingLeft: t.spacing.lg, borderLeftWidth: 1, borderLeftColor: t.c.line }}>
                  <Text variant="caption" tone="muted">{typeLabels[x.type]}</Text>
                  {balancesPending ? (
                    <SkeletonGroup style={{ paddingVertical: 2 }}>
                      <Skeleton height={20} width={110} />
                    </SkeletonGroup>
                  ) : (
                    <Text variant="h3" weight="700" tone={x.total >= 0 ? 'default' : 'bad'}>
                      {formatMoney(money(x.total, baseCurrency))}
                    </Text>
                  )}
                </View>
              ))
            : null}
        </Card>

        <View style={{ height: t.spacing.lg }} />

        {desktop ? (
          // A desktop lists the accounts as a table: kind, number and running balance.
          <DataTable
            scroll={false}
            rows={accounts}
            rowKey={(a) => a.id}
            rowLabel={(a) => a.name}
            onRowPress={open}
            columns={[
              { key: 'name', header: tr('settings:accounts.name'), flex: 2, sortValue: (a) => a.name, render: (a) => <Cell weight="600">{a.name}</Cell> },
              { key: 'type', header: tr('common:table.type'), width: 120, sortValue: (a) => typeLabels[a.type], render: (a) => <Cell tone="muted">{typeLabels[a.type]}</Cell> },
              { key: 'number', header: tr('settings:accounts.number'), width: 180, secondary: true, render: (a) => <Cell tone="muted" mono>{a.accountNumber || '—'}</Cell> },
              {
                key: 'default',
                header: tr('common:table.status'),
                width: 180,
                render: (a) => (
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {a.isDefault ? <Badge label={tr('settings:accounts.default')} tone="info" size="sm" /> : null}
                    {a.id === invoiceAccountId ? <Badge label={tr('settings:accounts.onInvoices')} tone="success" size="sm" /> : null}
                  </View>
                ),
              },
              {
                key: 'balance',
                header: tr('settings:accounts.balance'),
                width: 180,
                align: 'right',
                sortValue: (a) => balances[a.id] ?? 0,
                render: (a) =>
                  balancesPending ? (
                    <SkeletonGroup>
                      <Skeleton height={14} width={72} />
                    </SkeletonGroup>
                  ) : (
                    <Cell weight="700" mono tone={(balances[a.id] ?? 0) < 0 ? 'bad' : 'default'}>
                      {formatMoney(money(balances[a.id] ?? 0, baseCurrency))}
                    </Cell>
                  ),
              },
            ]}
          />
        ) : (
          <Card padded={false}>
            {accounts.map((a, i) => (
              <ListRow
                key={a.id}
                title={a.name}
                subtitle={a.accountNumber ?? typeLabels[a.type]}
                icon={a.type === 'cash' ? 'cash' : a.type === 'wallet' ? 'wallet-outline' : 'bank-outline'}
                divider={i < accounts.length - 1}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    {balancesPending ? (
                      <SkeletonGroup>
                        <Skeleton height={14} width={72} />
                      </SkeletonGroup>
                    ) : (
                      <Text variant="small" weight="700">
                        {formatMoney(money(balances[a.id] ?? 0, baseCurrency))}
                      </Text>
                    )}
                    {a.isDefault ? <Badge label={tr('settings:accounts.default')} tone="info" size="sm" /> : null}
                    {a.id === invoiceAccountId ? <Badge label={tr('settings:accounts.onInvoices')} tone="success" size="sm" /> : null}
                  </View>
                }
                onPress={() => open(a)}
                chevron
              />
            ))}
          </Card>
        )}
      </ScrollView>

      <PrimaryActionBar title={tr('settings:accounts.add')} icon="plus" onPress={() => open()} />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        desktopAs="drawer"
        title={editing?.id ? tr('settings:accounts.editTitle') : tr('settings:accounts.add')}
        footer={
          <SheetActions
            saveLabel={tr('settings:accounts.save')}
            onSave={save}
            saving={saving}
            saveDisabled={!name.trim()}
            deleteLabel={tr('settings:accounts.delete')}
            onDelete={
              editing?.id && accounts.length > 1 && !inUse
                ? () => {
                  const a = editing;
                  setEditing(null);
                  setConfirmDelete(a);
                }
                : undefined
            }
          />
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <View style={{ gap: t.spacing.xs }}>
            <Segmented
              options={[
                { value: 'bank', label: typeLabels.bank },
                { value: 'cash', label: typeLabels.cash },
                { value: 'wallet', label: typeLabels.wallet },
              ]}
              value={type}
              onChange={(v) => setType(v as PaymentAccount['type'])}
              disabled={inUse || onInvoices}
            />
            {inUse ? <Text variant="caption" tone="muted">{tr('settings:accounts.inUse')}</Text> : onInvoices ? <Text variant="caption" tone="muted">{tr('settings:accounts.onInvoicesType')}</Text> : null}
          </View>
          <TextField label={tr('settings:accounts.name')} value={name} onChangeText={setName} placeholder={tr('settings:accounts.namePlaceholder')} icon="bank-outline" required />
          {type !== 'bank' ? null : (
            <>
              <View style={{ gap: 2 }}>
                <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {tr('settings:accounts.payDetails')}
                </Text>
                <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
                  {onInvoices ? tr('settings:accounts.payDetailsOnInvoices') : tr('settings:accounts.payDetailsHint')}
                </Text>
              </View>
              <TextField label={tr('settings:company.accountName')} value={holderName} onChangeText={setHolderName} icon="account-outline" placeholder={company.legalName || company.name} />
              <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
                <TextField label={tr('settings:company.bankName')} value={bankName} onChangeText={setBankName} icon="bank-outline" containerStyle={{ flex: 1 }} />
                <TextField label={tr('settings:company.branchName')} value={branchName} onChangeText={setBranchName} containerStyle={{ flex: 1 }} />
              </View>
              <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
                <TextField label={tr('settings:accounts.number')} value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" icon="pound" containerStyle={{ flex: 1 }} />
                <TextField
                  label={tr('settings:company.ifsc')}
                  value={ifsc}
                  onChangeText={(v) => setIfsc(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))}
                  autoCapitalize="characters"
                  placeholder="HDFC0001234"
                  error={errors.ifsc}
                  containerStyle={{ flex: 1 }}
                />
              </View>
              <TextField
                label={tr('settings:company.upiId')}
                value={upiId}
                onChangeText={(v) => setUpiId(v.trim())}
                autoCapitalize="none"
                keyboardType="email-address"
                icon="qrcode"
                placeholder={UPI_SAMPLE}
                error={errors.upiId}
              />
            </>
          )}
          {/* Shown on a full plan, or for an account already in another currency. Fixed once money has gone through it. */}
          {hasFx || currency !== baseCurrency ? (
            <PickerField
              label={tr('settings:accounts.currency')}
              value={currency}
              onPress={() => setCurrencyOpen(true)}
              icon="cash-multiple"
              disabled={inUse}
              hint={currency !== baseCurrency ? tr('settings:accounts.currencyHint') : undefined}
            />
          ) : null}
          <AmountField label={tr('settings:accounts.openingBalance')} value={openingBalance} onChangeValue={setOpeningBalance} currency={currency} />
          {/* The day the balance was counted; never a future day. Off, it stands at the start of the books. */}
          <SwitchField
            label={tr('settings:accounts.openingOnDate')}
            description={tr('settings:accounts.openingOnDateHint')}
            value={!!openingBalanceDate}
            onValueChange={(on) => setOpeningBalanceDate(on ? today() : undefined)}
          />
          {openingBalanceDate ? (
            <DateField
              label={tr('settings:accounts.openingBalanceDate')}
              value={openingBalanceDate}
              onChange={setOpeningBalanceDate}
              maximumDate={new Date()}
              hint={tr('settings:accounts.openingBalanceDateHint')}
            />
          ) : null}
          <SwitchField label={tr('settings:accounts.useDefault')} description={tr('settings:accounts.useDefaultHint')} value={isDefault} onValueChange={setIsDefault} />
        </View>
      </Sheet>

      <SelectSheet
        visible={currencyOpen}
        onClose={() => setCurrencyOpen(false)}
        title={tr('settings:accounts.currency')}
        options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})`, trailing: c.symbol }))}
        value={currency}
        onSelect={setCurrency}
      />

      <ConfirmDialog
        visible={!!confirmDelete}
        title={tr('settings:accounts.deleteTitle', { name: confirmDelete?.name })}
        message={tr('settings:accounts.deleteMessage')}
        confirmLabel={tr('settings:accounts.delete')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const a = confirmDelete;
          setConfirmDelete(null);
          if (a) void serverSave(() => removePaymentAccount(a.id), tr('settings:accounts.deleted'), { icon: 'bank-remove' });
        }}
      />
    </View>
  );
}
