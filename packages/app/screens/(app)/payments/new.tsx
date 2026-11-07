import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { FieldRow, FormContainer, FormSection, SplitPane } from '@esmart/ui/components/Layout';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Button } from '@esmart/ui/components/Button';
import { Avatar } from '@esmart/ui/components/Avatar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { AmountField, PickerField, SwitchField, TextField } from '@esmart/ui/components/Field';
import { useDecimalText } from '../../../components/useDecimalText';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useToast } from '@esmart/ui/components/Toast';
import { useServerSave } from '../../../components/useServerSave';
import { useSaveShortcut } from '../../../components/useSaveShortcut';
import { useLeaveGuard } from '../../../components/useLeaveGuard';

import { Payment, PaymentAllocation, PaymentDirection, PaymentMethod } from '@esmart/core/types';
import { accountIdAfterMethodChange, accountsForMethod, defaultAccountFor } from '@esmart/core/domain/paymentAccounts';
import { resolveRate, settlementGainLoss } from '@esmart/core/domain/fx';
import { availableAdvance } from '@esmart/core/domain/receivables';
import { INDIAN_STATES, PAYMENT_METHODS } from '@esmart/core/data/masters';
import { CURRENCIES } from '@esmart/core/lib/currencies';
import { TDS_SECTIONS, tdsSection } from '@esmart/core/data/tdsSections';
import { paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney, toAmountInput } from '@esmart/core/lib/format';
import { daysBetween, formatDate, today } from '@esmart/core/lib/date';
import { Money, fromMajor, money, subtract, zero } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { DEFAULT_ADVANCE_RATE, advanceInterState, advanceTaxSplit } from '@esmart/core/domain/advanceTax';
import { homeStateCode } from '@esmart/core/domain/taxEngine';

