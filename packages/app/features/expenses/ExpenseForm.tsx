import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { AmountField, PickerField, SwitchField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Sheet } from '@esmart/ui/components/Sheet';
import { useToast } from '@esmart/ui/components/Toast';
import { Expense, PaymentMethod, RecurrenceFrequency } from '@esmart/core/types';
import { PAYMENT_METHODS } from '@esmart/core/data/masters';
import { accountBalances, accountIdAfterMethodChange, accountsForMethod, defaultAccountFor } from '@esmart/core/domain/paymentAccounts';
import { paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney, formatPercent } from '@esmart/core/lib/format';
import { addDaysISO, today } from '@esmart/core/lib/date';
import { fromMajor, money, subtract, toMajor, zero , inclusiveTax, percent } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { useAppStore } from '../../store/appStore';
import {
  useBaseCurrency,
  useExpenseCategories,
  useExpenses,
  useParties,
  usePaymentAccounts,
  usePayments,
  usePrimaryBranchId,
  useTaxCategories,
} from '../../store/selectors';

const RECURRENCES: { value: RecurrenceFrequency; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every quarter' },
  { value: 'yearly', label: 'Every year' },
];

/** Values to start a new expense from, e.g. a scanned receipt. */
export type ExpenseInitial = {
  amount?: string;
  date?: string;
  reference?: string;
  notes?: string;
  supplierId?: string;
  categoryId?: string;
  receiptUri?: string;
};

