import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { AmountField, PickerField, SwitchField, TextField } from '@/components/Field';
import { DateField } from '@/components/pickers/DateField';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { useToast } from '@/components/Toast';
import { Expense, PaymentMethod, RecurrenceFrequency } from '@/types';
import { PAYMENT_METHODS } from '@/data/masters';
import { paymentMethodLabel } from '@/i18n/labels';
import { formatMoney, formatPercent } from '@/lib/format';
import { addDaysISO, today } from '@/lib/date';
import { fromMajor, money, subtract, toMajor, zero , inclusiveTax, percent } from '@/lib/money';
import { uid } from '@/lib/id';
import { useAppStore } from '@/store/appStore';
import {
  useBaseCurrency,
  useExpenseCategories,
  useParties,
  usePaymentAccounts,
  useTaxCategories,
} from '@/store/selectors';

const RECURRENCES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every quarter' },
  { value: 'yearly', label: 'Every year' },
];

export function ExpenseForm({ expense }: { expense?: Expense }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain']);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const baseCurrency = useBaseCurrency();
  const categories = useExpenseCategories();
  const accounts = usePaymentAccounts();
  const taxCategories = useTaxCategories();
  const suppliers = useParties('supplier');

  const saveExpense = useAppStore((s) => s.saveExpense);
  const addAttachment = useAppStore((s) => s.addAttachment);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);
  const activeBranchId = useAppStore((s) => s.activeBranchId);

  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? categories[0]?.id ?? '');
  const [amountText, setAmountText] = useState(expense ? String(toMajor(expense.amount)) : '');
  const [date, setDate] = useState(expense?.date ?? today());
  const [method, setMethod] = useState<PaymentMethod>(expense?.method ?? 'upi');
  const [accountId, setAccountId] = useState(expense?.accountId ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '');
  const [supplierId, setSupplierId] = useState<string | null>(expense?.supplierId ?? null);
  const [taxCategoryId, setTaxCategoryId] = useState<string | null>(expense?.taxCategoryId ?? null);
  const [taxInclusive, setTaxInclusive] = useState(expense?.taxInclusive ?? true);
  const [reference, setReference] = useState(expense?.reference ?? '');
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency>(expense?.recurrence ?? 'none');
  const [billable, setBillable] = useState(expense?.billable ?? false);
  const [receiptUri, setReceiptUri] = useState<string | undefined>();

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);

  const amount = fromMajor(amountText || '0', baseCurrency);
  const taxRate = taxCategories.find((c) => c.id === taxCategoryId)?.rate ?? 0;
  const taxAmount = taxRate > 0 ? (taxInclusive ? inclusiveTax(amount, taxRate) : percent(amount, taxRate)) : zero(baseCurrency);
  const netAmount = taxInclusive ? subtract(amount, taxAmount) : amount;
  const totalPaid = taxInclusive ? amount : money(amount.minor + taxAmount.minor, baseCurrency);

  const attachReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) setReceiptUri(result.assets[0].uri);
  };

  const save = () => {
    if (amount.minor <= 0 || !categoryId) return;

    const attachmentIds = expense?.attachmentIds ?? [];
    if (receiptUri) {
      attachmentIds.push(
        addAttachment({
          companyId: activeCompanyId,
          name: 'Receipt',
          mimeType: 'image/jpeg',
          size: 0,
          uri: receiptUri,
          entityType: 'expense',
          entityId: expense?.id,
        }),
      );
    }

    const record: Expense = {
      id: expense?.id ?? uid('exp'),
      companyId: expense?.companyId ?? activeCompanyId,
      branchId: expense?.branchId ?? activeBranchId ?? 'brn_mum',
      number: expense?.number ?? '',
      categoryId,
      supplierId: supplierId ?? undefined,
      date,
      amount: totalPaid,
      currency: baseCurrency,
      exchangeRate: 1,
      taxCategoryId: taxCategoryId ?? undefined,
      taxAmount,
      taxInclusive,
      accountId,
      method,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      billable,
      recurrence,
      nextRecurrenceDate: recurrence === 'none' ? undefined : addDaysISO(date, recurrence === 'weekly' ? 7 : recurrence === 'monthly' ? 30 : recurrence === 'quarterly' ? 91 : 365),
      attachmentIds,
      createdBy: expense?.createdBy ?? '',
      createdAt: expense?.createdAt ?? new Date().toISOString(),
    };

    const id = saveExpense(record);
    toast.show(expense ? 'Expense updated' : 'Expense recorded', 'success');
    if (expense) router.back();
    else router.replace(`/(app)/expenses/${id}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AmountField label="Amount" value={amountText} onChangeValue={setAmountText} currency={baseCurrency} size="lg" autoFocus={!expense} required />

        <PickerField
          label="Category"
          value={categories.find((c) => c.id === categoryId)?.name}
          onPress={() => setCategoryOpen(true)}
          icon="shape-outline"
          required
        />

        <DateField label="Date" value={date} onChange={setDate} required />

        <PickerField label="Paid by" value={paymentMethodLabel(tr, method)} onPress={() => setMethodOpen(true)} icon="credit-card-outline" />
        <PickerField label="Paid from" value={accounts.find((a) => a.id === accountId)?.name} onPress={() => setAccountOpen(true)} icon="bank-outline" />
        <PickerField
          label="Supplier"
          value={suppliers.find((s) => s.id === supplierId)?.name}
          placeholder="Optional"
          onPress={() => setSupplierOpen(true)}
          icon="truck-outline"
          clearable
          onClear={() => setSupplierId(null)}
        />

        <PickerField
          label="Tax"
          value={taxCategoryId ? `${taxCategories.find((c) => c.id === taxCategoryId)?.name}` : 'No tax'}
          onPress={() => setTaxOpen(true)}
          icon="percent-outline"
          clearable
          onClear={() => setTaxCategoryId(null)}
        />

        {taxRate > 0 ? (
          <>
            <SwitchField label="Amount includes tax" value={taxInclusive} onValueChange={setTaxInclusive} />
            <Card variant="flat" style={{ gap: t.spacing.sm }}>
              {[
                { label: 'Net amount', value: formatMoney(netAmount) },
                { label: `Input tax (${formatPercent(taxRate)})`, value: formatMoney(taxAmount) },
                { label: 'Total paid', value: formatMoney(totalPaid) },
              ].map((r) => (
                <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="caption" tone="muted">
                    {r.label}
                  </Text>
                  <Text variant="caption" weight="600">
                    {r.value}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <TextField label="Reference" value={reference} onChangeText={setReference} placeholder="Bill or voucher number" icon="pound" />
        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="What was this for?" multiline />

        <PickerField label="Repeats" value={RECURRENCES.find((r) => r.value === recurrence)?.label} onPress={() => setRecurrenceOpen(true)} icon="repeat" />
        <SwitchField label="Billable to a customer" description="Flag it so you can re-charge it later." value={billable} onValueChange={setBillable} />

        <Pressable onPress={attachReceipt} accessibilityRole="button" accessibilityLabel="Attach receipt">
          <Card variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <MaterialCommunityIcons name={receiptUri ? 'check-circle' : 'paperclip'} size={20} color={receiptUri ? t.c.good : t.c.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="body" weight="600">
                {receiptUri ? 'Receipt attached' : 'Attach a receipt'}
              </Text>
              <Text variant="caption" tone="muted">
                {receiptUri ? 'Tap to replace' : 'Photo or scan of the bill'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={t.c.muted} />
          </Card>
        </Pressable>

        <Button
          title="Scan with OCR instead"
          variant="ghost"
          icon="text-recognition"
          onPress={() => router.push('/(app)/ocr/capture')}
          fullWidth
        />
      </ScrollView>

      <View
        style={{
          padding: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.md,
          borderTopWidth: 1,
          borderTopColor: t.c.line,
          backgroundColor: t.c.paper,
        }}
      >
        <Button title={expense ? 'Save changes' : 'Record expense'} onPress={save} disabled={amount.minor <= 0} fullWidth size="lg" />
      </View>

      <SelectSheet
        visible={categoryOpen}
        onClose={() => setCategoryOpen(false)}
        title="Category"
        options={categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon as never }))}
        value={categoryId}
        onSelect={setCategoryId}
      />
      <SelectSheet
        visible={methodOpen}
        onClose={() => setMethodOpen(false)}
        title="Payment method"
        options={PAYMENT_METHODS.map((value) => ({ value, label: paymentMethodLabel(tr, value) }))}
        value={method}
        onSelect={(v) => setMethod(v as PaymentMethod)}
        searchable={false}
      />
      <SelectSheet
        visible={accountOpen}
        onClose={() => setAccountOpen(false)}
        title="Paid from"
        options={accounts.map((a) => ({ value: a.id, label: a.name, description: a.accountNumber ?? a.type }))}
        value={accountId}
        onSelect={setAccountId}
        searchable={false}
      />
      <SelectSheet
        visible={supplierOpen}
        onClose={() => setSupplierOpen(false)}
        title="Supplier"
        options={suppliers.map((s) => ({ value: s.id, label: s.name, description: s.phone ?? s.code }))}
        value={supplierId}
        onSelect={setSupplierId}
      />
      <SelectSheet
        visible={taxOpen}
        onClose={() => setTaxOpen(false)}
        title="Tax"
        options={taxCategories.map((c) => ({ value: c.id, label: c.name, trailing: formatPercent(c.rate) }))}
        value={taxCategoryId}
        onSelect={setTaxCategoryId}
        searchable={false}
      />
      <SelectSheet
        visible={recurrenceOpen}
        onClose={() => setRecurrenceOpen(false)}
        title="Repeats"
        options={RECURRENCES.map((r) => ({ value: r.value, label: r.label }))}
        value={recurrence}
        onSelect={(v) => setRecurrence(v as RecurrenceFrequency)}
        searchable={false}
      />
    </KeyboardAvoidingView>
  );
}
