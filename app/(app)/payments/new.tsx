import React, { useEffect, useMemo, useState } from 'react';
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
import { AmountField, PickerField, Segmented, TextField } from '@/components/Field';
import { DateField } from '@/components/pickers/DateField';
import { SelectSheet } from '@/components/pickers/SelectSheet';
import { useToast } from '@/components/Toast';

import { Payment, PaymentAllocation, PaymentDirection, PaymentMethod } from '@/types';
import { buildOutstanding } from '@/domain/receivables';
import { resolveRate, settlementGainLoss } from '@/domain/fx';
import { PAYMENT_METHOD_LABELS } from '@/data/masters';
import { formatMoney } from '@/lib/format';
import { formatDate, today } from '@/lib/date';
import { Money, fromMajor, money, subtract, toMajor, zero } from '@/lib/money';
import { uid } from '@/lib/id';

import { useAppStore } from '@/store/appStore';
import {
  useBaseCurrency,
  useDocuments,
  useExchangeRates,
  useParties,
  usePaymentAccounts,
  usePayments,
} from '@/store/selectors';

export default function NewPayment() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const params = useLocalSearchParams<{ direction?: string; partyId?: string; documentId?: string }>();
  const direction: PaymentDirection = params.direction === 'paid' ? 'paid' : 'received';

  const baseCurrency = useBaseCurrency();
  const parties = useParties(direction === 'received' ? 'customer' : 'supplier');
  const accounts = usePaymentAccounts();
  const exchangeRates = useExchangeRates();
  const openDocs = useDocuments(direction === 'received' ? 'invoice' : 'purchaseBill');
  const existingPayments = usePayments(direction);
  const savePayment = useAppStore((s) => s.savePayment);
  const activeBranchId = useAppStore((s) => s.activeBranchId);
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);

  const [partyId, setPartyId] = useState<string | null>(params.partyId ?? null);
  const [date, setDate] = useState(today());
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [accountId, setAccountId] = useState(accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState(baseCurrency);
  const [exchangeRate, setExchangeRate] = useState(1);
  const [allocations, setAllocations] = useState<Record<string, string>>({});

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

  useEffect(() => {
    if (!party) return;
    setCurrency(party.currency);
    setExchangeRate(party.currency === baseCurrency ? 1 : resolveRate(exchangeRates, party.currency, baseCurrency, date));
  }, [party, baseCurrency, exchangeRates, date]);

  // Pre-select the invoice we were opened from.
  useEffect(() => {
    if (!params.documentId || outstanding.length === 0) return;
    const row = outstanding.find((o) => o.document.id === params.documentId);
    if (row && !allocations[row.document.id]) {
      setAllocations({ [row.document.id]: String(toMajor(row.outstanding)) });
      setAmountText(String(toMajor(row.outstanding)));
    }
    // Only runs once the list is first available for this document.
  }, [params.documentId, outstanding]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const autoAllocate = () => {
    let remaining = amount.minor;
    const next: Record<string, string> = {};
    outstanding.forEach((o) => {
      if (remaining <= 0) return;
      const take = Math.min(remaining, o.outstanding.minor);
      if (take > 0) {
        next[o.document.id] = String(toMajor(money(take, currency)));
        remaining -= take;
      }
    });
    setAllocations(next);
  };

  const payFull = () => {
    const total = outstanding.reduce((a, o) => a + o.outstanding.minor, 0);
    setAmountText(String(toMajor(money(total, currency))));
    const next: Record<string, string> = {};
    outstanding.forEach((o) => {
      if (o.outstanding.minor > 0) next[o.document.id] = String(toMajor(o.outstanding));
    });
    setAllocations(next);
  };

  const toggleAllocation = (docId: string, full: Money) => {
    setAllocations((a) => {
      const next = { ...a };
      if (next[docId]) delete next[docId];
      else next[docId] = String(toMajor(full));
      return next;
    });
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
        <Pressable onPress={() => setPartyOpen(true)} accessibilityRole="button" accessibilityLabel="Select contact">
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
          label="Amount"
          value={amountText}
          onChangeValue={setAmountText}
          currency={currency}
          size="lg"
          required
        />

        <DateField label="Payment date" value={date} onChange={setDate} required />

        <PickerField
          label="Payment method"
          value={PAYMENT_METHOD_LABELS[method]}
          onPress={() => setMethodOpen(true)}
          icon="credit-card-outline"
        />

        <PickerField
          label={direction === 'received' ? 'Deposit into' : 'Pay from'}
          value={accounts.find((a) => a.id === accountId)?.name}
          onPress={() => setAccountOpen(true)}
          icon="bank-outline"
          required
        />

        <TextField
          label="Reference"
          value={reference}
          onChangeText={setReference}
          placeholder="UTR, cheque number…"
          icon="pound"
        />

        {currency !== baseCurrency ? (
          <TextField
            label={`Settlement rate (1 ${currency} → ${baseCurrency})`}
            value={String(exchangeRate)}
            onChangeText={(v) => setExchangeRate(Number(v.replace(/[^0-9.]/g, '')) || 0)}
            keyboardType="decimal-pad"
            icon="swap-horizontal"
            hint="A rate different from the invoice rate produces an FX gain or loss."
          />
        ) : null}

        {/* Allocation */}
        <View style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Apply to
            </Text>
            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <Pressable onPress={autoAllocate} hitSlop={6} accessibilityRole="button" accessibilityLabel="Auto allocate">
                <Text variant="caption" tone="primary" weight="600">
                  Auto-allocate
                </Text>
              </Pressable>
              <Pressable onPress={payFull} hitSlop={6} accessibilityRole="button" accessibilityLabel="Pay everything">
                <Text variant="caption" tone="primary" weight="600">
                  Pay all
                </Text>
              </Pressable>
            </View>
          </View>

          <Card padded={false}>
            {!partyId ? (
              <EmptyState icon="account-search-outline" title="Pick a contact first" compact />
            ) : outstanding.length === 0 ? (
              <EmptyState
                icon="check-all"
                title="Nothing outstanding"
                message="This payment will be held as an advance against the contact."
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
                        onChangeValue={(v) => setAllocations((a) => ({ ...a, [o.document.id]: v }))}
                        currency={currency}
                        label="Applying"
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

        <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="Internal note" multiline />
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
        }}
      />
      <SelectSheet
        visible={methodOpen}
        onClose={() => setMethodOpen(false)}
        title="Payment method"
        options={Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }))}
        value={method}
        onSelect={(v) => setMethod(v as PaymentMethod)}
        searchable={false}
      />
      <SelectSheet
        visible={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={direction === 'received' ? 'Deposit into' : 'Pay from'}
        options={accounts.map((a) => ({ value: a.id, label: a.name, description: a.accountNumber ?? a.type }))}
        value={accountId}
        onSelect={setAccountId}
        searchable={false}
      />
    </KeyboardAvoidingView>
  );
}
