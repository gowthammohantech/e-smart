import React, { useMemo, useState } from 'react';
import { CostCentreField } from '../books/CostCentreField';
import { VehicleField } from '../vehicles/VehicleField';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { FieldRow, FormContainer, FormSection, SplitPane } from '@esmart/ui/components/Layout';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Button } from '@esmart/ui/components/Button';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { AmountField, PickerField, SwitchField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Sheet } from '@esmart/ui/components/Sheet';
import { useToast } from '@esmart/ui/components/Toast';
import { useServerSave } from '../../components/useServerSave';
import { useSaveShortcut } from '../../components/useSaveShortcut';
import { useLeaveGuard } from '../../components/useLeaveGuard';
import { Expense, ItcEligibility, PaymentMethod, RecurrenceFrequency } from '@esmart/core/types';
import { PAYMENT_METHODS } from '@esmart/core/data/masters';
import { accountIdAfterMethodChange, accountsForMethod, defaultAccountFor } from '@esmart/core/domain/paymentAccounts';
import { paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney, formatPercent } from '@esmart/core/lib/format';
import { addDaysISO, today } from '@esmart/core/lib/date';
import { fromMajor, money, subtract, toMajor, zero , inclusiveTax, percent } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { isNetworkError } from '../../remote/api';
import { uploadAttachment } from '../../remote/attachments';
import { knownToServer } from '../../remote/meta';
import { useReceiptQueue } from '../../remote/receiptQueue';
import { keepQueued } from '../../remote/keptFiles';
import { describeError } from '../../remote/errors';
import { useAppStore } from '../../store/appStore';
import { usePartyRecord, usePartySearch, useServerAccountBalances } from '../../remote/queries';
import { useDebounced } from '../../components/useDebounced';
import {
  useBaseCurrency,
  useExpenseCategories,
  useParties,
  usePaymentAccounts,
  useDefaultBranchId,
  useTaxCategories,
} from '../../store/selectors';
import { SHOW_SCROLLBAR, useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { useGoBack } from '../../navigation/useGoBack';

const RECURRENCES: RecurrenceFrequency[] = ['none', 'weekly', 'monthly', 'quarterly', 'yearly'];

/** Values to start a new expense from, e.g. a scanned receipt. */
export type ExpenseInitial = {
  amount?: string;
  date?: string;
  reference?: string;
  notes?: string;
  supplierId?: string;
  categoryId?: string;
  receiptUri?: string;
  /** Already uploaded with the scan; linked as the receipt without uploading again. */
  receiptAttachmentId?: string;
};

export function ExpenseForm({ expense, initial }: { expense?: Expense; initial?: ExpenseInitial }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain', 'purchases', 'common', 'settings', 'inventory']);
  const router = useRouter();
  const goBack = useGoBack();
  const toast = useToast();
  const { run: serverSave, saving, blocked, release: releaseSave } = useServerSave();
  // Always 'phone' in the native apps, so the desktop layout only ever reaches a browser.
  const breakpoint = useBreakpoint();
  const desktop = breakpoint !== 'phone';

  const baseCurrency = useBaseCurrency();
  const categories = useExpenseCategories();
  const accounts = usePaymentAccounts();
  const taxCategories = useTaxCategories();
  const suppliers = useParties('supplier');
  const customers = useParties('customer');

  const saveExpense = useAppStore((s) => s.saveExpense);
  const saveExpenseCategory = useAppStore((s) => s.saveExpenseCategory);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);
  const defaultBranchId = useDefaultBranchId();

  // No silent default: the person recording the expense chooses its category.
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? initial?.categoryId ?? '');
  // A saved expense holds what was paid; a tax-exclusive one is typed without its tax, which is added again below.
  const [amountText, setAmountText] = useState(() => {
    if (!expense) return initial?.amount ?? '';
    const typed = !expense.taxInclusive && !expense.reverseCharge ? subtract(expense.amount, expense.taxAmount) : expense.amount;
    return String(toMajor(typed));
  });
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
  const [reverseCharge, setReverseCharge] = useState(!!expense?.reverseCharge);
  const [itcEligibility, setItcEligibility] = useState<ItcEligibility>(expense?.itcEligibility ?? 'eligible');
  const [supplierGstin, setSupplierGstin] = useState(expense?.supplierGstin ?? '');
  const [itcOpen, setItcOpen] = useState(false);
  const [reference, setReference] = useState(expense?.reference ?? initial?.reference ?? '');
  const [notes, setNotes] = useState(expense?.notes ?? initial?.notes ?? '');
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency>(expense?.recurrence ?? 'none');
  const [billable, setBillable] = useState(expense?.billable ?? false);
  const [customerId, setCustomerId] = useState<string | undefined>(expense?.customerId);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [costCentreId, setCostCentreId] = useState<string | undefined>(expense?.costCentreId);
  const [vehicleId, setVehicleId] = useState<string | undefined>(expense?.vehicleId);
  const [receiptUri, setReceiptUri] = useState<string | undefined>(initial?.receiptUri);
  const [uploading, setUploading] = useState(false);

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  // Pickers search the server; what they find (and the parties already on the expense) lands in the store.
  const [supplierQuery, setSupplierQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const supplierSearch = usePartySearch('supplier', useDebounced(supplierQuery), supplierOpen);
  const customerSearch = usePartySearch('customer', useDebounced(customerQuery), customerOpen);
  usePartyRecord(supplierId ?? undefined);
  usePartyRecord(customerId);
  const [taxOpen, setTaxOpen] = useState(false);
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState<string | undefined>();
  // What the person has picked or typed, to tell an untouched form from one with changes to lose.
  const entered = JSON.stringify([categoryId, amountText, date, method, pickedAccountId, supplierId, taxCategoryId, taxInclusive, reference, notes, recurrence, billable, receiptUri]);
  const [untouched] = useState(entered);
  const leaveGuard = useLeaveGuard(entered !== untouched);

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
  // Under reverse charge the supplier's price has no GST in it: the business pays that tax to the government.
  const inclusive = taxInclusive && !reverseCharge;
  const taxAmount = taxRate > 0 ? (inclusive ? inclusiveTax(amount, taxRate) : percent(amount, taxRate)) : zero(baseCurrency);
  const netAmount = inclusive ? subtract(amount, taxAmount) : amount;
  const totalPaid = inclusive || reverseCharge ? amount : money(amount.minor + taxAmount.minor, baseCurrency);

  // Cash in hand cannot pay out more than it holds (an edit gives back its own amount first).
  const account = accounts.find((a) => a.id === accountId);
  const balances = useServerAccountBalances();
  const cashBalance = useMemo(() => {
    if (!account || account.type !== 'cash' || !balances) return undefined;
    const own = expense && expense.accountId === account.id ? Math.round(expense.amount.minor * (expense.exchangeRate || 1)) : 0;
    return (balances[account.id] ?? 0) + own;
  }, [account, balances, expense]);
  const cashShort = cashBalance !== undefined && totalPaid.minor > cashBalance;

  const attachReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) setReceiptUri(result.assets[0].uri);
  };

  const save = async () => {
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

    const attachmentIds = [...(expense?.attachmentIds ?? [])];
    let receiptLater: string | undefined;
    if (receiptUri) {
      // The scan already uploaded its image; a photo picked here goes up now. Uploads need a connection.
      if (receiptUri === initial?.receiptUri && initial.receiptAttachmentId) {
        attachmentIds.push(initial.receiptAttachmentId);
      } else {
        setUploading(true);
        try {
          const uploaded = await toast.promise(
            uploadAttachment({
              companyId: activeCompanyId,
              uri: receiptUri,
              name: 'Receipt',
              // A new expense isn't on the server yet: the receipt is linked through its attachmentIds when it's saved.
              ...(expense && knownToServer(expense.id) && { entityType: 'expense', entityId: expense.id }),
            }),
            {
              loading: tr('purchases:form.receiptUploading'),
              success: tr('purchases:form.receiptAttached'),
              error: (err) => tr('purchases:form.receiptUploadFailed', { reason: describeError(err, tr) }),
              icon: 'paperclip-check',
            },
          );
          attachmentIds.push(uploaded.id);
        } catch (err) {
          // No connection: the expense is saved now and its receipt follows when one returns.
          // Any other failure was already reported by the upload's toast.
          if (isNetworkError(err)) receiptLater = receiptUri;
          else return;
        } finally {
          setUploading(false);
        }
      }
    }

    const record: Expense = {
      id: expense?.id ?? uid('exp'),
      companyId: expense?.companyId ?? activeCompanyId,
      branchId: expense?.branchId ?? defaultBranchId ?? '',
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
      reverseCharge: taxRate > 0 && reverseCharge ? true : undefined,
      itcEligibility: taxRate > 0 && itcEligibility !== 'eligible' ? itcEligibility : undefined,
      supplierGstin: !supplierId && taxRate > 0 ? supplierGstin.trim().toUpperCase() || undefined : undefined,
      accountId,
      method,
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      billable,
      customerId: billable ? customerId : undefined,
      costCentreId,
      vehicleId,
      recurrence,
      nextRecurrenceDate: recurrence === 'none' ? undefined : addDaysISO(date, recurrence === 'weekly' ? 7 : recurrence === 'monthly' ? 30 : recurrence === 'quarterly' ? 91 : 365),
      attachmentIds,
      createdBy: expense?.createdBy ?? '',
      createdAt: expense?.createdAt ?? new Date().toISOString(),
    };

    const res = await serverSave(() => saveExpense(record), receiptLater ? undefined : expense ? tr('purchases:form.expenseUpdated') : tr('purchases:form.expenseRecorded'), {
      icon: 'receipt-text-check-outline',
      detail: [formatMoney(totalPaid), attachmentIds.length ? tr('purchases:form.withReceipt') : ''].filter(Boolean).join(' · '),
      // A new expense keeps the button busy until it has left: a second tap would record it again.
      hold: !expense,
    });
    if (!res) return;
    if (!res.result) {
      releaseSave();
      setAccountError(tr('purchases:form.accountRequired'));
      return;
    }
    const id = res.id ?? res.result;
    if (receiptLater) {
      useReceiptQueue.getState().add(id, record.companyId, receiptLater);
      // A browser's picked file lasts only as long as the page; keep it for a reload.
      keepQueued(receiptLater, useReceiptQueue.getState().swapUri);
      toast.show(tr('purchases:form.receiptQueued'), 'success');
    }
    await leaveGuard.release();
    if (expense) goBack(`/(app)/expenses/${expense.id}`);
    else router.replace(`/(app)/expenses/${id}`);
  };
  useSaveShortcut(() => void save(), !saving && !uploading && amount.minor > 0);

  // Every field is built once and placed twice: stacked in one column on a
  // phone, grouped into cards across two columns on a desktop browser.
  const amountField = (
    <AmountField
      label={tr('purchases:form.amount')}
      value={amountText}
      onChangeValue={setAmountText}
      currency={baseCurrency}
      // Large on a phone, where it is the screen's focus; field-sized on a desktop so it lines up in its row.
      size={desktop ? 'md' : 'lg'}
      autoFocus={!expense}
      required
    />
  );
  const categoryField = (
    <PickerField
      label={tr('purchases:form.category')}
      value={categories.find((c) => c.id === categoryId)?.name}
      onPress={() => (categories.length ? setCategoryOpen(true) : setNewCategoryOpen(true))}
      placeholder={categories.length ? undefined : tr('purchases:form.addCategory')}
      icon="shape-outline"
      required
      error={categoryError}
    />
  );
  const dateField = <DateField label={tr('purchases:form.date')} value={date} onChange={setDate} required />;
  const methodField = (
    <PickerField label={tr('purchases:form.paidBy')} value={paymentMethodLabel(tr, method)} onPress={() => setMethodOpen(true)} icon="credit-card-outline" />
  );
  const accountField = (
    <PickerField
      label={tr('purchases:form.paidFrom')}
      value={methodAccounts.find((a) => a.id === accountId)?.name}
      onPress={() => setAccountOpen(true)}
      icon="bank-outline"
      required
      error={accountError ?? (cashShort ? tr('purchases:form.cashShort', { balance: formatMoney(money(cashBalance ?? 0, baseCurrency)) }) : undefined)}
    />
  );
  const supplierField = (
    <PickerField
      label={tr('purchases:form.supplier')}
      value={suppliers.find((s) => s.id === supplierId)?.name}
      placeholder={tr('purchases:form.optional')}
      onPress={() => setSupplierOpen(true)}
      icon="truck-outline"
      clearable
      onClear={() => setSupplierId(null)}
    />
  );
  const taxField = (
    <PickerField
      label={tr('purchases:form.tax')}
      value={taxCategoryId ? `${taxCategories.find((c) => c.id === taxCategoryId)?.name}` : tr('purchases:form.noTax')}
      onPress={() => setTaxOpen(true)}
      icon="percent-outline"
      clearable
      onClear={() => setTaxCategoryId(null)}
    />
  );
  const inclusiveField = reverseCharge ? null : <SwitchField label={tr('purchases:form.inclusive')} value={taxInclusive} onValueChange={setTaxInclusive} />;
  const reverseChargeField = (
    <SwitchField label={tr('purchases:form.reverseCharge')} description={tr('purchases:form.reverseChargeHint')} value={reverseCharge} onValueChange={setReverseCharge} />
  );
  const itcField = (
    <PickerField label={tr('inventory:gst.itc')} value={tr(`inventory:gst.itcOption.${itcEligibility}`)} onPress={() => setItcOpen(true)} icon="cash-refund" />
  );
  // Without a saved supplier, the GSTIN on the bill is what the GST returns match it by.
  const gstinField = supplierId ? null : (
    <TextField label={tr('purchases:form.supplierGstin')} value={supplierGstin} onChangeText={(v) => setSupplierGstin(v.toUpperCase().slice(0, 15))} placeholder="33AABCS1234K1ZP" autoCapitalize="characters" icon="card-account-details-outline" />
  );
  const referenceField = (
    <TextField label={tr('purchases:form.reference')} value={reference} onChangeText={setReference} placeholder={tr('purchases:form.referencePlaceholder')} icon="pound" />
  );
  const notesField = (
    <TextField label={tr('purchases:form.notes')} value={notes} onChangeText={setNotes} placeholder={tr('purchases:form.notesPlaceholder')} multiline />
  );
  const repeatsField = (
    <PickerField label={tr('purchases:form.repeats')} value={tr(`purchases:recurrence.${recurrence}`)} onPress={() => setRecurrenceOpen(true)} icon="repeat" />
  );
  const billableField = (
    <>
      <SwitchField label={tr('purchases:form.billable')} description={tr('purchases:form.billableHint')} value={billable} onValueChange={setBillable} />
      {billable ? (
        <PickerField label={tr('purchases:form.billTo')} value={customers.find((c) => c.id === customerId)?.name ?? tr('purchases:form.billToAny')} onPress={() => setCustomerOpen(true)} icon="account-arrow-right-outline" hint={tr('purchases:form.billToHint')} />
      ) : null}
      <CostCentreField value={costCentreId} onChange={setCostCentreId} />
      <VehicleField value={vehicleId} onChange={setVehicleId} />
    </>
  );
  const receiptCard = (
    <Pressable onPress={attachReceipt} accessibilityRole="button" accessibilityLabel={tr('purchases:form.attachReceipt')}>
      <Card variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        <Icon name={receiptUri ? 'check-circle' : 'paperclip'} size={20} color={receiptUri ? t.c.good : t.c.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="body" weight="600">
            {receiptUri ? tr('purchases:form.receiptAttached') : tr('purchases:form.attachAReceipt')}
          </Text>
          <Text variant="caption" tone="muted">
            {receiptUri ? tr('purchases:form.tapToReplace') : tr('purchases:form.receiptHint')}
          </Text>
        </View>
        <Icon name="chevron-right" size={18} color={t.c.muted} />
      </Card>
    </Pressable>
  );
  const scanButton = (
    <Button
      title={tr('purchases:form.scanInstead')}
      variant="ghost"
      icon="text-recognition"
      onPress={() => router.push('/(app)/ocr/capture')}
      fullWidth
    />
  );
  const submitTitle = expense ? tr('settings:profile.save') : tr('purchases:form.recordExpense');

  const phoneForm = (
    <ScrollView
      contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={SHOW_SCROLLBAR}
    >
      {amountField}

      {categoryField}

      {dateField}

      {methodField}
      {accountField}
      {supplierField}

      {taxField}

      {taxRate > 0 ? (
        <>
          {inclusiveField}
          {reverseChargeField}
          {itcField}
          {gstinField}
          <Card variant="flat" style={{ gap: t.spacing.sm }}>
            {[
              { label: tr('common:totals.netAmount'), value: formatMoney(netAmount) },
              { label: tr('purchases:form.inputTaxRate', { rate: formatPercent(taxRate) }), value: formatMoney(taxAmount) },
              { label: tr('purchases:form.totalPaid'), value: formatMoney(totalPaid) },
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

      {referenceField}
      {notesField}

      {repeatsField}
      {billableField}

      {receiptCard}

      {scanButton}
    </ScrollView>
  );

  const summaryRow = (label: string, value: string, strong = false) => (
    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.md }}>
      <Text variant={strong ? 'body' : 'small'} tone={strong ? undefined : 'muted'} weight={strong ? '700' : undefined}>
        {label}
      </Text>
      <Text variant={strong ? 'body' : 'small'} weight={strong ? '700' : '600'} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );

  const details = (
    <FormSection title={tr('purchases:expense.details')}>
      <FieldRow>
        {amountField}
        {dateField}
      </FieldRow>
      <FieldRow>
        {categoryField}
        {supplierField}
      </FieldRow>
      <FieldRow>
        {methodField}
        {accountField}
      </FieldRow>
      <FieldRow>
        {referenceField}
        {repeatsField}
      </FieldRow>
      {notesField}
    </FormSection>
  );
  const tax = (
    <FormSection title={tr('purchases:form.tax')}>
      <FieldRow>
        {taxField}
        {/* The switch sits level with the picker's box rather than its label. */}
        {taxRate > 0 ? <View style={{ paddingTop: 22 }}>{inclusiveField}</View> : <View />}
      </FieldRow>
      {taxRate > 0 ? (
        <>
          {reverseChargeField}
          <FieldRow>
            {itcField}
            {gstinField ?? <View />}
          </FieldRow>
        </>
      ) : null}
    </FormSection>
  );
  const summary = (
    <FormSection title={tr('purchases:form.summary')}>
      <View style={{ gap: t.spacing.md }}>
        {taxRate > 0 ? summaryRow(tr('common:totals.netAmount'), formatMoney(netAmount)) : null}
        {taxRate > 0 ? summaryRow(tr('purchases:form.inputTaxRate', { rate: formatPercent(taxRate) }), formatMoney(taxAmount)) : null}
        {taxRate > 0 ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
        {summaryRow(tr('purchases:form.totalPaid'), formatMoney(totalPaid), true)}
      </View>
    </FormSection>
  );
  const receipt = (
    <FormSection title={tr('purchases:form.receipt')}>
      <View style={{ gap: t.spacing.sm }}>
        {receiptCard}
        {scanButton}
      </View>
    </FormSection>
  );
  const billableCard = <Card>{billableField}</Card>;

  const desktopForm = (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={SHOW_SCROLLBAR}
    >
      {/* A narrow browser window (icon-only sidebar) has no room for the side column. */}
      {breakpoint === 'tablet' ? (
        <View style={{ gap: t.spacing.lg }}>
          {details}
          {tax}
          {summary}
          {billableCard}
          {receipt}
        </View>
      ) : (
        <SplitPane
          sideWidth={360}
          main={
            <View style={{ gap: t.spacing.lg }}>
              {details}
              {tax}
            </View>
          }
          side={
            <>
              {summary}
              {billableCard}
              {receipt}
            </>
          }
        />
      )}
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormContainer wide={desktop} style={desktop ? { maxWidth: '100%' } : undefined}>
        {desktop ? desktopForm : phoneForm}

        {desktop ? (
          <FormActions>
            <Button title={tr('common:action.cancel')} variant="ghost" onPress={() => goBack(expense ? `/(app)/expenses/${expense.id}` : '/(app)/expenses')} />
            <Button shortcut="S" title={submitTitle} onPress={() => void save()} loading={saving || uploading} disabled={blocked || amount.minor <= 0} />
          </FormActions>
        ) : (
          <FormActions>
            <Button shortcut="S" title={submitTitle} onPress={() => void save()} loading={saving || uploading} disabled={blocked || amount.minor <= 0} fullWidth />
          </FormActions>
        )}

        <SelectSheet
          visible={customerOpen}
          onClose={() => setCustomerOpen(false)}
          title={tr('purchases:form.billTo')}
          options={[{ value: '', label: tr('purchases:form.billToAny') }, ...(customerSearch.data ?? []).map((c) => ({ value: c.id!, label: c.name! }))]}
          onQueryChange={setCustomerQuery}
          loading={customerSearch.isFetching}
          value={customerId ?? ''}
          onSelect={(v) => setCustomerId(v || undefined)}
        />
        <SelectSheet
          visible={itcOpen}
          onClose={() => setItcOpen(false)}
          title={tr('inventory:gst.itc')}
          options={(['eligible', 'blocked', 'ineligible'] as const).map((k) => ({ value: k, label: tr(`inventory:gst.itcOption.${k}`), description: tr(`inventory:gst.itcOptionHint.${k}`) }))}
          value={itcEligibility}
          onSelect={(v) => setItcEligibility(v as ItcEligibility)}
          searchable={false}
        />
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
          options={(supplierSearch.data ?? []).map((s) => ({ value: s.id!, label: s.name!, description: s.phone ?? s.code }))}
          onQueryChange={setSupplierQuery}
          loading={supplierSearch.isFetching}
          value={supplierId}
          onSelect={(id) => {
            setSupplierId(id);
            // A supplier under reverse charge puts their bills under it.
            setReverseCharge(!!supplierSearch.data?.find((x) => x.id === id)?.reverseCharge);
          }}
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
          options={RECURRENCES.map((r) => ({ value: r, label: tr(`purchases:recurrence.${r}`) }))}
          value={recurrence}
          onSelect={(v) => setRecurrence(v as RecurrenceFrequency)}
          searchable={false}
        />
        {leaveGuard.dialog}
      </FormContainer>
    </KeyboardAvoidingView>
  );
}
