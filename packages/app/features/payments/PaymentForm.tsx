import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { FieldGrid, FieldRow, FormContainer, FormSection, SplitPane } from '@esmart/ui/components/Layout';
import { FormActions } from '@esmart/ui/components/ActionBar';
import { Text } from '@esmart/ui/components/Text';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { PartyPickerBox } from '../contacts/PartyPickerBox';
import { Button } from '@esmart/ui/components/Button';
import { Avatar } from '@esmart/ui/components/Avatar';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { AmountField, PickerField, TextField } from '@esmart/ui/components/Field';
import { useDecimalText } from '../../components/useDecimalText';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { useToast } from '@esmart/ui/components/Toast';
import { useSaveOnline } from '../../remote/save';
import { useCanWrite } from '../../remote/connectivity';
import { CardRowsSkeleton } from '../../components/ScreenSkeleton';
import { Skeleton } from '@esmart/ui/components/Skeleton';
import { useSaveShortcut } from '../../components/useSaveShortcut';
import { useLeaveGuard } from '../../components/useLeaveGuard';

import { Payment, PaymentAllocation, PaymentDirection, PaymentMethod } from '@esmart/core/types';
import { accountIdAfterMethodChange, accountsForMethod, defaultAccountFor } from '@esmart/core/domain/paymentAccounts';
import { resolveRate, settlementGainLoss } from '@esmart/core/domain/fx';
import { availableAdvance } from '@esmart/core/domain/receivables';
import { INDIAN_STATES, PAYMENT_METHODS } from '@esmart/core/data/masters';
import { CURRENCIES } from '@esmart/core/lib/currencies';
import { TDS_SECTIONS, tdsSection } from '@esmart/core/data/tdsSections';
import { documentKindLabel, paymentMethodLabel } from '@esmart/core/labels';
import { formatMoney, formatPercent, toAmountInput } from '@esmart/core/lib/format';
import { daysBetween, formatDate, today } from '@esmart/core/lib/date';
import { Money, fromMajor, money, subtract, zero } from '@esmart/core/lib/money';
import { uid } from '@esmart/core/lib/id';
import { DEFAULT_ADVANCE_RATE, advanceInterState, advanceTaxSplit } from '@esmart/core/domain/advanceTax';
import { AdvanceGstBreakup } from './AdvanceGstBreakup';
import { ReceivedForSheet, customerValue, type ReceiptCarry } from '../receipts/ReceivedForSheet';
import { homeStateCode, taxAvailableOn, taxCategoriesOn } from '@esmart/core/domain/taxEngine';

import { useAppStore } from '../../store/appStore';
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
} from '../../store/selectors';
import { describeError } from '../../remote/errors';
import { adjustAdvancesFor, loadForAdvances, queryClient, useItemSearch, useOpenDocuments, usePartyRecord, usePartySearch, useServerAccountBalances } from '../../remote/queries';
import { useDebounced } from '../../components/useDebounced';
import { SHOW_SCROLLBAR, useBreakpoint } from '@esmart/ui/theme/breakpoints';
import { useGoBack } from '../../navigation/useGoBack';
import { inactiveChoice } from './accountChoice';
import { AddPartyButton, useAddParty } from '../contacts/AddPartyButton';


/** What settles a document besides cash. */
/** The desktop side column (summary, notes). */
const SIDE_WIDTH = 360;

type Adjustment = 'tdsDeducted' | 'discount' | 'writeOff';
const ADJUSTMENTS: Adjustment[] = ['tdsDeducted', 'discount', 'writeOff'];
/**
 * Recording a payment: money received from a customer (on the Receipts screen, where what it was
 * received for is the customer) or paid to a supplier. It applies the money to open documents, with
 * TDS, discount and write-off on each, adjusts advances held, and keeps what is left as an advance
 * (a service advance with its GST). Keyed by business where it is used: it seeds its method and
 * account from the business it opened in.
 *
 * `receipts`: opened from Receipts. "Received for" stands where the customer picker was, and picking
 * an account or a supplier there hands back to the receipt voucher form with what was typed.
 */