import { useAppStore } from '../../../store/appStore';
import {
  useBaseCurrency,
  useCurrentUser,
  useExchangeRates,
  useHasModule,
  useParties,
  usePaymentAccounts,
  useDefaultBranchId,
  useActiveCompany,
  useTaxCategories,
} from '../../../store/selectors';
import { describeError } from '../../../remote/errors';
import { adjustAdvancesFor, loadForAdvances, useOpenDocuments, usePartyRecord, usePartySearch, useServerAccountBalances } from '../../../remote/queries';
import { useDebounced } from '../../../components/useDebounced';
import { SHOW_SCROLLBAR, useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { useGoBack } from '../../../navigation/useGoBack';


/** What settles a document besides cash. */
type Adjustment = 'tdsDeducted' | 'discount' | 'writeOff';
const ADJUSTMENTS: Adjustment[] = ['tdsDeducted', 'discount', 'writeOff'];
export default function NewPayment() {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain', 'sales', 'common']);
  const router = useRouter();
  const goBack = useGoBack();
  const toast = useToast();
  const { run: serverSave, saving, blocked, release: releaseSave } = useServerSave();
  const insets = useSafeAreaInsets();
  // Always 'phone' in the native apps, so the desktop layout only ever reaches a browser.
  const breakpoint = useBreakpoint();
  const desktop = breakpoint !== 'phone';

  const params = useLocalSearchParams<{ direction?: string; partyId?: string; documentId?: string; advance?: string }>();
  // Paying suppliers is part of payables, which the Sales plan leaves out.
  const canPay = useHasModule('payables');
  const direction: PaymentDirection = params.direction === 'paid' && canPay ? 'paid' : 'received';

  const baseCurrency = useBaseCurrency();
  const company = useActiveCompany();
  const taxCategories = useTaxCategories();
  const parties = useParties(direction === 'received' ? 'customer' : 'supplier');
  const accounts = usePaymentAccounts();
  const exchangeRates = useExchangeRates();
  const user = useCurrentUser();
  // The server lets only these roles write off what a party owes.
  const canWriteOff = ['owner', 'admin', 'accountant'].includes(user?.role ?? '');
  const savePayment = useAppStore((s) => s.savePayment);
  const applyAdvances = useAppStore((s) => s.applyAdvances);
  const defaultBranchId = useDefaultBranchId();
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);

  const [partyId, setPartyId] = useState<string | null>(params.partyId ?? null);
  const [date, setDate] = useState(today());
  const [amountText, setAmountText] = useState('');
  // Start on UPI when there is an account for it, else cash (a cash-only business).
  const [method, setMethod] = useState<PaymentMethod>(() => (defaultAccountFor('upi', accounts) ? 'upi' : 'cash'));
  // The account follows the method: a bank payment never defaults to cash in hand.
  const [pickedAccountId, setAccountId] = useState(() => defaultAccountFor(method, accounts)?.id ?? '');
  const methodAccounts = accountsForMethod(method, accounts);
  // Re-derived every render, so accounts that load (or change) later are picked up.
  const accountId = methodAccounts.some((a) => a.id === pickedAccountId)
    ? pickedAccountId
    : (defaultAccountFor(method, accounts)?.id ?? '');
  /** While the user has not typed an amount, it tracks what is ticked below. */
  const [amountFollows, setAmountFollows] = useState(true);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  // An advance for services carries GST from the day it is received (s.13(2)).
  // Opened as "Advance receipt" from the menu: the switch starts on.
  const [serviceAdvance, setServiceAdvance] = useState(params.advance === '1');
  const [advanceTaxId, setAdvanceTaxId] = useState<string | undefined>();
  const [advancePos, setAdvancePos] = useState<string | undefined>();
  /** The service's SAC, and any cess on it (percent), for table 11 and the receipt voucher. */
  const [advanceSac, setAdvanceSac] = useState('');
  const [advanceCess, setAdvanceCess] = useState(0);
  const cessText = useDecimalText(advanceCess, setAdvanceCess);
  /** TDS the customer deducted from an advance, before any invoice. */
  const [advanceTdsText, setAdvanceTdsText] = useState('');
  const [advanceSheet, setAdvanceSheet] = useState<'tax' | 'pos' | 'tds' | null>(null);
  /** The section of TDS kept back on money paid; the supplier's own until changed. */
  const [tdsSectionChoice, setTdsSectionChoice] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  /** Per document: what settles it without cash (TDS deducted, discount, write-off), as typed. */
  const [adjustments, setAdjustments] = useState<Record<string, Partial<Record<Adjustment, string>>>>({});
  const [adjusting, setAdjusting] = useState<string | null>(null);
  /** Set only when the user overrides the resolved settlement rate. */
  const [rateOverride, setRateOverride] = useState<number | null>(null);

  /** Set when the user picks a currency other than the party's. */
  const [currencyChoice, setCurrencyChoice] = useState<string | null>(null);
  const [partyOpen, setPartyOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // What the person has picked or typed; an amount that only follows the allocations is not theirs.
  const entered = JSON.stringify([partyId, date, amountFollows ? null : amountText, reference, notes]);
  const [untouched] = useState(entered);
  const leaveGuard = useLeaveGuard(entered !== untouched);

  // The party from the server, with the advance it holds; the store copy until it lands.
  const partyRecord = usePartyRecord(partyId ?? undefined).data;
  const party = (partyRecord as unknown as (typeof parties)[number] | undefined) ?? parties.find((p) => p.id === partyId);
  const [partyQuery, setPartyQuery] = useState('');
  const partySearch = usePartySearch(direction === 'received' ? 'customer' : 'supplier', useDebounced(partyQuery), partyOpen);

  // A payment settles in the party's currency unless the user picks another, at
  // the rate effective on the payment date unless the user says otherwise.
  const currency = currencyChoice ?? party?.currency ?? baseCurrency;

  // Money in settles invoices and debit notes; money out, bills and supplier debit notes. What each
  // still owes is the server's figure (returns and credit notes already off), in the payment currency, oldest first.
  const open = useOpenDocuments(partyId, direction === 'received' ? ['invoice', 'debitNote'] : ['purchaseBill', 'supplierDebitNote']);
  const outstanding = useMemo(() => {
    const asOf = today();
    return (open.data ?? [])
      .filter((d) => d.grandTotal.currency === currency && (d.outstanding?.minor ?? 0) > 0)
      .map((d) => ({
        document: { id: d.id, number: d.number, date: d.date, dueDate: d.dueDate, exchangeRate: d.exchangeRate ?? 1, tdsExpected: d.tdsExpected },
        outstanding: d.outstanding as Money,
        daysOverdue: d.dueDate ? daysBetween(d.dueDate, asOf) : 0,
      }))
      .sort((a, b) => a.document.date.localeCompare(b.document.date));
  }, [open.data, currency]);

  const resolvedRate = useMemo(
    () => (currency === baseCurrency ? 1 : resolveRate(exchangeRates, currency, baseCurrency, date)),
    [currency, baseCurrency, exchangeRates, date],
  );
  const exchangeRate = rateOverride ?? resolvedRate;
  const rateText = useDecimalText(exchangeRate, setRateOverride);

  // Seed the allocation from the invoice we were opened from, on the first
  // render where that invoice is actually in the outstanding list.
  const prefill = params.documentId ? outstanding.find((o) => o.document.id === params.documentId) : undefined;
  // TDS the customer was expected to deduct from an invoice (RULES 4.14): taken as deducted unless changed.
  const expectedTdsOf = (docId: string): number => {
    if (direction !== 'received') return 0;
    const o = outstanding.find((x) => x.document.id === docId);
    const e = o?.document.tdsExpected;
    return e && e.amount.currency === currency ? Math.min(e.amount.minor, o!.outstanding.minor) : 0;
  };
  if (prefill && !seeded) {
    setSeeded(true);
    const tds = expectedTdsOf(prefill.document.id);
    const cash = money(prefill.outstanding.minor - tds, currency);
    setAllocations({ [prefill.document.id]: toAmountInput(cash) });
    if (tds) setAdjustments({ [prefill.document.id]: { tdsDeducted: toAmountInput(money(tds, currency)) } });
    setAmountText(toAmountInput(cash));
  }

  // Advances held against this party: what its earlier payments left unallocated, the only advance
  // Adjust can put on a document. The server's party advance also counts a credit note raised on its
  // own, which can't settle an invoice here, so it isn't offered. Read from the payments themselves,
  // loaded once the party is picked, so it also drops the moment an adjustment uses it.
  const storePayments = useAppStore((s) => s.payments);
  useEffect(() => {
    if (partyId) loadForAdvances(activeCompanyId, partyId, direction, []).catch(() => {});
  }, [activeCompanyId, partyId, direction]);
  const advance = useMemo(
    () => availableAdvance(storePayments.filter((p) => p.companyId === activeCompanyId && p.partyId === partyId && p.direction === direction), currency),
    [storePayments, activeCompanyId, partyId, direction, currency],
  );
  /** Adjust held advances against every open document, or just `docId`. */
  const adjustAdvance = async (docId?: string) => {
    if (!partyId) return;
    let applied: Money[];
    try {
      // Online the server applies them (notes too, and a service advance's GST); offline the device does,
      // and then it needs the party's payments and these documents in full.
      applied = await adjustAdvancesFor(partyId, direction, docId ? [docId] : undefined, async () => {
        await loadForAdvances(activeCompanyId, partyId, direction, docId ? [docId] : outstanding.map((o) => o.document.id));
        return applyAdvances(partyId, direction, docId ? [docId] : undefined);
      });
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
      return;
    }
    const next = { ...allocations };
    if (docId) delete next[docId];
    const kept = docId ? next : {};
    setAllocations(kept);
    if (amountFollows) setAmountText(sumOf(kept) ? toAmountInput(money(sumOf(kept), currency)) : '');
    toast.show(
      applied.length
        ? tr('sales:payment.advanceAdjusted', { amount: applied.map((m) => formatMoney(m)).join(', ') })
        : tr('sales:payment.advanceNothingToAdjust'),
      applied.length ? 'success' : 'info',
      { icon: 'cash-refund', detail: `${party?.name ?? ''}` },
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
  const taxed = taxCategories.filter((c) => c.rate > 0);
  // A rate not known is 18% (RULES 8.12).
  const advanceTaxCategory = taxed.find((c) => c.id === advanceTaxId) ?? taxed.find((c) => c.rate === DEFAULT_ADVANCE_RATE) ?? taxed[0];
  // Memoised: called while rendering, the compiler would take `company` as changed by it and skip this screen.
  const homeState = useMemo(() => homeStateCode(company), [company]);
  // A place of supply not known is taken as another state: IGST, under "Other Territory" (97).
  const pos = advancePos ?? party?.billingAddress?.stateCode;
  const canAdvance = direction === 'received' && unallocated.minor > 0 && !!company.taxRegistration?.registered && !!taxed.length;
  const sac = advanceSac.trim();
  // An HSN that isn't a SAC (99…) is goods, which carry no GST on an advance (notification 66/2017).
  const goodsSac = !!sac && !sac.startsWith('99');
  const advanceTds = direction === 'received' ? fromMajor(advanceTdsText || '0', currency) : zero(currency);
  const advanceTax =
    canAdvance && serviceAdvance && advanceTaxCategory && !goodsSac
      ? { taxCategoryId: advanceTaxCategory.id, rate: advanceTaxCategory.rate, placeOfSupplyStateCode: pos ?? '97', ...(sac && { hsn: sac }), ...(advanceCess > 0 && { cessRate: advanceCess }) }
      : null;
  // The tax inside what was received (and what the customer kept back as TDS), shown as it is typed.
  const advanceSplit = advanceTax ? advanceTaxSplit(Math.round((unallocated.minor + advanceTds.minor) * (exchangeRate || 1)), advanceTax.rate, advanceCess, advanceInterState(homeState, pos)) : null;
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

  const toggleAllocation = (docId: string, owed: Money) => {
    const next = { ...allocations };
    // The invoice's expected TDS settles that much without cash; the rest is what the cash applies.
    const tds = !next[docId] && !adjustedOf(docId) ? expectedTdsOf(docId) : 0;
    if (tds) setAdjustments((a) => ({ ...a, [docId]: { ...a[docId], tdsDeducted: toAmountInput(money(tds, currency)) } }));
    const full = money(owed.minor - tds, currency);
    if (next[docId]) {
      delete next[docId];
    } else if (amountFollows) {
      next[docId] = toAmountInput(full);
    } else {
      // Apply only what is left of the typed amount.
      const take = Math.min(full.minor, amount.minor - sumOf(allocations));
      if (take <= 0) {
        toast.show(tr('sales:payment.nothingLeftToApply'), 'warning', { icon: 'cash-remove' });
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

  const adjustedOf = (docId: string, a = adjustments) =>
    ADJUSTMENTS.reduce((acc, k) => acc + fromMajor(a[docId]?.[k] || '0', currency).minor, 0);

  /** An adjustment never takes a document past what it owes; the cash on it shrinks to fit. */
  const setAdjustment = (docId: string, key: Adjustment, v: string, owed: Money) => {
    const typed = { ...adjustments[docId], [key]: v };
    const others = ADJUSTMENTS.filter((k) => k !== key).reduce((acc, k) => acc + fromMajor(typed[k] || '0', currency).minor, 0);
    if (fromMajor(v || '0', currency).minor > owed.minor - others) typed[key] = toAmountInput(money(Math.max(owed.minor - others, 0), currency));
    const nextAdj = { ...adjustments, [docId]: typed };
    setAdjustments(nextAdj);
    const room = owed.minor - adjustedOf(docId, nextAdj);
    if (fromMajor(allocations[docId] || '0', currency).minor > room) {
      const next = { ...allocations, [docId]: toAmountInput(money(Math.max(room, 0), currency)) };
      setAllocations(next);
      if (amountFollows) setAmountText(toAmountInput(money(sumOf(next), currency)));
    }
  };
  const adjustedTotal = Object.keys(allocations).reduce((acc, id) => acc + adjustedOf(id), 0);
  // TDS kept back on money paid goes under a section (26Q): the supplier's own unless changed. TDS a
  // customer deducted goes to TDS receivable under its section (26AS): the invoice's expected one, else theirs.
  const tdsRows = Object.keys(allocations).filter((id) => fromMajor(adjustments[id]?.tdsDeducted || '0', currency).minor > 0);
  const keepsTds = tdsRows.length > 0;
  const partySection = (party as { tdsSection?: string } | undefined)?.tdsSection;
  const invoiceSection = direction === 'received' ? tdsRows.map((id) => outstanding.find((o) => o.document.id === id)?.document.tdsExpected?.section).find(Boolean) : undefined;
  const tdsSectionPicked = tdsSectionChoice ?? invoiceSection ?? (partySection && partySection !== 'none' ? partySection : undefined);

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

  // Money going out cannot exceed what the account holds, whether cash, bank or wallet.
  const account = accounts.find((a) => a.id === accountId);
  const balances = useServerAccountBalances();
  const balance = accountId ? balances?.[accountId] : undefined;
  const amountInBase = Math.round(amount.minor * (exchangeRate || 1));
  const shortfall = direction === 'paid' && balance !== undefined && amountInBase > balance;
  const balanceBlocks = shortfall && !!account;

  // A receipt may move no money when it only records TDS deducted, a discount or a write-off.
  const canSave =
    !!partyId &&
    (amount.minor > 0 || (amount.minor === 0 && adjustedTotal > 0)) &&
    !overAllocated &&
    !!accountId &&
    !balanceBlocks &&
    (!keepsTds || direction === 'received' || !!tdsSectionPicked) &&
    // TDS on an advance goes to a section's receivable (26AS); an advance for goods takes no GST.
    (advanceTds.minor === 0 || !!tdsSectionPicked) &&
    !(serviceAdvance && canAdvance && goodsSac);

  const save = async () => {
    if (!canSave || !partyId) return;

    const adj = (docId: string, key: Adjustment) => {
      const m = fromMajor(adjustments[docId]?.[key] || '0', currency);
      return m.minor > 0 ? m : undefined;
    };
    const allocationRows: PaymentAllocation[] = outstanding
      .filter((o) => o.document.id in allocations && fromMajor(allocations[o.document.id] || '0', currency).minor + adjustedOf(o.document.id) > 0)
      .map((o) => ({
        documentId: o.document.id,
        documentNumber: o.document.number,
        amount: fromMajor(allocations[o.document.id] || '0', currency),
        tdsDeducted: adj(o.document.id, 'tdsDeducted'),
        discount: adj(o.document.id, 'discount'),
        writeOff: canWriteOff ? adj(o.document.id, 'writeOff') : undefined,
      }));

    const payment: Payment = {
      id: uid('pay'),
      companyId: activeCompanyId,
      branchId: defaultBranchId ?? '',
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
      unallocated: unallocated.minor > 0 ? money(unallocated.minor + advanceTds.minor, currency) : zero(currency),
      fxGainLoss,
      advanceTax: advanceTax ?? undefined,
      advanceTds: advanceTds.minor > 0 ? advanceTds : undefined,
      tdsSection: keepsTds || advanceTds.minor > 0 ? tdsSectionPicked : undefined,
      notes: notes || undefined,
      attachmentIds: [],
      createdBy: '',
      createdAt: new Date().toISOString(),
    };

    const res = await serverSave(() => savePayment(payment), direction === 'received' ? tr('sales:payment.recorded') : tr('sales:payment.made'), {
      icon: direction === 'received' ? 'cash-check' : 'cash-fast',
      // A template literal, so the compiler knows it is a plain string and not a handle on the party.
      detail: `${formatMoney(amount)}${party ? ` · ${party.name}` : ''}`,
      // Busy until it has left for the payment: a second tap would record it again.
      hold: true,
    });
    if (!res) return;
    if (!res.result) {
      releaseSave();
      toast.show(tr('sales:payment.noAccountForMethod'), 'error', { icon: 'bank-off-outline' });
      return;
    }
    await leaveGuard.release();
    router.replace(`/(app)/payments/${res.id ?? res.result}`);
  };
  useSaveShortcut(() => void save(), !saving && canSave);

  // Every block is built once and placed twice: stacked in one column on a
  // phone, grouped into cards across two columns on a desktop browser.
  const partyCard = (
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
                {tr('sales:payment.openDocuments', { count: outstanding.length })}
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
              <Icon name="account-search-outline" size={21} color={t.c.primary} />
            </View>
            <Text variant="body" weight="600" style={{ flex: 1 }}>
              {tr(direction === 'received' ? 'sales:editor.selectCustomer' : 'sales:editor.selectSupplier')}
            </Text>
          </>
        )}
        <Icon name="chevron-right" size={20} color={t.c.muted} />
      </Card>
    </Pressable>
  );
  // On a desktop the contact is one field among the others rather than a card of its own.
  const partyField = (
    <PickerField
      label={tr(direction === 'received' ? 'common:table.customer' : 'common:table.supplier')}
      value={party?.name}
      onPress={() => setPartyOpen(true)}
      icon="account-search-outline"
      hint={party ? tr('sales:payment.openDocuments', { count: outstanding.length }) : undefined}
      required
    />
  );

  // Large on a phone, where it is the screen's focus; field-sized on a desktop so it lines up in its row.
  const amountField = (size?: 'lg') => (
    <AmountField
      label={tr('sales:payment.amount')}
      value={amountText}
      onChangeValue={onAmountChange}
      currency={currency}
      size={size}
      required
    />
  );

  const dateField = <DateField label={tr('sales:payment.date')} value={date} onChange={setDate} required />;

  const currencyField = (
    <PickerField
      label={tr('sales:payment.currency')}
      value={`${currency}${currency !== baseCurrency ? ` · 1 ${currency} = ${exchangeRate.toFixed(4)} ${baseCurrency}` : ''}`}
      onPress={() => setCurrencyOpen(true)}
      icon="cash-multiple"
    />
  );

  const methodField = (
    <PickerField
      label={tr('sales:payment.method')}
      value={paymentMethodLabel(tr, method)}
      onPress={() => setMethodOpen(true)}
      icon="credit-card-outline"
    />
  );

  const accountField = (
    <PickerField
      label={direction === 'received' ? tr('sales:payment.depositInto') : tr('sales:payment.payFrom')}
      value={methodAccounts.find((a) => a.id === accountId)?.name}
      onPress={() => setAccountOpen(true)}
      icon="bank-outline"
      required
      error={
        methodAccounts.length === 0
          ? tr('sales:payment.noAccountForMethod')
          : balanceBlocks
            ? tr('sales:payment.insufficientInAccount', { account: account?.name ?? '', balance: formatMoney(money(balance ?? 0, baseCurrency)) })
            : undefined
      }
      hint={
        direction === 'paid' && balance !== undefined
          ? shortfall
            ? tr('sales:payment.insufficientBalance', { balance: formatMoney(money(balance, baseCurrency)) })
            : tr('sales:payment.accountBalance', { balance: formatMoney(money(balance, baseCurrency)) })
          : undefined
      }
    />
  );
  const addAccountLink =
    methodAccounts.length === 0 ? (
      <Pressable onPress={() => router.push('/(app)/settings/accounts')} accessibilityRole="link" hitSlop={6}>
        <Text variant="caption" tone="primary" weight="600">{tr('sales:payment.addAccount')}</Text>
      </Pressable>
    ) : null;

  const referenceField = (
    <TextField
      label={tr('sales:payment.reference')}
      value={reference}
      onChangeText={setReference}
      placeholder={tr('sales:payment.referencePlaceholder')}
      icon="pound"
    />
  );

  const rateField =
    currency !== baseCurrency ? (
      <TextField
        label={`${tr('sales:payment.settlementRate')} (1 ${currency} → ${baseCurrency})`}
        {...rateText}
        keyboardType="decimal-pad"
        icon="swap-horizontal"
        hint={tr('sales:payment.fxHint')}
      />
    ) : null;

  const advanceCard =
    partyId && advance.minor > 0 && outstanding.length > 0 ? (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        <Icon name="wallet-outline" size={22} color={t.c.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="small" weight="600">{tr('sales:payment.advanceAvailable', { amount: formatMoney(advance) })}</Text>
          <Text variant="caption" tone="muted">{tr('sales:payment.advanceAvailableHint')}</Text>
        </View>
        <Button title={tr('sales:payment.adjustAdvance')} onPress={() => adjustAdvance()} size="sm" variant="secondary" />
      </Card>
    ) : null;

  const allocationLinks = (
    <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
      <Pressable onPress={autoAllocate} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('sales:payment.autoAllocate')}>
        <Text variant="caption" tone="primary" weight="600">{tr('sales:payment.autoAllocateShort')}</Text>
      </Pressable>
      <Pressable onPress={payFull} hitSlop={6} accessibilityRole="button" accessibilityLabel={tr('sales:payment.payEverything')}>
        <Text variant="caption" tone="primary" weight="600">{tr('sales:payment.payAll')}</Text>
      </Pressable>
    </View>
  );

  const openDocuments = !partyId ? (
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
            accessibilityLabel={tr('sales:payment.allocateTo', { number: o.document.number })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}
          >
            <Icon
              name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={21}
              color={selected ? t.c.primary : t.c.muted}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" weight="600">
                {o.document.number}
              </Text>
              <Text variant="caption" tone="muted">
                {formatDate(o.document.date, 'dd MMM')} · {tr('sales:detail.dueOn', { date: formatDate(o.document.dueDate ?? o.document.date, 'dd MMM') })}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 3 }}>
              <Text variant="small" weight="700">
                {formatMoney(o.outstanding)}
              </Text>
              {o.daysOverdue > 0 ? <Badge label={tr('sales:payment.daysLate', { days: o.daysOverdue })} tone="danger" size="sm" /> : null}
            </View>
          </Pressable>

          {advance.minor > 0 ? (
            <Pressable
              onPress={() => adjustAdvance(o.document.id)}
              hitSlop={6}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 33 }}
            >
              <Icon name="wallet-outline" size={15} color={t.c.primary} />
              <Text variant="caption" tone="primary" weight="600">
                {tr('sales:payment.useAdvanceHere', {
                  amount: formatMoney(money(Math.min(advance.minor, o.outstanding.minor), currency)),
                })}
              </Text>
            </Pressable>
          ) : null}

          {selected ? (
            <AmountField
              value={allocations[o.document.id]}
              onChangeValue={(v) => setRowAllocation(o.document.id, v, money(o.outstanding.minor - adjustedOf(o.document.id), currency))}
              currency={currency}
              label={tr('sales:payment.applying')}
            />
          ) : null}

          {selected && adjusting !== o.document.id && adjustedOf(o.document.id) === 0 ? (
            <Pressable onPress={() => setAdjusting(o.document.id)} hitSlop={6} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 33 }}>
              <Icon name="tune-variant" size={15} color={t.c.primary} />
              <Text variant="caption" tone="primary" weight="600">
                {tr(direction === 'received' ? 'sales:payment.adjustReceived' : 'sales:payment.adjustPaid')}
              </Text>
            </Pressable>
          ) : null}

          {selected && (adjusting === o.document.id || adjustedOf(o.document.id) > 0)
            ? ADJUSTMENTS.filter((k) => k !== 'writeOff' || (canWriteOff && direction === 'received')).map((k) => (
                <AmountField
                  key={k}
                  value={adjustments[o.document.id]?.[k] ?? ''}
                  onChangeValue={(v) => setAdjustment(o.document.id, k, v, o.outstanding)}
                  currency={currency}
                  label={tr(`sales:payment.adjustment.${k}`)}
                  hint={tr(`sales:payment.adjustmentHint.${k}`)}
                />
              ))
            : null}
        </View>
      );
    })
  );

  const summaryRows = (
    <>
      {[
        { label: tr('sales:payment.paymentAmount'), value: formatMoney(amount) },
        { label: tr('sales:payment.allocated'), value: formatMoney(allocatedTotal) },
        ...(adjustedTotal > 0 ? [{ label: tr('sales:payment.settledWithoutCash'), value: formatMoney(money(adjustedTotal, currency)) }] : []),
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
          {overAllocated ? tr('sales:payment.overAllocatedBy') : tr('sales:payment.unallocatedAdvance')}
        </Text>
        <Text variant="body" weight="700" tone={overAllocated ? 'bad' : unallocated.minor > 0 ? 'warn' : 'good'}>
          {formatMoney(overAllocated ? money(-unallocated.minor, currency) : unallocated)}
        </Text>
      </View>
      {fxGainLoss && fxGainLoss.minor !== 0 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text variant="caption" tone="muted">
            {fxGainLoss.minor >= 0 ? tr('sales:payment.fxGain') : tr('sales:payment.fxLoss')}
          </Text>
          <Text variant="caption" weight="600" tone={fxGainLoss.minor >= 0 ? 'good' : 'bad'}>
            {formatMoney(fxGainLoss, { signed: true })}
          </Text>
        </View>
      ) : null}
    </>
  );

  const notesField = (
    <>
      {direction === 'received' && unallocated.minor > 0 ? (
        <AmountField
          label={tr('sales:payment.advanceTds')}
          value={advanceTdsText}
          onChangeValue={setAdvanceTdsText}
          currency={currency}
          hint={tr('sales:payment.advanceTdsHint')}
        />
      ) : null}
      {keepsTds || advanceTds.minor > 0 ? (
        <>
          <PickerField
            label={tr('sales:payment.tdsSection')}
            value={tdsSectionPicked ? `${tdsSection(tdsSectionPicked)?.label ?? tdsSectionPicked} · ${tdsSection(tdsSectionPicked)?.nature ?? ''}` : undefined}
            placeholder={tr('sales:payment.tdsSectionPick')}
            onPress={() => setAdvanceSheet('tds')}
            icon="percent-outline"
            hint={tr('sales:payment.tdsSectionHint')}
          />
          <SelectSheet
            visible={advanceSheet === 'tds'}
            onClose={() => setAdvanceSheet(null)}
            title={tr('sales:payment.tdsSection')}
            options={TDS_SECTIONS.map((s) => ({ value: s.code, label: s.label, description: s.nature }))}
            value={tdsSectionPicked}
            onSelect={setTdsSectionChoice}
          />
        </>
      ) : null}
      {canAdvance ? (
        <>
          <SwitchField label={tr('sales:payment.serviceAdvance')} description={tr('sales:payment.serviceAdvanceHint')} value={serviceAdvance} onValueChange={setServiceAdvance} />
          {serviceAdvance ? (
            <>
              <FieldRow>
                <PickerField label={tr('sales:payment.advanceRate')} value={advanceTaxCategory?.name} onPress={() => setAdvanceSheet('tax')} icon="percent-outline" />
                <PickerField
                  label={tr('sales:editor.placeOfSupply')}
                  value={pos ? INDIAN_STATES.find((st) => st.code === pos)?.name : undefined}
                  placeholder={tr('sales:payment.advancePosUnknown')}
                  onPress={() => setAdvanceSheet('pos')}
                  icon="map-marker-outline"
                />
              </FieldRow>
              <FieldRow>
                <TextField
                  label={tr('sales:payment.advanceSac')}
                  value={advanceSac}
                  onChangeText={(v) => setAdvanceSac(v.replace(/\D/g, '').slice(0, 8))}
                  keyboardType="number-pad"
                  placeholder="9983"
                  error={goodsSac ? tr('sales:payment.advanceGoods') : undefined}
                />
                <TextField label={tr('sales:payment.advanceCess')} {...cessText} keyboardType="decimal-pad" placeholder="0" />
              </FieldRow>
            </>
          ) : null}
          {advanceTax && advanceSplit ? (
            <Text variant="caption" tone="muted">
              {[
                tr('sales:payment.advanceTaxIs', { tax: formatMoney(money(advanceSplit.igst + advanceSplit.cgst + advanceSplit.sgst + advanceSplit.cess, baseCurrency)) }),
                advanceSplit.igst ? `IGST ${formatMoney(money(advanceSplit.igst, baseCurrency))}` : `CGST ${formatMoney(money(advanceSplit.cgst, baseCurrency))} · SGST ${formatMoney(money(advanceSplit.sgst, baseCurrency))}`,
                advanceSplit.cess ? tr('sales:payment.advanceCessIs', { cess: formatMoney(money(advanceSplit.cess, baseCurrency)) }) : '',
                tr('sales:payment.advanceTaxable', { value: formatMoney(money(advanceSplit.taxable, baseCurrency)) }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          <SelectSheet visible={advanceSheet === 'tax'} onClose={() => setAdvanceSheet(null)} title={tr('sales:payment.advanceRate')} options={taxed.map((c) => ({ value: c.id, label: c.name }))} value={advanceTaxCategory?.id} onSelect={setAdvanceTaxId} searchable={false} />
          <SelectSheet visible={advanceSheet === 'pos'} onClose={() => setAdvanceSheet(null)} title={tr('sales:editor.placeOfSupply')} options={INDIAN_STATES.map((st) => ({ value: st.code, label: st.name }))} value={pos} onSelect={setAdvancePos} />
        </>
      ) : null}
      <TextField label={tr('sales:payment.notes')} value={notes} onChangeText={setNotes} placeholder={tr('sales:payment.notesPlaceholder')} multiline />
    </>
  );

  const submitTitle = direction === 'received' ? tr('common:action.recordPayment') : tr('sales:payment.recordPaymentMade');

  const phoneForm = (
    <ScrollView
      contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl, gap: t.spacing.lg }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={SHOW_SCROLLBAR}
    >
      {partyCard}
      {amountField('lg')}
      {dateField}
      {currencyField}
      {methodField}
      {accountField}
      {addAccountLink}
      {referenceField}
      {rateField}
      {advanceCard}

      {/* Allocation */}
      <View style={{ gap: t.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('sales:payment.applyTo')}</Text>
          {allocationLinks}
        </View>

        <Card padded={false}>{openDocuments}</Card>
      </View>

      {/* Allocation summary */}
      <Card style={{ gap: t.spacing.sm }}>{summaryRows}</Card>

      {notesField}
    </ScrollView>
  );

  const details = (
    <FormSection title={tr('sales:payment.details')}>
      <FieldRow>
        {partyField}
        {dateField}
      </FieldRow>
      <FieldRow>
        {amountField()}
        {currencyField}
      </FieldRow>
      <FieldRow>
        {methodField}
        {accountField}
      </FieldRow>
      {addAccountLink}
      <FieldRow>
        {referenceField}
        {/* Holds the column when there's no settlement rate, so reference keeps its width. */}
        {rateField ?? <View />}
      </FieldRow>
    </FormSection>
  );
  const allocation = (
    <FormSection title={tr('sales:payment.applyTo')} action={allocationLinks}>
      <View style={{ borderWidth: 1, borderColor: t.c.line, borderRadius: t.radius.md, overflow: 'hidden' }}>{openDocuments}</View>
    </FormSection>
  );
  const summary = (
    <FormSection title={tr('sales:payment.summary')}>
      <View style={{ gap: t.spacing.sm }}>{summaryRows}</View>
    </FormSection>
  );
  // Notes sit beside the summary so the documents to apply the payment to stay high on the page.
  const notesCard = <Card>{notesField}</Card>;

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
          {advanceCard}
          {allocation}
          {summary}
          {notesCard}
        </View>
      ) : (
        <SplitPane
          sideWidth={360}
          main={
            <View style={{ gap: t.spacing.lg }}>
              {details}
              {advanceCard}
              {allocation}
            </View>
          }
          side={
            <>
              {summary}
              {notesCard}
            </>
          }
        />
      )}
    </ScrollView>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FormContainer wide style={desktop ? { maxWidth: '100%' } : undefined}>
        <Stack.Screen options={{ title: direction === 'received' ? (params.advance === '1' ? tr('sales:payment.advanceReceipt') : tr('common:quickAction.receivePayment')) : tr('sales:payment.makePayment') }} />

        {desktop ? desktopForm : phoneForm}

        {desktop ? (
          <FormActions>
            <Button title={tr('common:action.cancel')} variant="ghost" onPress={() => goBack(direction === 'received' ? '/(app)/payments/received' : '/(app)/payments/made')} />
            <Button shortcut="S" title={submitTitle} onPress={() => void save()} loading={saving} disabled={blocked || !canSave} />
          </FormActions>
        ) : (
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
              title={submitTitle}
              onPress={() => void save()} loading={saving}
              disabled={blocked || !canSave}
              fullWidth
            />
          </View>
        )}

        <SelectSheet
          visible={partyOpen}
          onClose={() => setPartyOpen(false)}
          title={tr(direction === 'received' ? 'sales:editor.selectCustomer' : 'sales:editor.selectSupplier')}
          options={(partySearch.data ?? []).map((p) => ({ value: p.id!, label: p.name!, description: p.phone ?? p.email ?? p.code }))}
          onQueryChange={setPartyQuery}
          loading={partySearch.isFetching}
          value={partyId}
          onSelect={(id) => {
            setPartyId(id);
            setAllocations({});
            setRateOverride(null);
            setCurrencyChoice(null);
          }}
        />
        <SelectSheet
          visible={currencyOpen}
          onClose={() => setCurrencyOpen(false)}
          title={tr('sales:payment.currency')}
          options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})`, trailing: c.symbol }))}
          value={currency}
          onSelect={(code) => {
            setCurrencyChoice(code === (party?.currency ?? baseCurrency) ? null : code);
            setAllocations({});
            setRateOverride(null);
            if (amountFollows) setAmountText('');
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
        {leaveGuard.dialog}
      </FormContainer>
    </KeyboardAvoidingView>
  );
}
