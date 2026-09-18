import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { Sheet } from '@/components/Sheet';
import { AmountField, Segmented, SwitchField, TextField } from '@/components/Field';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/components/Toast';
import { PaymentAccount } from '@/types';
import { useAppStore } from '@/store/appStore';
import { useActiveCompany, useBaseCurrency, useExpenses, usePaymentAccounts, usePayments } from '@/store/selectors';
import { formatMoney } from '@/lib/format';
import { fromMajor, money, toMajor } from '@/lib/money';
import { uid } from '@/lib/id';

export default function AccountSettings() {
  const t = useTheme();
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
  const balances = useMemo(() => {
    const map: Record<string, number> = {};
    accounts.forEach((a) => {
      map[a.id] = a.openingBalance.minor;
    });
    payments.forEach((p) => {
      const delta = Math.round(p.amount.minor * (p.exchangeRate || 1));
      if (map[p.accountId] === undefined) return;
      map[p.accountId] += p.direction === 'received' ? delta : -delta;
    });
    expenses.forEach((e) => {
      if (map[e.accountId] === undefined) return;
      map[e.accountId] -= Math.round(e.amount.minor * (e.exchangeRate || 1));
    });
    return map;
  }, [accounts, payments, expenses]);

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
      <Stack.Screen options={{ title: 'Payment accounts' }} />

      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Card style={{ gap: 5, paddingVertical: t.spacing.xl }}>
          <Text variant="caption" tone="muted">
            Cash and bank balance
          </Text>
          <Text variant="h1" weight="700" tone={totalCash >= 0 ? 'default' : 'bad'}>
            {formatMoney(money(totalCash, baseCurrency))}
          </Text>
          <Text variant="caption" tone="muted">
            Opening balances plus everything recorded since
          </Text>
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
                  {a.isDefault ? <Badge label="Default" tone="info" size="sm" /> : null}
                </View>
              }
              onPress={() => open(a)}
              chevron
            />
          ))}
        </Card>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: t.spacing.lg,
          paddingBottom: t.spacing.xl,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
        }}
      >
        <Button title="Add account" icon="plus" onPress={() => open()} fullWidth size="lg" />
      </View>

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit account' : 'Add account'}
        footer={
          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            {editing?.id && accounts.length > 1 ? (
              <Button
                title="Delete"
                variant="danger"
                style={{ flex: 1 }}
                onPress={() => {
                  const a = editing;
                  setEditing(null);
                  setConfirmDelete(a);
                }}
              />
            ) : null}
            <Button title="Save" onPress={save} disabled={!name.trim()} style={{ flex: 2 }} />
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
          <TextField label="Account name" value={name} onChangeText={setName} placeholder="e.g. HDFC Current" icon="bank-outline" required />
          {type === 'bank' ? (
            <TextField label="Account number" value={accountNumber} onChangeText={setAccountNumber} placeholder="XXXX1234" icon="pound" />
          ) : null}
          <AmountField label="Opening balance" value={openingBalance} onChangeValue={setOpeningBalance} currency={baseCurrency} />
          <SwitchField label="Use as default" description="Pre-selected when recording payments and expenses." value={isDefault} onValueChange={setIsDefault} />
        </View>
      </Sheet>

      <ConfirmDialog
        visible={!!confirmDelete}
        title={`Delete ${confirmDelete?.name}?`}
        message="Payments already recorded against it keep their reference. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) removePaymentAccount(confirmDelete.id);
          setConfirmDelete(null);
          toast.show('Account deleted', 'success');
        }}
      />
    </View>
  );
}
