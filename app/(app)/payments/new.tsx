import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from '@/components/Text';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { AmountField, PickerField, TextField } from '@/components/Field';
import { DateField } from '@/components/pickers/DateField';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { useToast } from '@/components/Toast';

import { Payment, PaymentAllocation, PaymentDirection, PaymentMethod } from '@/types';
import { availableAdvance, buildOutstanding } from '@/domain/receivables';
import { accountIdAfterMethodChange, accountsForMethod, defaultAccountFor } from '@/domain/paymentAccounts';
import { resolveRate, settlementGainLoss } from '@/domain/fx';
import { PAYMENT_METHODS } from '@/data/masters';
import { paymentMethodLabel } from '@/i18n/labels';
import { formatMoney, toAmountInput } from '@/lib/format';
import { formatDate, today } from '@/lib/date';
import { Money, fromMajor, money, subtract, zero } from '@/lib/money';
import { uid } from '@/lib/id';

import { useAppStore } from '@/store/appStore';
import {
  useBaseCurrency,
  useDocuments,
  useExchangeRates,
  useHasModule,
  useParties,
  usePaymentAccounts,
  usePayments,
} from '@/store/selectors';

export default function NewPayment() {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain', 'sales']);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{ direction?: string; partyId?: string; documentId?: string }>();
  // Paying suppliers is part of payables, which the Sales plan leaves out.
  const canPay = useHasModule('payables');
  const direction: PaymentDirection = params.direction === 'paid' && canPay ? 'paid' : 'received';

  const baseCurrency = useBaseCurrency();
  const parties = useParties(direction === 'received' ? 'customer' : 'supplier');
  const accounts = usePaymentAccounts();
  const exchangeRates = useExchangeRates();
  const openDocs = useDocuments(direction === 'received' ? 'invoice' : 'purchaseBill');
  const existingPayments = usePayments(direction);
  const savePayment = useAppStore((s) => s.savePayment);
  const applyAdvances = useAppStore((s) => s.applyAdvances);
  const activeBranchId = useAppStore((s) => s.activeBranchId);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);

  const [partyId, setPartyId] = useState<string | null>(params.partyId ?? null);
  const [date, setDate] = useState(today());
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  // The account follows the method: a bank payment never defaults to cash in hand.
  const [accountId, setAccountId] = useState(defaultAccountFor('upi', accounts)?.id ?? '');
  const methodAccounts = accountsForMethod(method, accounts);
  /** While the user has not typed an amount, it tracks what is ticked below. */
  const [amountFollows, setAmountFollows] = useState(true);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  /** Set only when the user overrides the resolved settlement rate. */
  const [rateOverride, setRateOverride] = useState<number | null>(null);

  const [partyOpen, setPartyOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const party = parties.find((p) => p.id === partyId);

  // Outstanding documents for the selected party, oldest first.
  const outstanding = useMemo(() => {
    if (!partyId) return [];
    const docs = openDocs.filter((d) => d.partyId === partyId);
    return buildOutstanding(docs, existingPayments).sort((a, b) => a.document.date.localeCompare(b.document.date));
  }, [openDocs, existingPayments, partyId]);

  // A payment settles in the party's currency, at the rate effective on the
  // payment date unless the user says otherwise.
  const currency = party?.currency ?? baseCurrency;
  const resolvedRate = useMemo(
    () => (currency === baseCurrency ? 1 : resolveRate(exchangeRates, currency, baseCurrency, date)),
    [currency, baseCurrency, exchangeRates, date],
  );
  const exchangeRate = rateOverride ?? resolvedRate;

  // Seed the allocation from the invoice we were opened from, on the first
  // render where that invoice is actually in the outstanding list.
  const prefill = params.documentId ? outstanding.find((o) => o.document.id === params.documentId) : undefined;
  if (prefill && !seeded) {
    setSeeded(true);
    setAllocations({ [prefill.document.id]: toAmountInput(prefill.outstanding) });
    setAmountText(toAmountInput(prefill.outstanding));
  }

  // Advances already held against this party (unallocated parts of earlier payments).
  const advance = useMemo(
    () => availableAdvance(existingPayments.filter((p) => p.partyId === partyId), currency),
    [existingPayments, partyId, currency],
  );
  const adjustAdvance = () => {
    if (!partyId) return;
    const applied = applyAdvances(partyId, direction);
    setAllocations({});
    if (amountFollows) setAmountText('');
    toast.show(
      applied.length
        ? tr('sales:payment.advanceAdjusted', { amount: applied.map((m) => formatMoney(m)).join(', ') })
        : tr('sales:payment.advanceNothingToAdjust'),
      applied.length ? 'success' : 'info',
    );
  };

  const amount = fromMajor(amountText || '0', currency);
  const allocatedTotal = useMemo(
    () =>
      money(
        Object.values(allocations).reduce((acc, v) => acc + fromMajor(v || '0', currency).minor, 0),
        currency,
      ),
    [allocations, currency],
  );
  const unallocated = subtract(amount, allocatedTotal);
  const overAllocated = unallocated.minor < 0;

  /**
   * Spread `total` over documents oldest first, never more than each one owes.
   * A total smaller than the documents is a partial payment, which is fine.
   */
  const spread = (total: number, onlyIds?: string[]) => {
    let remaining = total;
    const next: Record<string, string> = {};
    outstanding.forEach((o) => {
      if (onlyIds && !onlyIds.includes(o.document.id)) return;
      const take = Math.max(0, Math.min(remaining, o.outstanding.minor));
      // A ticked document stays ticked (at 0.00) while the amount is being typed.
      if (take > 0 || onlyIds) {
        next[o.document.id] = toAmountInput(money(take, currency));
        remaining -= take;
      }
    });
    return next;
  };

  const autoAllocate = () => setAllocations(spread(amount.minor));

  const payFull = () => {
    const total = outstanding.reduce((a, o) => a + o.outstanding.minor, 0);
    setAmountFollows(true);
    setAmountText(toAmountInput(money(total, currency)));
    setAllocations(spread(total));
  };

  const sumOf = (a: Record<string, string>) =>
    Object.values(a).reduce((acc, v) => acc + fromMajor(v || '0', currency).minor, 0);

  const onAmountChange = (v: string) => {
    setAmountText(v);
    setAmountFollows(false);
    // Keep the ticked documents, but re-fit them to the new amount so a
    // smaller (partial) amount never leaves the form over-allocated.
    const ticked = Object.keys(allocations);
    setAllocations(spread(fromMajor(v || '0', currency).minor, ticked.length ? ticked : undefined));
  };

  const toggleAllocation = (docId: string, full: Money) => {
    const next = { ...allocations };
    if (next[docId]) {
      delete next[docId];
    } else if (amountFollows) {
      next[docId] = toAmountInput(full);
    } else {
      // Apply only what is left of the typed amount.
      const take = Math.min(full.minor, amount.minor - sumOf(allocations));
      if (take <= 0) {
        toast.show(tr('sales:payment.nothingLeftToApply'), 'info');
        return;
      }
      next[docId] = toAmountInput(money(take, currency));
    }
    setAllocations(next);
    if (amountFollows) setAmountText(sumOf(next) ? toAmountInput(money(sumOf(next), currency)) : '');
  };

  const setRowAllocation = (docId: string, v: string, owed: Money) => {
    // A document cannot take more than it owes; the excess stays an advance.
    const capped = fromMajor(v || '0', currency).minor > owed.minor ? toAmountInput(owed) : v;
    const next = { ...allocations, [docId]: capped };
    setAllocations(next);
    if (amountFollows) setAmountText(toAmountInput(money(sumOf(next), currency)));
  };

  const fxGainLoss = useMemo(() => {
    if (currency === baseCurrency) return undefined;
    const rows = outstanding.filter((o) => allocations[o.document.id]);
    if (rows.length === 0) return undefined;
    const total = rows.reduce(
      (acc, o) =>
        acc +
        settlementGainLoss(
          fromMajor(allocations[o.document.id] || '0', currency),
          o.document.exchangeRate,
          exchangeRate,
          baseCurrency,
        ).minor,
      0,
    );
    return money(total, baseCurrency);
  }, [outstanding, allocations, currency, baseCurrency, exchangeRate]);

  const canSave = !!partyId && amount.minor > 0 && !overAllocated && !!accountId;

  const save = () => {
    if (!canSave || !partyId) return;

    const allocationRows: PaymentAllocation[] = outstanding
      .filter((o) => allocations[o.document.id] && fromMajor(allocations[o.document.id], currency).minor > 0)
      .map((o) => ({
        documentId: o.document.id,
        documentNumber: o.document.number,
        amount: fromMajor(allocations[o.document.id], currency),
      }));

    const payment: Payment = {
      id: uid('pay'),
      companyId: activeCompanyId,
      branchId: activeBranchId ?? 'brn_mum',
      number: '',
      direction,
      partyId,
      date,
      amount,
      currency,
      exchangeRate,
      method,
      reference: reference || undefined,
      accountId,
      allocations: allocationRows,
      unallocated: unallocated.minor > 0 ? unallocated : zero(currency),
      fxGainLoss,
      notes: notes || undefined,
      attachmentIds: [],
      createdBy: '',
      createdAt: new Date().toISOString(),
    };

    const id = savePayment(payment);
    toast.show(direction === 'received' ? 'Payment recorded' : 'Payment made', 'success');
    router.replace(`/(app)/payments/${id}`);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: direction === 'received' ? 'Receive payment' : 'Make payment' }} />

      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={() => setPartyOpen(true)} accessibilityRole="button" accessibilityLabel={tr('sales:payment.selectContact')}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            {party ? (
              <>
                <Avatar name={party.name} size={42} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" weight="600">
                    {party.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {outstanding.length} open {outstanding.length === 1 ? 'document' : 'documents'}
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor: t.c.chip,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MaterialCommunityIcons name="account-search-outline" size={21} color={t.c.primary} />
                </View>
                <Text variant="body" weight="600" style={{ flex: 1 }}>
                  Select {direction === 'received' ? 'customer' : 'supplier'}
                </Text>
              </>
            )}
            <MaterialCommunityIcons name="chevron-right" size={20} color={t.c.muted} />
          </Card>
        </Pressable>

        <AmountField
          label={tr('sales:payment.amount')}
          value={amountText}
          onChangeValue={onAmountChange}
          currency={currency}
          size="lg"
          required
        />

        <DateField label={tr('sales:payment.date')} value={date} onChange={setDate} required />

        <PickerField
          label={tr('sales:payment.method')}
          value={paymentMethodLabel(tr, method)}
          onPress={() => setMethodOpen(true)}
          icon="credit-card-outline"
        />

        <PickerField
          label={direction === 'received' ? tr('sales:payment.depositInto') : tr('sales:payment.payFrom')}
          value={methodAccounts.find((a) => a.id === accountId)?.name}
          onPress={() => setAccountOpen(true)}
          icon="bank-outline"
          required
          error={methodAccounts.length === 0 ? tr('sales:payment.noAccountForMethod') : undefined}
        />
        {methodAccounts.length === 0 ? (
          <Pressable onPress={() => router.push('/(app)/settings/accounts')} accessibilityRole="link" hitSlop={6}>
            <Text variant="caption" tone="primary" weight="600">{tr('sales:payment.addAccount')}</Text>
          </Pressable>
        ) : null}

        <TextField
          label={tr('sales:payment.reference')}
          value={reference}
          onChangeText={setReference}
          placeholder={tr('sales:payment.referencePlaceholder')}
          icon="pound"
        />

        {currency !== baseCurrency ? (
          <TextField
            label={`Settlement rate (1 ${currency} → ${baseCurrency})`}
            value={String(exchangeRate)}
            onChangeText={(v) => setRateOverride(Number(v.replace(/[^0-9.]/g, '')) || 0)}
            keyboardType="decimal-pad"
            icon="swap-horizontal"
            hint={tr('sales:payment.fxHint')}
          />
        ) : null}

        {partyId && advance.minor > 0 && outstanding.length > 0 ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
            <MaterialCommunityIcons name="wallet-outline" size={22} color={t.c.primary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="small" weight="600">{tr('sales:payment.advanceAvailable', { amount: formatMoney(advance) })}</Text>
              <Text variant="caption" tone="muted">{tr('sales:payment.advanceAvailableHint')}</Text>
            </View>
            <Button title={tr('sales:payment.adjustAdvance')} onPress={adjustAdvance} size="sm" variant="secondary" />
          </Card>
        ) : null}

        {/* Allocation */}
        <View style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('sales:payment.applyTo')}</Text>
            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <Pressable onPress={autoAllocate} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('sales:payment.autoAllocate')}>
                <Text variant="caption" tone="primary" weight="600">{tr('sales:payment.autoAllocateShort')}</Text>
              </Pressable>
              <Pressable onPress={payFull} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('sales:payment.payEverything')}>
                <Text variant="caption" tone="primary" weight="600">{tr('sales:payment.payAll')}</Text>
              </Pressable>
            </View>
          </View>

          <Card padded={false}>
            {!partyId ? (
              <EmptyState icon="account-search-outline" title={tr('sales:payment.pickContact')} compact />
            ) : outstanding.length === 0 ? (
              <EmptyState
                illustration="all-settled"
              icon="check-all"
                title={tr('sales:payment.nothingOutstanding')}
                message={tr('sales:payment.advanceHint')}
                compact
              />
            ) : (
              outstanding.map((o, i) => {
                const selected = !!allocations[o.document.id];
                return (
                  <View
                    key={o.document.id}
                    style={{
                      padding: t.spacing.lg,
                      borderBottomWidth: i < outstanding.length - 1 ? 0.5 : 0,
                      borderBottomColor: t.c.line,
                      gap: t.spacing.sm,
                    }}
                  >
                    <Pressable
                      onPress={() => toggleAllocation(o.document.id, o.outstanding)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`Allocate to ${o.document.number}`}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
                    >
                      <MaterialCommunityIcons
                        name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={21}
                        color={selected ? t.c.primary : t.c.muted}
                      />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="body" weight="600">
                          {o.document.number}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {formatDate(o.document.date, 'dd MMM')} · due {formatDate(o.document.dueDate ?? o.document.date, 'dd MMM')}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 3 }}>
                        <Text variant="small" weight="700">
                          {formatMoney(o.outstanding)}
                        </Text>
                        {o.daysOverdue > 0 ? <Badge label={`${o.daysOverdue}d late`} tone="danger" size="sm" /> : null}
                      </View>
                    </Pressable>

                    {selected ? (
                      <AmountField
                        value={allocations[o.document.id]}
                        onChangeValue={(v) => setRowAllocation(o.document.id, v, o.outstanding)}
                        currency={currency}
                        label={tr('sales:payment.applying')}
                      />
                    ) : null}
                  </View>
                );
              })
            )}
          </Card>
        </View>

        {/* Allocation summary */}
        <Card style={{ gap: t.spacing.sm }}>
          {[
            { label: 'Payment amount', value: formatMoney(amount) },
            { label: 'Allocated', value: formatMoney(allocatedTotal) },
          ].map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="small" tone="muted">
                {r.label}
              </Text>
              <Text variant="small" weight="600">
                {r.value}
              </Text>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: t.c.line, marginVertical: 2 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="body" weight="700" tone={overAllocated ? 'bad' : 'default'}>
              {overAllocated ? 'Over-allocated by' : 'Unallocated (advance)'}
            </Text>
            <Text variant="body" weight="700" tone={overAllocated ? 'bad' : unallocated.minor > 0 ? 'warn' : 'good'}>
              {formatMoney(overAllocated ? money(-unallocated.minor, currency) : unallocated)}
            </Text>
          </View>
          {fxGainLoss && fxGainLoss.minor !== 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text variant="caption" tone="muted">
                FX {fxGainLoss.minor >= 0 ? 'gain' : 'loss'}
              </Text>
              <Text variant="caption" weight="600" tone={fxGainLoss.minor >= 0 ? 'good' : 'bad'}>
                {formatMoney(fxGainLoss, { signed: true })}
              </Text>
            </View>
          ) : null}
        </Card>

        <TextField label={tr('sales:payment.notes')} value={notes} onChangeText={setNotes} placeholder={tr('sales:payment.notesPlaceholder')} multiline />
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
        <Button
          title={direction === 'received' ? 'Record payment' : 'Record payment made'}
          onPress={save}
          disabled={!canSave}
          fullWidth
          size="lg"
        />
      </View>

      <SelectSheet
        visible={partyOpen}
        onClose={() => setPartyOpen(false)}
        title={direction === 'received' ? 'Select customer' : 'Select supplier'}
        options={parties.map((p) => ({ value: p.id, label: p.name, description: p.phone ?? p.email ?? p.code }))}
        value={partyId}
        onSelect={(id) => {
          setPartyId(id);
          setAllocations({});
          setRateOverride(null);
        }}
      />
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
        title={direction === 'received' ? tr('sales:payment.depositInto') : tr('sales:payment.payFrom')}
        options={methodAccounts.map((a) => ({ value: a.id, label: a.name, description: a.accountNumber ?? a.type }))}
        value={accountId}
        onSelect={setAccountId}
        searchable={false}
      />
    </KeyboardAvoidingView>
  );
}
