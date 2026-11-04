import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { Sheet } from '@esmart/ui/components/Sheet';
import { AmountField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { fromMajor } from '@esmart/core/lib/money';
import { formatMoney, toAmountInput } from '@esmart/core/lib/format';
import { today } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import type { Payment, PaymentMethod } from '@esmart/core/types';
import { useServerSave } from '../../components/useServerSave';
import { useAppStore } from '../../store/appStore';
import { usePaymentAccounts } from '../../store/selectors';

const METHOD_FOR: Record<'cash' | 'bank' | 'wallet', PaymentMethod> = { cash: 'cash', bank: 'bank', wallet: 'wallet' };

/**
 * Pays a customer back out of the advance on `receipt` (CGST Rule 51): a payment out that settles
 * nothing but that advance, no more than is left of it. It prints as the refund voucher, and a service
 * advance's tax comes back on its date. The server keeps the receipt's advance in step.
 */
export function RefundAdvanceSheet({ receipt, visible, onClose, onSaved }: { receipt: Payment; visible: boolean; onClose: () => void; onSaved?: (id: string) => void }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales', 'common']);
  const { run: serverSave, saving } = useServerSave();
  const savePayment = useAppStore((s) => s.savePayment);
  const accounts = usePaymentAccounts().filter((a) => a.currency === receipt.currency || a.type === 'cash');

  const left = receipt.unallocated;
  const [amountText, setAmountText] = useState(() => toAmountInput(left));
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState(() => accounts.find((a) => a.id === receipt.accountId)?.id ?? accounts[0]?.id ?? '');

  // Each time it opens, it offers what is left of the advance now.
  useEffect(() => {
    if (visible) setAmountText(toAmountInput(receipt.unallocated));
  }, [visible, receipt.unallocated]);

  const amount = fromMajor(amountText || '0', receipt.currency);
  const tooMuch = amount.minor > left.minor;
  const early = date < receipt.date;
  const account = accounts.find((a) => a.id === accountId);
  const canSave = amount.minor > 0 && !tooMuch && !early && !!account;

  const save = async () => {
    if (!canSave || !account) return;
    const refund: Payment = {
      id: uid('pay'),
      companyId: receipt.companyId,
      branchId: receipt.branchId,
      number: '',
      direction: 'paid',
      partyId: receipt.partyId,
      date,
      amount,
      currency: receipt.currency,
      exchangeRate: receipt.exchangeRate,
      method: METHOD_FOR[account.type],
      accountId: account.id,
      allocations: [],
      // All of it goes to the advance it pays back.
      unallocated: { minor: 0, currency: receipt.currency },
      refundOf: receipt.id,
      notes: tr('sales:refund.note', { number: receipt.number }),
      attachmentIds: [],
      createdBy: '',
      createdAt: new Date().toISOString(),
    };
    const res = await serverSave(() => savePayment(refund), tr('sales:refund.saved'), { icon: 'cash-refund' });
    if (!res) return;
    onClose();
    onSaved?.(res.id ?? refund.id);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={tr('sales:refund.title')}
      subtitle={tr('sales:refund.subtitle', { number: receipt.number, amount: formatMoney(left) })}
      footer={<Button title={tr('sales:refund.save')} icon="cash-refund" onPress={() => void save()} loading={saving} disabled={!canSave} fullWidth size="lg" />}
    >
      <View style={{ gap: t.spacing.md, paddingBottom: t.spacing.md }}>
        <AmountField
          label={tr('sales:refund.amount')}
          value={amountText}
          onChangeValue={setAmountText}
          currency={receipt.currency}
          error={tooMuch ? tr('sales:refund.tooMuch', { amount: formatMoney(left) }) : undefined}
        />
        <DateField label={tr('common:table.date')} value={date} onChange={setDate} hint={early ? tr('sales:refund.beforeReceipt') : undefined} />
        <Text variant="caption" tone="muted" weight="600">
          {tr('sales:refund.paidFrom')}
        </Text>
        {accounts.map((a) => {
          const selected = a.id === accountId;
          return (
            <Pressable
              key={a.id}
              onPress={() => setAccountId(a.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.md,
                padding: t.spacing.md,
                borderRadius: t.radius.md,
                borderWidth: 1,
                borderColor: selected ? t.c.primary : t.c.line,
                backgroundColor: selected ? t.c.chip : 'transparent',
              }}
            >
              <Icon name={a.type === 'cash' ? 'cash' : a.type === 'bank' ? 'bank-outline' : 'wallet-outline'} size={20} color={selected ? t.c.primary : t.c.muted} />
              <Text variant="body" weight={selected ? '600' : '400'} style={{ flex: 1 }}>
                {a.name}
              </Text>
              {selected ? <Icon name="check" size={18} color={t.c.primary} /> : null}
            </Pressable>
          );
        })}
        <Text variant="caption" tone="muted" style={{ lineHeight: 18 }}>
          {tr('sales:refund.hint')}
        </Text>
      </View>
    </Sheet>
  );
}
