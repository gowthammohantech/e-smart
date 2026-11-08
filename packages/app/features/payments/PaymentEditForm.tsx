import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Icon } from '@esmart/ui/components/Icon';
import { Text } from '@esmart/ui/components/Text';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { FieldRow, FormContainer, FormSection } from '@esmart/ui/components/Layout';
import { PickerField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { PAYMENT_METHODS } from '@esmart/core/data/masters';
import { accountIdAfterMethodChange, accountsForMethod, defaultAccountFor } from '@esmart/core/domain/paymentAccounts';
import { paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney } from '@esmart/core/lib/format';
import type { Payment, PaymentMethod } from '@esmart/core/types';
import { useServerSave } from '../../components/useServerSave';
import { useSaveShortcut } from '../../components/useSaveShortcut';
import { useLeaveGuard } from '../../components/useLeaveGuard';
import { useAppStore } from '../../store/appStore';
import { useParty, usePaymentAccounts } from '../../store/selectors';
import { useGoBack } from '../../navigation/useGoBack';

/**
 * Corrects a recorded payment's details: its date, how it was paid, the account, the reference and
 * the note. The amount and what it settles stay as they are; changing those is a delete and a new
 * payment, so the documents it settled are never left half-reworked.
 */
export function PaymentEditForm({ payment }: { payment: Payment }) {
  const t = useTheme();
  const { t: tr } = useTranslation(['sales', 'common', 'purchases']);
  const desktop = useIsDesktop();
  const goBack = useGoBack();
  const { run: serverSave, saving, blocked } = useServerSave();
  const savePayment = useAppStore((s) => s.savePayment);
  const accounts = usePaymentAccounts();
  const party = useParty(payment.partyId);
  const isIn = payment.direction === 'received';

  const [date, setDate] = useState(payment.date);
  const [method, setMethod] = useState<PaymentMethod>(payment.method);
  const [pickedAccountId, setAccountId] = useState(payment.accountId);
  const methodAccounts = accountsForMethod(method, accounts);
  const accountId = methodAccounts.some((a) => a.id === pickedAccountId) ? pickedAccountId : (defaultAccountFor(method, accounts)?.id ?? '');
  const [reference, setReference] = useState(payment.reference ?? '');
  const [notes, setNotes] = useState(payment.notes ?? '');
  const [methodOpen, setMethodOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const entered = JSON.stringify([date, method, accountId, reference, notes]);
  const [untouched] = useState(entered);
  const leaveGuard = useLeaveGuard(entered !== untouched);
  const back = `/(app)/payments/${payment.id}`;

  const canSave = !!accountId && entered !== untouched;
  const save = async () => {
    if (!canSave) return;
    const updated: Payment = { ...payment, date, method, accountId, reference: reference.trim() || undefined, notes: notes.trim() || undefined };
    const res = await serverSave(() => savePayment(updated), tr('sales:payment.updated'), { icon: 'cash-check', detail: payment.number });
    if (!res) return;
    await leaveGuard.release();
    goBack(back);
  };
  useSaveShortcut(() => void save(), !saving && canSave);

  const summary = (
    <Card variant="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
      <Icon name="information-outline" size={20} color={t.c.primary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="600">
          {`${formatMoney(payment.amount)} · ${tr(isIn ? 'sales:payment.receivedFrom' : 'sales:payment.paidTo', { name: party?.name ?? tr('common:placeholder.unknown') })}`}
        </Text>
        <Text variant="caption" tone="muted">
          {tr('sales:payment.editHint')}
        </Text>
      </View>
    </Card>
  );
  const dateField = <DateField label={tr('sales:payment.date')} value={date} onChange={setDate} required />;
  const methodField = <PickerField label={tr('sales:payment.method')} value={paymentMethodLabel(tr, method)} onPress={() => setMethodOpen(true)} icon="credit-card-outline" />;
  const accountField = (
    <PickerField
      label={isIn ? tr('sales:payment.depositInto') : tr('sales:payment.payFrom')}
      value={methodAccounts.find((a) => a.id === accountId)?.name}
      onPress={() => setAccountOpen(true)}
      icon="bank-outline"
      required
      error={methodAccounts.length === 0 ? tr('sales:payment.noAccountForMethod') : undefined}
    />
  );
  const referenceField = <TextField label={tr('sales:payment.reference')} value={reference} onChangeText={setReference} placeholder={tr('sales:payment.referencePlaceholder')} icon="pound" />;
  const notesField = <TextField label={tr('sales:payment.notes')} value={notes} onChangeText={setNotes} placeholder={tr('sales:payment.notesPlaceholder')} multiline />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FormContainer>
        <ScrollView contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={SHOW_SCROLLBAR}>
          {summary}
          {desktop ? (
            <FormSection title={tr('sales:payment.details')}>
              <FieldRow>
                {dateField}
                {referenceField}
              </FieldRow>
              <FieldRow>
                {methodField}
                {accountField}
              </FieldRow>
              {notesField}
            </FormSection>
          ) : (
            <>
              {dateField}
              {methodField}
              {accountField}
              {referenceField}
              {notesField}
            </>
          )}
        </ScrollView>
        <FormActions>
          {desktop ? <Button title={tr('common:action.cancel')} variant="ghost" onPress={() => goBack(back)} /> : null}
          <Button shortcut="S" title={tr('common:action.save')} onPress={() => void save()} loading={saving} disabled={blocked || !canSave} fullWidth={!desktop} />
        </FormActions>
      </FormContainer>
      <SelectSheet
        visible={methodOpen}
        onClose={() => setMethodOpen(false)}
        title={tr('sales:payment.method')}
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
        title={isIn ? tr('sales:payment.depositInto') : tr('sales:payment.payFrom')}
        options={methodAccounts.map((a) => ({ value: a.id, label: a.name, description: a.accountNumber ?? a.type }))}
        value={accountId}
        onSelect={setAccountId}
        searchable={false}
      />
      {leaveGuard.dialog}
    </KeyboardAvoidingView>
  );
}