export function PaymentForm({
  direction,
  receipts,
}: {
  direction: PaymentDirection;
  receipts?: {
    partyId?: string;
    seed?: ReceiptCarry;
    onPickAccount: (picked: { key: string; label?: string }, carry: ReceiptCarry) => void;
  };
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['domain', 'sales', 'common', 'purchases', 'books']);
  const router = useRouter();
  const goBack = useGoBack();
  const toast = useToast();
  // Saved through the online save directly: a payment held for approval (RULES 6.14) is told apart
  // from a refusal, and the form then leaves for the approvals list instead of staying to be re-sent.
  const { save: saveOnce, saving, release: releaseSave } = useSaveOnline();
  const blocked = !useCanWrite();
  const insets = useSafeAreaInsets();
  // Always 'phone' in the native apps, so the desktop layout only ever reaches a browser.
  const breakpoint = useBreakpoint();
  const desktop = breakpoint !== 'phone';

  // `with`: debit notes raised on the invoice it was opened from, paid along with it.
  const params = useLocalSearchParams<{ partyId?: string; documentId?: string; advance?: string; with?: string }>();
  const withIds = (params.with ?? '').split(',').filter(Boolean);
  // Without the books (Free, Basic) a receipt is only ever a customer's: there is nothing else to pick.
  const books = useHasModule('books');

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
  const defaultBranchId = useDefaultBranchId();
  const activeCompanyId = useAppStore((s) => s.activeCompanyId);

  const seed = receipts?.seed;
  const [partyId, setPartyId] = useState<string | null>(receipts?.partyId ?? params.partyId ?? null);
  const [date, setDate] = useState(seed?.date ?? today());
  const [amountText, setAmountText] = useState(seed?.amount ?? '');
  // Start on UPI when there is an account for it, else cash (a cash-only business).
  // Money received defaults to the bank account the invoices print, where customers were told to pay.
  const preferredAccountId = direction === 'received' ? company?.bankDetails?.paymentAccountId : undefined;
  const [method, setMethod] = useState<PaymentMethod>(() => (defaultAccountFor('upi', accounts) ? 'upi' : 'cash'));
  // The account follows the method: a bank payment never defaults to cash in hand.
  const [pickedAccountId, setAccountId] = useState(() => defaultAccountFor(method, accounts, preferredAccountId)?.id ?? '');
  const methodAccounts = accountsForMethod(method, accounts);
  // Re-derived every render, so accounts that load (or change) later are picked up.
  const accountId = methodAccounts.some((a) => a.id === pickedAccountId)
    ? pickedAccountId
    : (defaultAccountFor(method, accounts, preferredAccountId)?.id ?? '');
  /** While the user has not typed an amount, it tracks what is ticked below. */
  const [amountFollows, setAmountFollows] = useState(!seed?.amount);
  const [reference, setReference] = useState(seed?.reference ?? '');
  const [notes, setNotes] = useState(seed?.notes ?? '');
  // An advance for services carries GST from the day it is received (s.13(2)).
  // Opened as "Advance receipt" from the menu: the switch starts on.
  const [serviceAdvance, setServiceAdvance] = useState(params.advance === '1');
  const [advanceTaxId, setAdvanceTaxId] = useState<string | undefined>();
  const [advancePos, setAdvancePos] = useState<string | undefined>();
  /** The service's SAC, and any cess on it (percent), for table 11 and the receipt voucher. */
  const [advanceSac, setAdvanceSac] = useState('');
  const [advanceCess, setAdvanceCess] = useState(0);
  const cessText = useDecimalText(advanceCess, setAdvanceCess);
  /** An advance receipt: the service it is for, picked from the company's services. */
  const [advanceItem, setAdvanceItem] = useState<{ id: string; name: string; taxCategoryId: string } | null>(null);
  const [serviceQuery, setServiceQuery] = useState('');
  /** TDS the customer deducted from an advance, before any invoice. */
  const [advanceTdsText, setAdvanceTdsText] = useState('');
  const [advanceSheet, setAdvanceSheet] = useState<'service' | 'taxMode' | 'tax' | 'pos' | 'tds' | null>(null);
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
  const entered = JSON.stringify([partyId, date, amountFollows ? null : amountText, reference, notes, advanceTdsText, serviceAdvance]);
  const [untouched] = useState(entered);
  /** Set by anything else the person changes: what is applied or adjusted, the method, the account, the TDS section. */
  const [touched, setTouched] = useState(false);
  // Handed over from the receipt form with an amount typed there: that is a change to lose too.
  const leaveGuard = useLeaveGuard(touched || entered !== untouched || !!seed?.amount);
  /** Back to the receipt voucher form for an account or a supplier, with what was typed here. */
  const pickAccount = async (picked: { key: string; label?: string }) => {
    if (!receipts) return;
    await leaveGuard.release();
    receipts.onPickAccount(picked, { amount: amountText || undefined, date, reference, notes });
  };

  // The party from the server, with the advance it holds; the store copy until it lands.
  const partyRecordQuery = usePartyRecord(partyId ?? undefined);
  const partyRecord = partyRecordQuery.data;
  const party = (partyRecord as unknown as (typeof parties)[number] | undefined) ?? parties.find((p) => p.id === partyId);
  // Opened for a contact (?partyId=) the device doesn't hold: a bar until it lands, not "Select customer".
  const partyPending = !!partyId && !party && partyRecordQuery.isLoading;
  const [partyQuery, setPartyQuery] = useState('');
  // On Receipts the Received for sheet does its own searching.
  const partySearch = usePartySearch(direction === 'received' ? 'customer' : 'supplier', useDebounced(partyQuery), partyOpen && !receipts);
  // The services an advance receipt can be for: active items of type service, searched by name, SKU or SAC.
  const serviceSearch = useItemSearch(useDebounced(serviceQuery), advanceSheet === 'service');
  const services = (serviceSearch.data ?? []).filter((i): i is typeof i & { id: string } => i.type === 'service' && !!i.id);
  // "Add new customer" (or supplier) under the picker: the contact saved there is the one this is for.
  const addParty = useAddParty(direction === 'received' ? 'customer' : 'supplier', (p) => pickParty(p.id));
  // Under Suppliers on a receipt: money from a supplier's ledger, as picking one there does.
  const addSupplierSource = useAddParty('supplier', (p) => void pickAccount({ key: `party:${p.id}`, label: p.name }));
  const pickParty = (id: string) => {
    setPartyId(id);
    setAllocations({});
    setRateOverride(null);
    setCurrencyChoice(null);
  };

  // A payment settles in the party's currency unless the user picks another, at
  // the rate effective on the payment date unless the user says otherwise.
  const currency = currencyChoice ?? party?.currency ?? baseCurrency;

  // Money in settles invoices, debit notes and opening invoices; money out, bills, supplier debit notes and opening bills. What each
  // still owes is the server's figure (returns and credit notes already off), in the payment currency, oldest first.
  // An advance receipt lists only the invoices whose every line is a service, not the ones with goods.
  const advanceReceipt = direction === 'received' && params.advance === '1';
  // A receipt goes in full to the invoices ticked: no advance is kept (that is an advance receipt's).
  const noAdvance = direction === 'received' && !advanceReceipt;
  // Record payment on an invoice: the amount goes to that invoice alone, so there is no Apply to list.
  // With debit notes raised on it, the list shows that invoice and those notes only, each ticked in full.
  const fromInvoice = direction === 'received' && !advanceReceipt && !!params.documentId && !withIds.length;
  const invoiceAndNotes = params.documentId && withIds.length ? [params.documentId, ...withIds] : undefined;
  const open = useOpenDocuments(partyId, direction === 'received' ? ['invoice', 'debitNote', 'openingInvoice'] : ['purchaseBill', 'supplierDebitNote', 'openingBill'], { servicesOnly: advanceReceipt });
  // Plain values: the React compiler memoizes them (a hand-written useMemo here it can't keep, lint fails).
  const asOf = today();
  const outstanding = (open.data ?? [])
    .filter((d) => d.grandTotal.currency === currency && (d.outstanding?.minor ?? 0) > 0)
    .filter((d) => !invoiceAndNotes || invoiceAndNotes.includes(d.id))
    .map((d) => ({
      document: { id: d.id, kind: d.kind, number: d.number, supplierDocNumber: d.supplierDocNumber, date: d.date, dueDate: d.dueDate, exchangeRate: d.exchangeRate ?? 1, tdsExpected: d.tdsExpected },
      outstanding: d.outstanding as Money,
      daysOverdue: d.dueDate ? daysBetween(d.dueDate, asOf) : 0,
    }))
    .sort((a, b) => a.document.date.localeCompare(b.document.date));

  const resolvedRate = currency === baseCurrency ? 1 : resolveRate(exchangeRates, currency, baseCurrency, date);
  const exchangeRate = rateOverride ?? resolvedRate;
  const rateText = useDecimalText(exchangeRate, setRateOverride);

  // Seed the allocation from the invoice we were opened from, on the first
  // render where that invoice is actually in the outstanding list.
  const prefill = params.documentId && !advanceReceipt ? outstanding.find((o) => o.document.id === params.documentId) : undefined;
  // TDS the customer was expected to deduct from an invoice (RULES 4.14): taken as deducted unless changed.
  const expectedTdsOf = (docId: string): number => {
    if (direction !== 'received') return 0;
    const o = outstanding.find((x) => x.document.id === docId);
    const e = o?.document.tdsExpected;
    return e && e.amount.currency === currency ? Math.min(e.amount.minor, o!.outstanding.minor) : 0;
  };
  if (prefill && !seeded) {
    setSeeded(true);
    // The invoice, and its debit notes when it came with them: each ticked at what it still owes.
    const ids = [prefill.document.id, ...withIds];
    const next: Record<string, string> = {};
    const tdsOf: Record<string, { tdsDeducted: string }> = {};
    let total = 0;
    for (const o of outstanding.filter((x) => ids.includes(x.document.id))) {
      const tds = expectedTdsOf(o.document.id);
      const cash = o.outstanding.minor - tds;
      next[o.document.id] = toAmountInput(money(cash, currency));
      if (tds) tdsOf[o.document.id] = { tdsDeducted: toAmountInput(money(tds, currency)) };
      total += cash;
    }
    setAllocations(next);
    if (Object.keys(tdsOf).length) setAdjustments(tdsOf);
    setAmountText(toAmountInput(money(total, currency)));
  }

  // Advances held against this party: what its earlier payments left unallocated, the only advance
  // Adjust can put on a document. The server's party advance also counts a credit note raised on its
  // own, which can't settle an invoice here, so it isn't offered. Read from the payments themselves,
  // loaded once the party is picked, so it also drops the moment an adjustment uses it.
  const storePayments = useAppStore((s) => s.payments);
  useEffect(() => {
    if (partyId) loadForAdvances(activeCompanyId, partyId, direction, []).catch(() => {});
  }, [activeCompanyId, partyId, direction]);
  const advance = availableAdvance(storePayments.filter((p) => p.companyId === activeCompanyId && p.partyId === partyId && p.direction === direction), currency);
  /** Adjust held advances against every open document, or just `docId`. */
  const [adjustingAdvance, setAdjustingAdvance] = useState(false);
  const adjustAdvance = async (docId?: string) => {
    if (!partyId || adjustingAdvance) return;
    setTouched(true);
    let applied: Money[];
    setAdjustingAdvance(true);
    try {
      // The server applies them, notes too, and a service advance's GST.
      applied = (await adjustAdvancesFor(partyId, direction, docId ? [docId] : undefined)).totals;
    } catch (err) {
      toast.show(describeError(err, tr), 'error');
      return;
    } finally {
      setAdjustingAdvance(false);
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
  const allocatedTotal = money(
    Object.values(allocations).reduce((acc, v) => acc + fromMajor(v || '0', currency).minor, 0),
    currency,
  );
  const unallocated = subtract(amount, allocatedTotal);
  // Each at its rate on the receipt's date: the server taxes the advance at that day's rate.
  const taxed = taxCategoriesOn(taxCategories, date).filter((c) => c.rate > 0 && taxAvailableOn(c, date));
  // An advance receipt for a service, with tax: the GST is worked back at that service's own rate on the
  // day; a service at 0% (nil rated, exempt) carries none. Otherwise the rate picked, or 18% when not known (RULES 8.12).
  const serviceCategory = advanceReceipt && advanceItem ? taxCategoriesOn(taxCategories, date).find((c) => c.id === advanceItem.taxCategoryId) : undefined;
  const advanceTaxCategory =
    advanceReceipt && advanceItem
      ? serviceCategory && serviceCategory.rate > 0 && taxAvailableOn(serviceCategory, date)
        ? serviceCategory
        : undefined
      : (taxed.find((c) => c.id === advanceTaxId) ?? taxed.find((c) => c.rate === DEFAULT_ADVANCE_RATE) ?? taxed[0]);
  // A place of supply not known is taken as another state: IGST, under "Other Territory" (97).
  const pos = advancePos ?? party?.billingAddress?.stateCode;
  const canAdvance = direction === 'received' && !noAdvance && unallocated.minor > 0 && !!company.taxRegistration?.registered && !!taxed.length;
  const sac = advanceSac.trim();
  // An HSN that isn't a SAC (99…) is goods, which carry no GST on an advance (notification 66/2017).
  const goodsSac = !!sac && !sac.startsWith('99');
  const advanceTds = direction === 'received' ? fromMajor(advanceTdsText || '0', currency) : zero(currency);
  const advanceTax =
    canAdvance && serviceAdvance && advanceTaxCategory && !goodsSac
      ? { taxCategoryId: advanceTaxCategory.id, rate: advanceTaxCategory.rate, placeOfSupplyStateCode: pos ?? '97', ...(sac && { hsn: sac }), ...(advanceCess > 0 && { cessRate: advanceCess }) }
      : null;
  const overAllocated = unallocated.minor < 0;
  /** A receipt with money left over: more than the ticked invoices owe, or not all of it applied. */
  const notApplied = noAdvance && unallocated.minor > 0;
  /** The advance as the summary states it: with tax, its value without the GST inside it (850 of 1,000), the GST below it. */
  const advanceShown =
    advanceTax && unallocated.minor > 0
      ? money(advanceTaxSplit(unallocated.minor + advanceTds.minor, advanceTax.rate, advanceCess, advanceInterState(homeStateCode(company), pos)).taxable, currency)
      : unallocated;

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

  const autoAllocate = () => {
    setTouched(true);
    setAllocations(spread(amount.minor));
  };

  const payFull = () => {
    setTouched(true);
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
    // An advance receipt goes on no invoice: all of the amount is the advance.
    if (advanceReceipt) return;
    // From an invoice, all of it is that invoice's.
    if (fromInvoice && params.documentId) {
      setAllocations({ [params.documentId]: v });
      return;
    }
    // A receipt fills the invoices oldest first, each in full, the last with what is left, and ticks
    // only those the amount reaches.
    if (noAdvance) {
      setAllocations(spread(fromMajor(v || '0', currency).minor));
      return;
    }
    // Keep the ticked documents, but re-fit them to the new amount so a
    // smaller (partial) amount never leaves the form over-allocated.
    const ticked = Object.keys(allocations);
    setAllocations(spread(fromMajor(v || '0', currency).minor, ticked.length ? ticked : undefined));
  };

  const toggleAllocation = (docId: string, owed: Money) => {
    setTouched(true);
    const next = { ...allocations };
    // The invoice's expected TDS settles that much without cash; the rest is what the cash applies.
    const tds = !(docId in next) && !adjustedOf(docId) ? expectedTdsOf(docId) : 0;
    if (tds) setAdjustments((a) => ({ ...a, [docId]: { ...a[docId], tdsDeducted: toAmountInput(money(tds, currency)) } }));
    const full = money(owed.minor - tds, currency);
    if (docId in next) {
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
    setTouched(true);
    const capped = fromMajor(v || '0', currency).minor > owed.minor ? toAmountInput(owed) : v;
    const next = { ...allocations, [docId]: capped };
    setAllocations(next);
    if (amountFollows) setAmountText(toAmountInput(money(sumOf(next), currency)));
  };

  const adjustedOf = (docId: string, a = adjustments) =>
    ADJUSTMENTS.reduce((acc, k) => acc + fromMajor(a[docId]?.[k] || '0', currency).minor, 0);

  /** An adjustment never takes a document past what it owes; the cash on it shrinks to fit. */
  const setAdjustment = (docId: string, key: Adjustment, v: string, owed: Money) => {
    setTouched(true);
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

  const fxGainLoss = (() => {
    if (currency === baseCurrency) return undefined;
    const rows = outstanding.filter((o) => o.document.id in allocations);
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
  })();

  // Money going out cannot exceed what the account holds, whether cash, bank or wallet.
  const account = accounts.find((a) => a.id === accountId);
  const balances = useServerAccountBalances();
  const balance = accountId ? balances?.[accountId] : undefined;
  const amountInBase = Math.round(amount.minor * (exchangeRate || 1));
  const shortfall = direction === 'paid' && balance !== undefined && amountInBase > balance;
  const balanceBlocks = shortfall && !!account;

  // A TDS section is needed for TDS kept back on money paid, and for TDS on an advance.
  const needsTdsSection = (keepsTds && direction === 'paid') || advanceTds.minor > 0;
  // From an invoice, never more than it still owes (less any TDS taken as deducted on it).
  const invoiceRow = fromInvoice ? outstanding.find((o) => o.document.id === params.documentId) : undefined;
  const invoiceRoom = invoiceRow ? invoiceRow.outstanding.minor - adjustedOf(invoiceRow.document.id) : 0;
  const overInvoice = !!invoiceRow && amount.minor > invoiceRoom;

  // A receipt may move no money when it only records TDS deducted, a discount or a write-off.
  const canSave =
    !!partyId &&
    // Not before the open documents are in: a failed list would otherwise save it all as an advance.
    open.isSuccess &&
    (amount.minor > 0 || (amount.minor === 0 && adjustedTotal > 0)) &&
    !overAllocated &&
    !notApplied &&
    !overInvoice &&
    !!accountId &&
    !balanceBlocks &&
    (!keepsTds || direction === 'received' || !!tdsSectionPicked) &&
    // TDS on an advance goes to a section's receivable (26AS); an advance for goods takes no GST.
    (advanceTds.minor === 0 || !!tdsSectionPicked) &&
    !(serviceAdvance && canAdvance && goodsSac) &&
    // An advance receipt names the service it is for.
    (!advanceReceipt || !!advanceItem);

  const save = async () => {
    if (!canSave || !partyId) return;

    const adj = (docId: string, key: Adjustment) => {
      const m = fromMajor(adjustments[docId]?.[key] || '0', currency);
      return m.minor > 0 ? m : undefined;
    };
    // An advance receipt carries no allocations, whatever was ticked before.
    const allocationRows: PaymentAllocation[] = outstanding
      .filter((o) => !advanceReceipt && o.document.id in allocations && fromMajor(allocations[o.document.id] || '0', currency).minor + adjustedOf(o.document.id) > 0)
      .map((o) => ({
        documentId: o.document.id,
        documentNumber: o.document.number,
        documentKind: o.document.kind,
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
      advanceItemId: advanceReceipt ? advanceItem?.id : undefined,
      advanceTds: advanceTds.minor > 0 ? advanceTds : undefined,
      tdsSection: keepsTds || advanceTds.minor > 0 ? tdsSectionPicked : undefined,
      notes: notes || undefined,
      attachmentIds: [],
      createdBy: '',
      createdAt: new Date().toISOString(),
    };

    // Busy until it has left for the payment: a second tap would record it again.
    const res = await saveOnce(() => savePayment(payment), { hold: true });
    // Another save from this screen is still running: this tap did nothing.
    if (!res) return;
    if (res.outcome === 'refused' && res.errorCode === 'PAYMENT_HELD') {
      // Not recorded but waiting for an owner or admin: shown where the requester can follow it, and the form
      // is not left open to send a second request.
      toast.show(tr('common:save.paymentHeld'), 'info', { icon: 'clipboard-clock-outline' });
      void queryClient.invalidateQueries({ queryKey: ['paymentRequests', activeCompanyId] });
      await leaveGuard.release();
      router.replace('/(app)/sales/approvals' as never);
      return;
    }
    if (res.outcome === 'refused') {
      toast.show(tr('common:save.refused', { reason: res.error }), 'error');
      return;
    }
    if (res.outcome === 'unreachable') {
      toast.show(tr('common:save.unreachable'), 'error');
      return;
    }
    if (!res.result) {
      releaseSave();
      toast.show(tr('sales:payment.noAccountForMethod'), 'error', { icon: 'bank-off-outline' });
      return;
    }
    toast.show(direction === 'received' ? tr('sales:payment.recorded') : tr('sales:payment.made'), 'success', {
      icon: direction === 'received' ? 'cash-check' : 'cash-fast',
      // A template literal, so the compiler knows it is a plain string and not a handle on the party.
      detail: `${formatMoney(amount)}${party ? ` · ${party.name}` : ''}`,
    });
    await leaveGuard.release();
    router.replace(`/(app)/payments/${res.id ?? res.result}`);
  };
  useSaveShortcut(() => void save(), !saving && canSave);

  // Every block is built once and placed twice: stacked in one column on a
  // phone, grouped into cards across two columns on a desktop browser.
  // A desktop: the customer or supplier across the form's width, as on the invoice (PartyPickerBox).
  // On Receipts the customer is what the money was received for, picked with the accounts and suppliers.
  const partyLabel = receipts ? tr('books:receipts.source') : tr(direction === 'received' ? 'common:table.customer' : 'common:table.supplier');
  const pickPartyTitle = receipts
    ? tr(books ? 'books:receipts.pickSource' : 'books:receipts.pickCustomer')
    : tr(direction === 'received' ? 'sales:editor.selectCustomer' : 'sales:editor.selectSupplier');
  const partyCard = desktop ? (
    <PartyPickerBox
      label={partyLabel}
      party={party ?? undefined}
      pending={partyPending}
      emptyTitle={pickPartyTitle}
      accessibilityLabel={tr('sales:payment.selectContact')}
      onPress={() => setPartyOpen(true)}
      badges={party && open.isSuccess ? <Badge label={tr(advanceReceipt ? 'sales:payment.openServiceDocuments' : 'sales:payment.openDocuments', { count: outstanding.length })} tone={outstanding.length ? 'warning' : 'neutral'} size="sm" /> : null}
    />
  ) : (
    <Pressable onPress={() => setPartyOpen(true)} accessibilityRole="button" accessibilityLabel={tr('sales:payment.selectContact')}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        {partyPending ? (
          <>
            <Skeleton height={42} width={42} radius={21} />
            <View style={{ flex: 1 }}>
              <Skeleton height={14} width={160} radius={4} />
            </View>
          </>
        ) : party ? (
          <>
            <Avatar name={party.name} size={42} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" weight="600">
                {party.name}
              </Text>
              {open.isSuccess ? (
                <Text variant="caption" tone="muted">
                  {tr(advanceReceipt ? 'sales:payment.openServiceDocuments' : 'sales:payment.openDocuments', { count: outstanding.length })}
                </Text>
              ) : null}
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
              {pickPartyTitle}
            </Text>
          </>
        )}
        <Icon name="chevron-right" size={20} color={t.c.muted} />
      </Card>
    </Pressable>
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
      error={overInvoice ? tr('sales:payment.overInvoice', { amount: formatMoney(money(invoiceRoom, currency)) }) : undefined}
    />
  );

  const dateField = <DateField label={tr('sales:payment.date')} value={date} onChange={setDate} required />;
  // An advance receipt is for one of the company's services: required, and its SAC and GST rate fill the tax fields.
  const serviceField = advanceReceipt ? (
    <>
      <PickerField
        label={tr('sales:payment.advanceService')}
        value={advanceItem?.name}
        placeholder={tr('sales:payment.advanceServicePick')}
        onPress={() => setAdvanceSheet('service')}
        icon="briefcase-outline"
        required
      />
      <SelectSheet
        visible={advanceSheet === 'service'}
        onClose={() => setAdvanceSheet(null)}
        title={tr('sales:payment.advanceService')}
        options={services.map((i) => ({ value: i.id, label: i.name, trailing: i.hsnCode || undefined }))}
        value={advanceItem?.id}
        onQueryChange={setServiceQuery}
        loading={serviceSearch.isFetching}
        onSelect={(id) => {
          const picked = services.find((i) => i.id === id);
          if (!picked) return;
          setAdvanceItem({ id: picked.id, name: picked.name, taxCategoryId: picked.taxCategoryId });
          if (picked.hsnCode?.startsWith('99')) setAdvanceSac(picked.hsnCode.slice(0, 8));
        }}
      />
    </>
  ) : null;

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

  // Earlier advances to adjust: on money paid only. A receipt keeps none and an advance receipt is one.
  const advanceCard =
    direction === 'paid' && partyId && advance.minor > 0 && outstanding.length > 0 ? (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        <Icon name="wallet-outline" size={22} color={t.c.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="small" weight="600">{tr('sales:payment.advanceAvailable', { amount: formatMoney(advance) })}</Text>
          <Text variant="caption" tone="muted">{tr('sales:payment.advanceAvailableHint')}</Text>
        </View>
        <Button title={tr('sales:payment.adjustAdvance')} onPress={() => void adjustAdvance()} size="sm" variant="secondary" loading={adjustingAdvance} disabled={adjustingAdvance} />
      </Card>
    ) : null;

  // A full-height target each, not just the words.
  const linkStyle = { minHeight: 44, justifyContent: 'center' as const, paddingHorizontal: 4 };
  const allocationLinks = (
    <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
      <Pressable onPress={autoAllocate} accessibilityRole="button" accessibilityLabel={tr('sales:payment.autoAllocate')} style={linkStyle}>
        <Text variant="caption" tone="primary" weight="600">{tr('sales:payment.autoAllocateShort')}</Text>
      </Pressable>
      <Pressable onPress={payFull} accessibilityRole="button" accessibilityLabel={direction === 'received' ? tr('sales:payment.settleAll') : tr('sales:payment.payEverything')} style={linkStyle}>
        <Text variant="caption" tone="primary" weight="600">{direction === 'received' ? tr('sales:payment.settleAll') : tr('sales:payment.payAll')}</Text>
      </Pressable>
    </View>
  );

  /** What the document is, the supplier's own number for a bill, its date and when it falls due (if it does). */
  const docMeta = (o: (typeof outstanding)[number]) =>
    [
      documentKindLabel(tr, o.document.kind, 1),
      o.document.supplierDocNumber ? tr('sales:payment.supplierRef', { number: o.document.supplierDocNumber }) : '',
      formatDate(o.document.date, 'dd MMM'),
      o.document.dueDate ? tr('sales:detail.dueOn', { date: formatDate(o.document.dueDate, 'dd MMM') }) : tr('sales:payment.noDueDate'),
    ]
      .filter(Boolean)
      .join(' · ');
  const adjustmentKeys = ADJUSTMENTS.filter((k) => k !== 'writeOff' || (canWriteOff && direction === 'received'));

  const openDocuments = !partyId ? (
    <EmptyState icon="account-search-outline" title={tr('sales:payment.pickContact')} compact />
  ) : open.isLoading ? (
    <CardRowsSkeleton />
  ) : open.isError ? (
    // Not "nothing outstanding": the list didn't load, so nothing can be said about it.
    <EmptyState
      icon="cloud-off-outline"
      title={tr('sales:payment.openFailed')}
      message={tr('common:documentList.loadFailedBody')}
      actionLabel={tr('common:action.retry')}
      onAction={() => void open.refetch()}
      compact
    />
  ) : outstanding.length === 0 ? (
    <EmptyState
      illustration="all-settled"
      icon="check-all"
      title={tr(advanceReceipt ? 'sales:payment.nothingOutstandingServices' : 'sales:payment.nothingOutstanding')}
      message={tr(advanceReceipt ? 'sales:payment.advanceReceiptHint' : noAdvance ? 'sales:payment.noInvoicesHint' : 'sales:payment.advanceHint')}
      compact
    />
  ) : (
    <>
      {desktop ? (
        // A desktop lays the documents out as a table: what, owed, and what this payment applies.
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            minHeight: 34,
            paddingHorizontal: t.spacing.lg,
            backgroundColor: t.c.card2,
            borderBottomWidth: 1,
            borderBottomColor: t.c.line,
          }}
        >
          <View style={{ width: 21 }} />
          {[
            { label: tr('common:table.number'), style: { flex: 1 } },
            { label: tr('common:table.outstanding'), style: { width: 140, textAlign: 'right' as const } },
            { label: '', style: { width: 180 } },
          ].map((h, hi) => (
            <Text key={hi} variant="micro" tone="muted" weight="700" numberOfLines={1} style={{ textTransform: 'uppercase', letterSpacing: 0.6, ...h.style }}>
              {h.label}
            </Text>
          ))}
        </View>
      ) : null}
      {outstanding.map((o, i) => {
        const selected = o.document.id in allocations;
        const number = o.document.number;
        const applyingField = selected ? (
          <AmountField
            value={allocations[o.document.id]}
            onChangeValue={(v) => setRowAllocation(o.document.id, v, money(o.outstanding.minor - adjustedOf(o.document.id), currency))}
            currency={currency}
            // Names the document, so a screen reader can tell one row's field from the next.
            label={tr('sales:payment.applyingTo', { number })}
          />
        ) : null;
        const toggle = (
          <Pressable
            onPress={() => toggleAllocation(o.document.id, o.outstanding)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={tr('sales:payment.allocateTo', { number })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, minHeight: 44, ...(desktop ? { flex: 1 } : null) }}
          >
            <Icon name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'} size={21} color={selected ? t.c.primary : t.c.muted} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" weight="600">
                {number}
              </Text>
              <Text variant="caption" tone="muted">
                {docMeta(o)}
              </Text>
            </View>
            {desktop ? null : (
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text variant="small" weight="700">
                  {formatMoney(o.outstanding)}
                </Text>
                {o.daysOverdue > 0 ? <Badge label={tr('sales:payment.daysLate', { days: o.daysOverdue })} tone="danger" size="sm" /> : null}
              </View>
            )}
          </Pressable>
        );
        const adjustFields =
          selected && (adjusting === o.document.id || adjustedOf(o.document.id) > 0)
            ? adjustmentKeys.map((k) => (
                <AmountField
                  key={k}
                  value={adjustments[o.document.id]?.[k] ?? ''}
                  onChangeValue={(v) => setAdjustment(o.document.id, k, v, o.outstanding)}
                  currency={currency}
                  label={tr('sales:payment.adjustmentOn', { label: tr(`sales:payment.adjustment.${k}`), number })}
                  hint={tr(`sales:payment.adjustmentHint.${k}`)}
                />
              ))
            : null;
        return (
          <View
            key={o.document.id}
            style={{
              paddingHorizontal: t.spacing.lg,
              paddingVertical: desktop ? t.spacing.sm : t.spacing.md,
              borderBottomWidth: i < outstanding.length - 1 ? 0.5 : 0,
              borderBottomColor: t.c.line,
              gap: t.spacing.xs,
            }}
          >
            {desktop ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                {toggle}
                <View style={{ width: 140, alignItems: 'flex-end', gap: 3 }}>
                  <Text variant="small" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
                    {formatMoney(o.outstanding)}
                  </Text>
                  {o.daysOverdue > 0 ? <Badge label={tr('sales:payment.daysLate', { days: o.daysOverdue })} tone="danger" size="sm" /> : null}
                </View>
                <View style={{ width: 180 }}>{applyingField}</View>
              </View>
            ) : (
              <>
                {toggle}
                {applyingField}
              </>
            )}

            {!noAdvance && advance.minor > 0 ? (
              <Pressable
                onPress={() => void adjustAdvance(o.document.id)}
                disabled={adjustingAdvance}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 33, minHeight: 44, alignSelf: 'flex-start' }}
              >
                <Icon name="wallet-outline" size={15} color={t.c.primary} />
                <Text variant="caption" tone="primary" weight="600">
                  {tr('sales:payment.useAdvanceHere', {
                    amount: formatMoney(money(Math.min(advance.minor, o.outstanding.minor), currency)),
                  })}
                </Text>
              </Pressable>
            ) : null}

            {selected && adjusting !== o.document.id && adjustedOf(o.document.id) === 0 ? (
              <Pressable
                onPress={() => setAdjusting(o.document.id)}
                accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 33, minHeight: 44, alignSelf: 'flex-start' }}
              >
                <Icon name="tune-variant" size={15} color={t.c.primary} />
                <Text variant="caption" tone="primary" weight="600">
                  {tr(direction === 'received' ? 'sales:payment.adjustReceived' : 'sales:payment.adjustPaid')}
                </Text>
              </Pressable>
            ) : null}

            {/* Side by side on a desktop rather than three page-wide fields. */}
            {adjustFields ? desktop ? <View style={{ marginLeft: 33 }}><FieldRow>{adjustFields}</FieldRow></View> : adjustFields : null}
          </View>
        );
      })}
    </>
  );

  const summaryRows = (
    <>
      {[
        { label: tr('sales:payment.paymentAmount'), value: formatMoney(amount) },
        // An advance receipt goes on no invoice: nothing is allocated, so no line for it.
        ...(advanceReceipt ? [] : [{ label: tr('sales:payment.allocated'), value: formatMoney(allocatedTotal) }]),
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
        <Text variant="body" weight="700" tone={overAllocated || notApplied ? 'bad' : 'default'}>
          {overAllocated ? tr('sales:payment.overAllocatedBy') : noAdvance ? tr('sales:payment.notApplied') : advanceReceipt ? tr('sales:payment.advanceLine') : tr('sales:payment.unallocatedAdvance')}
        </Text>
        <Text variant="body" weight="700" tone={overAllocated || notApplied ? 'bad' : unallocated.minor > 0 ? 'warn' : 'good'}>
          {formatMoney(overAllocated ? money(-unallocated.minor, currency) : advanceShown)}
        </Text>
      </View>
      {notApplied ? (
        <Text variant="caption" tone="bad">
          {tr('sales:payment.notAppliedHint')}
        </Text>
      ) : null}
      {/* A service advance: the GST inside it, line by line, as it is owed when received. */}
      {advanceTax && unallocated.minor > 0 ? (
        <AdvanceGstBreakup gross={money(unallocated.minor + advanceTds.minor, currency)} rate={advanceTax.rate} cessRate={advanceCess} placeOfSupply={pos} company={company} baseCurrency={baseCurrency} exchangeRate={exchangeRate} tds={advanceTds} style={{ paddingLeft: t.spacing.md, marginTop: 2 }} />
      ) : null}
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

  // TDS and the GST on a service advance: in the notes column on a phone, a card of their own in the
  // main column on a desktop, where the side column is too narrow for fields side by side.
  const hasTaxFields = (direction === 'received' && !noAdvance && unallocated.minor > 0) || keepsTds || advanceTds.minor > 0 || canAdvance;
  const taxFields = (
    <>
      {/* The TDS amount and its section share a row on a desktop; either alone takes the row. */}
      <FieldGrid
        items={[
          direction === 'received' && !noAdvance && unallocated.minor > 0 ? (
            <AmountField
              label={tr('sales:payment.advanceTds')}
              value={advanceTdsText}
              onChangeValue={setAdvanceTdsText}
              currency={currency}
              hint={tr('sales:payment.advanceTdsHint')}
            />
          ) : null,
          keepsTds || advanceTds.minor > 0 ? (
            <PickerField
              label={tr('sales:payment.tdsSection')}
              value={tdsSectionPicked ? `${tdsSection(tdsSectionPicked)?.label ?? tdsSectionPicked} · ${tdsSection(tdsSectionPicked)?.nature ?? ''}` : undefined}
              placeholder={tr('sales:payment.tdsSectionPick')}
              onPress={() => setAdvanceSheet('tds')}
              icon="percent-outline"
              hint={tr('sales:payment.tdsSectionHint')}
              required={needsTdsSection}
              // Said here rather than leaving Save greyed out with no reason.
              error={needsTdsSection && !tdsSectionPicked ? tr('sales:payment.tdsSectionRequired') : undefined}
            />
          ) : null,
        ]}
      />
      {keepsTds || advanceTds.minor > 0 ? (
        <>
          <SelectSheet
            visible={advanceSheet === 'tds'}
            onClose={() => setAdvanceSheet(null)}
            title={tr('sales:payment.tdsSection')}
            options={TDS_SECTIONS.map((s) => ({ value: s.code, label: s.label, description: s.nature }))}
            value={tdsSectionPicked}
            onSelect={(v) => {
              setTouched(true);
              setTdsSectionChoice(v);
            }}
          />
        </>
      ) : null}
      {canAdvance ? (
        <>
          {/* With tax: the GST is inside the amount, and the advance is its value without it. Without tax: all of it. */}
          <PickerField
            label={tr('sales:payment.advanceTaxMode')}
            value={tr(serviceAdvance ? 'sales:payment.withTax' : 'sales:payment.withoutTax')}
            onPress={() => setAdvanceSheet('taxMode')}
            icon="percent-outline"
            hint={tr('sales:payment.serviceAdvanceHint')}
          />
          <SelectSheet
            visible={advanceSheet === 'taxMode'}
            onClose={() => setAdvanceSheet(null)}
            title={tr('sales:payment.advanceTaxMode')}
            options={[
              { value: 'with', label: tr('sales:payment.withTax') },
              { value: 'without', label: tr('sales:payment.withoutTax') },
            ]}
            value={serviceAdvance ? 'with' : 'without'}
            onSelect={(v) => setServiceAdvance(v === 'with')}
            searchable={false}
          />
          {serviceAdvance ? (
            <>
              <FieldRow>
                {/* The service's own rate once one is picked: shown, not changed here. */}
                <PickerField
                  label={tr('sales:payment.advanceRate')}
                  value={advanceTaxCategory?.name ?? (advanceItem ? formatPercent(0) : undefined)}
                  onPress={() => setAdvanceSheet('tax')}
                  icon="percent-outline"
                  disabled={advanceReceipt && !!advanceItem}
                  hint={advanceReceipt && advanceItem ? tr('sales:payment.advanceRateFromService', { name: advanceItem.name }) : undefined}
                />
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
          <SelectSheet visible={advanceSheet === 'tax'} onClose={() => setAdvanceSheet(null)} title={tr('sales:payment.advanceRate')} options={taxed.map((c) => ({ value: c.id, label: c.name }))} value={advanceTaxCategory?.id} onSelect={setAdvanceTaxId} searchable={false} />
          <SelectSheet visible={advanceSheet === 'pos'} onClose={() => setAdvanceSheet(null)} title={tr('sales:editor.placeOfSupply')} options={INDIAN_STATES.map((st) => ({ value: st.code, label: st.name }))} value={pos} onSelect={setAdvancePos} />
        </>
      ) : null}
    </>
  );
  const notesInput = <TextField label={tr('sales:payment.notes')} value={notes} onChangeText={setNotes} placeholder={tr('sales:payment.notesPlaceholder')} multiline />;
  const notesField = (
    <>
      {taxFields}
      {notesInput}
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
      {serviceField}
      {dateField}
      {currencyField}
      {methodField}
      {accountField}
      {addAccountLink}
      {referenceField}
      {rateField}
      {advanceCard}

      {/* Allocation: none on an advance receipt, which is the customer and the amount alone. */}
      {advanceReceipt || fromInvoice ? null : (
        <View style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{tr('sales:payment.applyTo')}</Text>
            {allocationLinks}
          </View>

          <Card padded={false}>{openDocuments}</Card>
        </View>
      )}

      {/* Allocation summary */}
      <Card style={{ gap: t.spacing.sm }}>{summaryRows}</Card>

      {notesField}
    </ScrollView>
  );

  const details = (
    <FormSection title={tr('sales:payment.details')}>
      {/* Who across the top, as on the invoice; the amount, date and the rest two to a row below. */}
      {partyCard}
      <FieldGrid items={[amountField(), serviceField, dateField, methodField, accountField, currencyField, referenceField, rateField]} />
      {addAccountLink}
    </FormSection>
  );
  // An advance receipt is the customer and the amount alone: no invoices to apply it to.
  const allocation = advanceReceipt || fromInvoice ? null : (
    <FormSection title={tr('sales:payment.applyTo')} action={allocationLinks}>
      <View style={{ borderWidth: 1, borderColor: t.c.line, borderRadius: t.radius.md, overflow: 'hidden' }}>{openDocuments}</View>
    </FormSection>
  );
  const summary = (
    <FormSection title={tr('sales:payment.summary')}>
      <View style={{ gap: t.spacing.sm }}>{summaryRows}</View>
    </FormSection>
  );
  const taxSection = hasTaxFields ? (
    <FormSection title={tr('purchases:form.tax')}>
      <View style={{ gap: t.spacing.lg }}>{taxFields}</View>
    </FormSection>
  ) : null;
  // Notes sit beside the summary so the documents to apply the payment to stay high on the page.
  const notesCard = <Card>{notesInput}</Card>;

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
          {taxSection}
          {summary}
          {notesCard}
        </View>
      ) : (
        <SplitPane
          sideWidth={SIDE_WIDTH}
          main={
            <View style={{ gap: t.spacing.lg }}>
              {details}
              {advanceCard}
              {allocation}
              {taxSection}
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
      {/* A wide desktop lays the form and its side column across the page's full column, so they end
          level with the page header; a narrow one (icon-only sidebar) stacks it in the wide form width. */}
      <FormContainer wide style={breakpoint === 'desktop' || breakpoint === 'wide' ? { maxWidth: '100%' } : undefined}>
        <Stack.Screen options={{ title: direction === 'received' ? (params.advance === '1' ? tr('sales:payment.advanceReceipt') : receipts ? tr('books:receipts.new') : tr('common:quickAction.receivePayment')) : tr('sales:payment.makePayment') }} />

        {desktop ? desktopForm : phoneForm}

        {desktop ? (
          <FormActions>
            <Button title={tr('common:action.cancel')} variant="ghost" onPress={() => goBack(direction === 'received' ? '/(app)/receipts' : '/(app)/payments/made')} />
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

        {receipts ? (
          <ReceivedForSheet
            visible={partyOpen}
            onClose={() => setPartyOpen(false)}
            value={partyId ? customerValue(partyId) : undefined}
            onPick={(picked) => {
              if (picked.kind === 'account') {
                void pickAccount(picked);
                return;
              }
              pickParty(picked.partyId);
            }}
            onAdd={(kind) => (kind === 'supplier' ? addSupplierSource : addParty)(() => setPartyOpen(false))}
          />
        ) : (
          <SelectSheet
            visible={partyOpen}
            onClose={() => setPartyOpen(false)}
            title={tr(direction === 'received' ? 'sales:editor.selectCustomer' : 'sales:editor.selectSupplier')}
            options={(partySearch.data ?? []).map((p) => ({ value: p.id!, label: p.name!, description: p.phone ?? p.email ?? p.code }))}
            onQueryChange={setPartyQuery}
            loading={partySearch.isFetching}
            value={partyId}
            onSelect={pickParty}
            footer={<AddPartyButton kind={direction === 'received' ? 'customer' : 'supplier'} onPress={() => addParty(() => setPartyOpen(false))} />}
          />
        )}
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
            setTouched(true);
            setMethod(v as PaymentMethod);
            setAccountId((current) => accountIdAfterMethodChange(v as PaymentMethod, current, accounts, preferredAccountId));
          }}
          searchable={false}
        />
        <SelectSheet
          visible={accountOpen}
          onClose={() => setAccountOpen(false)}
          title={direction === 'received' ? tr('sales:payment.depositInto') : tr('sales:payment.payFrom')}
          options={methodAccounts.map((a) => ({ value: a.id, label: a.name, description: a.accountNumber ?? a.type, ...inactiveChoice(tr, a) }))}
          value={accountId}
          onSelect={(v) => {
            setTouched(true);
            setAccountId(v);
          }}
          searchable={false}
        />
        {leaveGuard.dialog}
      </FormContainer>
    </KeyboardAvoidingView>
  );
}
