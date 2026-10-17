import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { PrimaryActionBar } from '@esmart/ui/components/ActionBar';
import { ListRow } from '@esmart/ui/components/ListRow';
import { Sheet } from '@esmart/ui/components/Sheet';
import { AmountField, Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast } from '@esmart/ui/components/Toast';
import { PaymentAccount } from '@esmart/core/types';
import { accountBalances } from '@esmart/core/domain/paymentAccounts';
import { useAppStore } from '../../../store/appStore';
import { useActiveCompany, useBaseCurrency, useExpenses, usePaymentAccounts, usePayments } from '../../../store/selectors';
import { formatMoney } from '@esmart/core/lib/format';
import { fromMajor, money, toMajor } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { SHOW_SCROLLBAR } from '@esmart/ui/theme/breakpoints';

export default function AccountSettings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { t: tr } = useTranslation(['nav', 'settings']);
  const toast = useToast();

  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const accounts = usePaymentAccounts();
  const payments = usePayments();
  const expenses = useExpenses();
  const savePaymentAccount = useAppStore((s) => s.savePaymentAccount);
  const removePaymentAccount = useAppStore((s) => s.removePaymentAccount);

  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PaymentAccount | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<PaymentAccount['type']>('bank');
  const [accountNumber, setAccountNumber] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  /** Running balance: opening + money in − money out − expenses paid from it. */
  const balances = useMemo(() => accountBalances(accounts, payments, expenses), [accounts, payments, expenses]);

  const totalCash = Object.values(balances).reduce((a, b) => a + b, 0);

  const open = (a?: PaymentAccount) => {
    setEditing(a ?? ({ id: '', companyId: company.id, name: '', type: 'bank', currency: baseCurrency, openingBalance: money(0, baseCurrency), isDefault: false } as PaymentAccount));
    setName(a?.name ?? '');
    setType(a?.type ?? 'bank');
    setAccountNumber(a?.accountNumber ?? '');
    setOpeningBalance(a ? String(toMajor(a.openingBalance)) : '');
    setIsDefault(a?.isDefault ?? false);
  };

  const save = () => {
    if (!editing || !name.trim()) return;
    savePaymentAccount({
      ...editing,
      id: editing.id || uid('acc'),
      companyId: company.id,
      name: name.trim(),
      type,
      currency: baseCurrency,
      accountNumber: accountNumber.trim() || undefined,
      openingBalance: fromMajor(openingBalance || '0', baseCurrency),
      isDefault,
    });
    toast.show(editing.id ? 'Account updated' : 'Account added', 'success');
    setEditing(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg }}>
      <Stack.Screen options={{ title: tr('nav:title.paymentAccounts') }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 + insets.bottom }} showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
        <Card style={{ gap: 5, paddingVertical: t.spacing.xl }}>
          <Text variant="caption" tone="muted">{tr('settings:accounts.cashAndBank')}</Text>
          <Text variant="h1" weight="700" tone={totalCash >= 0 ? 'default' : 'bad'}>
            {formatMoney(money(totalCash, baseCurrency))}
          </Text>
          <Text variant="caption" tone="muted">{tr('settings:accounts.cashCaption')}</Text>
        </Card>

        <View style={{ height: t.spacing.lg }} />

        <Card padded={false}>
          {accounts.map((a, i) => (
            <ListRow
              key={a.id}
              title={a.name}
              subtitle={a.accountNumber ?? a.type}
              icon={a.type === 'cash' ? 'cash' : a.type === 'wallet' ? 'wallet-outline' : 'bank-outline'}
              divider={i < accounts.length - 1}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text variant="small" weight="700">
                    {formatMoney(money(balances[a.id] ?? 0, baseCurrency))}
                  </Text>
                  {a.isDefault ? <Badge label={tr('settings:accounts.default')} tone="info" size="sm" /> : null}
                </View>
              }
              onPress={() => open(a)}
              chevron
            />
          ))}
        </Card>
      </ScrollView>

      <PrimaryActionBar title={tr('settings:accounts.add')} icon="plus" onPress={() => open()} />

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit account' : 'Add account'}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            {editing?.id && accounts.length > 1 ? (
              <Button
                title={tr('settings:accounts.delete')}
                variant="danger"
                style={{ flex: 1 }}
                onPress={() => {
                  const a = editing;
                  setEditing(null);
                  setConfirmDelete(a);
                }}
              />
            ) : null}
            <Button title={tr('settings:accounts.save')} onPress={save} disabled={!name.trim()} style={{ flex: 2 }} />
          </View>
        }
      >
        <View style={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
          <Segmented
            options={[
              { value: 'bank', label: 'Bank' },
              { value: 'cash', label: 'Cash' },
              { value: 'wallet', label: 'Wallet' },
            ]}
            value={type}
            onChange={(v) => setType(v as PaymentAccount['type'])}
          />
          <TextField label={tr('settings:accounts.name')} value={name} onChangeText={setName} placeholder={tr('settings:accounts.namePlaceholder')} icon="bank-outline" required />
          {type === 'bank' ? (
            <TextField label={tr('settings:accounts.number')} value={accountNumber} onChangeText={setAccountNumber} placeholder="XXXX1234" icon="pound" />
          ) : null}
          <AmountField label={tr('settings:accounts.openingBalance')} value={openingBalance} onChangeValue={setOpeningBalance} currency={baseCurrency} />
          <SwitchField label={tr('settings:accounts.useDefault')} description={tr('settings:accounts.useDefaultHint')} value={isDefault} onValueChange={setIsDefault} />
        </View>
      </Sheet>

      <ConfirmDialog
        visible={!!confirmDelete}
        title={`Delete ${confirmDelete?.name}?`}
        message={tr('settings:accounts.deleteMessage')}
        confirmLabel={tr('settings:accounts.delete')}
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removePaymentAccount(confirmDelete.id);
          setConfirmDelete(null);
          toast.show(tr('settings:accounts.deleted'), 'success');
        }}
      />
    </View>
  );
}