export function ExpenseForm({ expense, initial }: { expense?: Expense; initial?: ExpenseInitial }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain', 'purchases']);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const baseCurrency = useBaseCurrency();
  const categories = useExpenseCategories();
  const accounts = usePaymentAccounts();
  const taxCategories = useTaxCategories();
  const suppliers = useParties('supplier');

  const saveExpense = useAppStore((s) => s.saveExpense);
  const saveExpenseCategory = useAppStore((s) => s.saveExpenseCategory);
  const addAttachment = useAppStore((s) => s.addAttachment);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);
  const primaryBranchId = usePrimaryBranchId();
  const payments = usePayments();
  const expenses = useExpenses();

  // No silent default: the person recording the expense chooses its category.
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? initial?.categoryId ?? '');
  const [amountText, setAmountText] = useState(expense ? String(toMajor(expense.amount)) : (initial?.amount ?? ''));
  const [date, setDate] = useState(expense?.date ?? initial?.date ?? today());
  const [method, setMethod] = useState<PaymentMethod>(
    () => expense?.method ?? (defaultAccountFor('upi', accounts) ? 'upi' : 'cash'),
  );
  const [pickedAccountId, setAccountId] = useState(
    () => expense?.accountId ?? defaultAccountFor(method, accounts)?.id ?? '',
  );
  const methodAccounts = accountsForMethod(method, accounts);
  const accountId = methodAccounts.some((a) => a.id === pickedAccountId)
    ? pickedAccountId
    : (defaultAccountFor(method, accounts)?.id ?? '');
  const [accountError, setAccountError] = useState<string | undefined>();
  const [supplierId, setSupplierId] = useState<string | null>(expense?.supplierId ?? initial?.supplierId ?? null);
  const [taxCategoryId, setTaxCategoryId] = useState<string | null>(expense?.taxCategoryId ?? null);
  const [taxInclusive, setTaxInclusive] = useState(expense?.taxInclusive ?? true);
  const [reference, setReference] = useState(expense?.reference ?? initial?.reference ?? '');
  const [notes, setNotes] = useState(expense?.notes ?? initial?.notes ?? '');
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency>(expense?.recurrence ?? 'none');
  const [billable, setBillable] = useState(expense?.billable ?? false);
  const [receiptUri, setReceiptUri] = useState<string | undefined>(initial?.receiptUri);

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState<string | undefined>();

  const addCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const id = uid('exc');
    saveExpenseCategory({ id, companyId: activeCompanyId, name, icon: 'shape-outline', color: '#8E98AC' });
    setCategoryId(id);
    setCategoryError(undefined);
    setNewCategoryName('');
    setNewCategoryOpen(false);
  };

  const amount = fromMajor(amountText || '0', baseCurrency);
  const taxRate = taxCategories.find((c) => c.id === taxCategoryId)?.rate ?? 0;
  const taxAmount = taxRate > 0 ? (taxInclusive ? inclusiveTax(amount, taxRate) : percent(amount, taxRate)) : zero(baseCurrency);
  const netAmount = taxInclusive ? subtract(amount, taxAmount) : amount;
  const totalPaid = taxInclusive ? amount : money(amount.minor + taxAmount.minor, baseCurrency);

  // Cash in hand cannot pay out more than it holds (an edit gives back its own amount first).
  const account = accounts.find((a) => a.id === accountId);
  const cashBalance = useMemo(() => {
    if (!account || account.type !== 'cash') return undefined;
    const others = expenses.filter((e) => e.id !== expense?.id);
    return accountBalances(accounts, payments, others)[account.id];
  }, [account, accounts, payments, expenses, expense?.id]);
  const cashShort = cashBalance !== undefined && totalPaid.minor > cashBalance;

  const attachReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) setReceiptUri(result.assets[0].uri);
  };

  const save = () => {
    if (amount.minor <= 0) return;
    if (!categoryId || !categories.some((c) => c.id === categoryId)) {
      setCategoryError(tr('purchases:form.categoryRequired'));
      return;
    }
    if (!accountId) {
      setAccountError(tr('purchases:form.accountRequired'));
      return;
    }
    if (cashShort) {
      setAccountError(tr('purchases:form.cashShort', { balance: formatMoney(money(cashBalance ?? 0, baseCurrency)) }));
      return;
    }

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
      branchId: expense?.branchId ?? primaryBranchId ?? '',
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
    if (!id) {
      setAccountError(tr('purchases:form.accountRequired'));
      return;
    }
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
        <AmountField label={tr('purchases:form.amount')} value={amountText} onChangeValue={setAmountText} currency={baseCurrency} size="lg" autoFocus={!expense} required />

        <PickerField
          label={tr('purchases:form.category')}
          value={categories.find((c) => c.id === categoryId)?.name}
          onPress={() => (categories.length ? setCategoryOpen(true) : setNewCategoryOpen(true))}
          placeholder={categories.length ? undefined : tr('purchases:form.addCategory')}
          icon="shape-outline"
          required
          error={categoryError}
        />

        <DateField label={tr('purchases:form.date')} value={date} onChange={setDate} required />

        <PickerField label={tr('purchases:form.paidBy')} value={paymentMethodLabel(tr, method)} onPress={() => setMethodOpen(true)} icon="credit-card-outline" />
        <PickerField
          label={tr('purchases:form.paidFrom')}
          value={methodAccounts.find((a) => a.id === accountId)?.name}
          onPress={() => setAccountOpen(true)}
          icon="bank-outline"
          required
          error={accountError ?? (cashShort ? tr('purchases:form.cashShort', { balance: formatMoney(money(cashBalance ?? 0, baseCurrency)) }) : undefined)}
        />
        <PickerField
          label={tr('purchases:form.supplier')}
          value={suppliers.find((s) => s.id === supplierId)?.name}
          placeholder={tr('purchases:form.optional')}
          onPress={() => setSupplierOpen(true)}
          icon="truck-outline"
          clearable
          onClear={() => setSupplierId(null)}
        />

        <PickerField
          label={tr('purchases:form.tax')}
          value={taxCategoryId ? `${taxCategories.find((c) => c.id === taxCategoryId)?.name}` : 'No tax'}
          onPress={() => setTaxOpen(true)}
          icon="percent-outline"
          clearable
          onClear={() => setTaxCategoryId(null)}
        />

        {taxRate > 0 ? (
          <>
            <SwitchField label={tr('purchases:form.inclusive')} value={taxInclusive} onValueChange={setTaxInclusive} />
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

        <TextField label={tr('purchases:form.reference')} value={reference} onChangeText={setReference} placeholder={tr('purchases:form.referencePlaceholder')} icon="pound" />
        <TextField label={tr('purchases:form.notes')} value={notes} onChangeText={setNotes} placeholder={tr('purchases:form.notesPlaceholder')} multiline />

        <PickerField label={tr('purchases:form.repeats')} value={RECURRENCES.find((r) => r.value === recurrence)?.label} onPress={() => setRecurrenceOpen(true)} icon="repeat" />
        <SwitchField label={tr('purchases:form.billable')} description={tr('purchases:form.billableHint')} value={billable} onValueChange={setBillable} />

        <Pressable onPress={attachReceipt} accessibilityRole="button" accessibilityLabel={tr('purchases:form.attachReceipt')}>
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
          title={tr('purchases:form.scanInstead')}
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
        title={tr('purchases:form.category')}
        options={categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon as never }))}
        value={categoryId}
        onSelect={(id) => {
          setCategoryId(id);
          setCategoryError(undefined);
        }}
        footer={
          <Button
            title={tr('purchases:form.addCategory')}
            icon="plus"
            variant="ghost"
            onPress={() => {
              setCategoryOpen(false);
              setNewCategoryOpen(true);
            }}
            fullWidth
          />
        }
      />
      <Sheet
        visible={newCategoryOpen}
        onClose={() => setNewCategoryOpen(false)}
        title={tr('purchases:form.addCategory')}
        footer={<Button title={tr('purchases:form.saveCategory')} onPress={addCategory} disabled={!newCategoryName.trim()} fullWidth />}
      >
        <View style={{ padding: t.spacing.lg }}>
          <TextField
            label={tr('purchases:form.categoryName')}
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            autoFocus
          />
        </View>
      </Sheet>
      <SelectSheet
        visible={methodOpen}
        onClose={() => setMethodOpen(false)}
        title={tr('purchases:form.paymentMethod')}
        options={PAYMENT_METHODS.map((value) => ({ value, label: paymentMethodLabel(tr, value) }))}
        value={method}
        onSelect={(v) => {
          setMethod(v as PaymentMethod);
          setAccountId((current) => accountIdAfterMethodChange(v as PaymentMethod, current, accounts));
        }}
        searchable={false}
      />
      <SelectSheet
        visible={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={tr('purchases:form.paidFrom')}
        options={methodAccounts.map((a) => ({ value: a.id, label: a.name, description: a.accountNumber ?? a.type }))}
        value={accountId}
        onSelect={(id) => {
          setAccountId(id);
          setAccountError(undefined);
        }}
        searchable={false}
      />
      <SelectSheet
        visible={supplierOpen}
        onClose={() => setSupplierOpen(false)}
        title={tr('purchases:form.supplier')}
        options={suppliers.map((s) => ({ value: s.id, label: s.name, description: s.phone ?? s.code }))}
        value={supplierId}
        onSelect={setSupplierId}
      />
      <SelectSheet
        visible={taxOpen}
        onClose={() => setTaxOpen(false)}
        title={tr('purchases:form.tax')}
        options={taxCategories.map((c) => ({ value: c.id, label: c.name, trailing: formatPercent(c.rate) }))}
        value={taxCategoryId}
        onSelect={setTaxCategoryId}
        searchable={false}
      />
      <SelectSheet
        visible={recurrenceOpen}
        onClose={() => setRecurrenceOpen(false)}
        title={tr('purchases:form.repeats')}
        options={RECURRENCES.map((r) => ({ value: r.value, label: r.label }))}
        value={recurrence}
        onSelect={(v) => setRecurrence(v as RecurrenceFrequency)}
        searchable={false}
      />
    </KeyboardAvoidingView>
  );
}
