import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { FieldRow, FormContainer, SplitPane } from '@esmart/ui/components/Layout';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Stepper } from '@esmart/ui/components/Stepper';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { TotalsPanel } from '@esmart/ui/components/TotalsPanel';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast } from '@esmart/ui/components/Toast';
import { AmountField, PickerField, QuantityStepper, Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Avatar } from '@esmart/ui/components/Avatar';

import { DocumentKind, DocumentLine, Party } from '@esmart/core/types';
import { documentKindLabel } from '@esmart/core/labels';
import { resolveRate } from '@esmart/core/domain/fx';
import { buildTaxContext } from '@esmart/core/domain/taxEngine';
import { OTHER_COUNTRY_CODE } from '@esmart/core/domain/stateCodes';
import { CURRENCIES } from '@esmart/core/lib/currencies';
import { formatMoney, formatPercent, formatQty } from '@esmart/core/lib/format';
import { addDaysISO, formatDate } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import { factorOf, fromMajor, money, subtract, toMajor } from '@esmart/core/lib/money';
import { INDIAN_STATES, unitDecimals } from '@esmart/core/data/masters';
import { checkCreditLimit } from '@esmart/core/domain/receivables';
import { OUTBOUND_KINDS, isLowStock, stockMap, stockShortfalls } from '@esmart/core/domain/stockLedger';
import { calculateLine } from '@esmart/core/domain/lineCalc';
import { hsnMandatory, validHsn } from '@esmart/core/lib/validators';

import { useAppStore } from '../../store/appStore';
import {
  useActiveCompany,
  useBaseCurrency,
  useBranches,
  useDocuments,
  useExchangeRates,
  useHasModule,
  useItems,
  useParties,
  usePayments,
  usePrimaryBranchId,
  useStockMovements,
  useTaxCategories,
} from '../../store/selectors';
import {
  DraftState,
  blankLine,
  emptyDraft,
  lineFromItem,
  useDocumentDraft,
} from './useDocumentDraft';
import { LineEditorSheet } from './LineEditorSheet';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';

/** Editor step keys, in order. Names live in `common:editorStep.*`. */
const STEPS = ['party', 'items', 'extras', 'review'] as const;

const PURCHASE_KINDS: DocumentKind[] = ['purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn'];

/** The finalise shortcut as a Mac or a PC writes it; only a browser ever shows it. */
const SHORTCUT_KEYS =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '') ? '⌘ + Enter' : 'Ctrl + Enter';

export function DocumentEditor({
  kind,
  documentId,
  initialDraft,
  prefill,
  onSaved,
}: {
  kind: DocumentKind;
  documentId?: string;
  initialDraft?: DraftState;
  /** Party and/or one item line to start from (Siri / Shortcuts, "Sell"/"Buy" on an item). */
  prefill?: {
    partyId?: string;
    itemId?: string;
    quantity?: number;
    /** From a scanned bill: its date, the supplier's number and the lines read off it. */
    date?: string;
    supplierDocNumber?: string;
    lines?: { name: string; quantity: number; unitPrice: number }[];
  };
  onSaved?: (id: string) => void;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'sales']);
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();

  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const hasFx = useHasModule('fx');
  const branches = useBranches();
  const taxCategories = useTaxCategories();
  const exchangeRates = useExchangeRates();
  const isPurchase = PURCHASE_KINDS.includes(kind);
  const parties = useParties(isPurchase ? 'supplier' : 'customer');
  const items = useItems({ activeOnly: true });
  const allItems = useItems();
  const movements = useStockMovements();
  const primaryBranchId = usePrimaryBranchId();
  const documents = useDocuments();
  const payments = usePayments();
  const hsnRequired = hsnMandatory(company?.taxRegistration);
  const isReturn = kind === 'salesReturn' || kind === 'purchaseReturn';
  // Tax documents carry HSN/SAC per line; quotes and orders do not have to.
  const needsHsn = hsnRequired && (kind === 'invoice' || kind === 'purchaseBill' || isReturn);

  const createDocument = useAppStore((s) => s.createDocument);
  const updateDocument = useAppStore((s) => s.updateDocument);
  const setDocumentStatus = useAppStore((s) => s.setDocumentStatus);
  const nextNumberFor = useAppStore((s) => s.nextNumberFor);
  const activeBranchId = useAppStore((s) => s.activeBranchId);

  const taxContext = useMemo(
    () => ({
      regime: company?.taxRegistration?.regime ?? ('NONE' as const),
      homeStateCode: company?.taxRegistration?.placeOfSupplyStateCode,
      placeOfSupplyStateCode: company?.taxRegistration?.placeOfSupplyStateCode,
      registered: !!company?.taxRegistration?.registered,
    }),
    [company],
  );

  /** What choosing a party sets on the draft; shared by the picker and `prefill`. */
  const partyFields = (p: Party, date: string, dueDate?: string): Partial<DraftState> => ({
    partyId: p.id,
    // A party synced from an older API can arrive without an address.
    placeOfSupplyStateCode: p.billingAddress?.stateCode,
    currency: p.currency,
    exchangeRate: p.currency === baseCurrency ? 1 : resolveRate(exchangeRates, p.currency, baseCurrency, date),
    dueDate: kind === 'invoice' || kind === 'purchaseBill' ? addDaysISO(date, p.paymentTermsDays) : dueDate,
  });

  // A prefill seeds the draft and the opening step, as if the person had
  // picked the party and item by hand. Read once, like `initialDraft`.
  const [seed] = useState(() => {
    const empty: DraftState = { ...emptyDraft(baseCurrency, kind), branchId: primaryBranchId };
    if (!prefill) return { missingParty: false, draft: empty, step: 0 };
    const base: DraftState = {
      ...empty,
      date: prefill.date ?? empty.date,
      supplierDocNumber: prefill.supplierDocNumber ?? empty.supplierDocNumber,
    };
    const p = prefill.partyId ? parties.find((x) => x.id === prefill.partyId) : undefined;
    const item = prefill.itemId ? items.find((i) => i.id === prefill.itemId) : undefined;
    const scanned = (prefill.lines ?? []).map((l) => ({
      ...blankLine(p?.currency ?? baseCurrency, taxCategories),
      name: l.name,
      quantity: l.quantity,
      unitPrice: fromMajor(String(l.unitPrice), p?.currency ?? baseCurrency),
    }));
    const lines = item
      ? [{ ...lineFromItem(item, isPurchase, taxCategories), quantity: prefill.quantity ?? 1 }]
      : scanned;
    // Without a party (e.g. "Sell" from an item) the line is ready and the party step stays open.
    if (!p) return { missingParty: !!prefill.partyId, draft: { ...base, lines }, step: 0 };
    return {
      missingParty: false,
      draft: { ...base, ...partyFields(p, base.date, base.dueDate), lines },
      step: STEPS.indexOf(item ? 'review' : 'items'),
    };
  });

  // Party and place of supply decide export / SEZ / import treatment (IGST, or none under LUT).
  const draftTaxContext = useCallback(
    (d: DraftState) =>
      buildTaxContext(company, {
        placeOfSupply: d.placeOfSupplyStateCode,
        party: parties.find((p) => p.id === d.partyId),
        date: d.date,
        purchase: isPurchase,
      }),
    [company, parties, isPurchase],
  );

  const { draft, patch, addLine, updateLine, removeLine, setCurrency, totals } = useDocumentDraft({
    kind,
    baseCurrency,
    taxCategories,
    taxContext: draftTaxContext,
    initial: initialDraft ?? seed?.draft,
  });

  const [step, setStep] = useState(seed?.step ?? 0);
  const [partyOpen, setPartyOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<DocumentLine | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [creditWarning, setCreditWarning] = useState<string | null>(null);
  // Set once the user accepts the credit-limit warning, so the server lets the invoice through.
  const [creditOverride, setCreditOverride] = useState(false);
  const [chargesText, setChargesText] = useState(String(toMajor(draft.charges) || ''));
  const [discountText, setDiscountText] = useState(String(draft.documentDiscountValue || ''));
  const [roundOffText, setRoundOffText] = useState(
    draft.roundOffManual ? String(toMajor(draft.roundOffManual)) : '',
  );
  // A manual round-off is a small correction, not a discount: keep it under one whole unit.
  const roundOffError =
    draft.applyRoundOff && draft.roundOffManual && Math.abs(draft.roundOffManual.minor) >= factorOf(draft.currency)
      ? tr('sales:editor.roundOffTooLarge', { amount: formatMoney(money(factorOf(draft.currency), draft.currency)) })
      : undefined;

  const kindName = documentKindLabel(tr, kind, 1);
  const party = parties.find((p) => p.id === draft.partyId);
  const branchId = draft.branchId ?? primaryBranchId ?? activeBranchId ?? undefined;
  const branch = branches.find((b) => b.id === branchId);
  // A return is raised against one invoice/bill: only its lines, up to the quantities it carried.
  const sourceDoc = isReturn && draft.sourceDocumentId ? documents.find((d) => d.id === draft.sourceDocumentId) : undefined;
  // What this one was made from (the PO behind a goods receipt, say): it can't be dated before that.
  const madeFrom = draft.sourceDocumentId ? documents.find((d) => d.id === draft.sourceDocumentId) : undefined;
  const dateBeforeSource =
    madeFrom && draft.date < madeFrom.date
      ? tr('sales:editor.dateBeforeSource', {
          date: formatDate(madeFrom.date),
          kind: documentKindLabel(tr, madeFrom.kind, 1),
          number: madeFrom.number,
        })
      : undefined;
  const editingIsNew = !!editingLine && !draft.lines.some((l) => l.id === editingLine.id);

  // The item list shows stock at this branch when finalising this document moves
  // stock: not for a quote or an order, nor an invoice whose stock already left
  // with the delivery it came from.
  const movesStock =
    ['invoice', 'delivery', 'goodsReceipt', 'purchaseBill', 'salesReturn', 'purchaseReturn'].includes(kind) &&
    !(draft.sourceDocumentId && movements.some((m) => m.referenceId === draft.sourceDocumentId));
  const stockByItem = itemOpen && movesStock ? stockMap(movements, branchId) : undefined;
  const stockNote = (item: (typeof items)[number]) => {
    if (!stockByItem || !item.trackInventory || item.type !== 'goods') return undefined;
    const qty = stockByItem[item.id] ?? 0;
    if (qty <= 0) return { text: tr('sales:editor.itemOutOfStock'), tone: 'bad' as const };
    const args = { qty: formatQty(qty), unit: item.unit };
    return isLowStock(item, qty)
      ? { text: tr('sales:editor.itemLowStock', args), tone: 'warn' as const }
      : { text: tr('sales:editor.itemInStock', args), tone: 'good' as const };
  };
  // Where finalising would refuse it anyway (stock goes out, negative stock
  // not allowed), an item with nothing on hand can't be picked at all.
  const outOfStockBlock = (item: (typeof items)[number]) => {
    if (!stockByItem || company?.allowNegativeStock || !OUTBOUND_KINDS.includes(kind)) return undefined;
    if (!item.trackInventory || item.type !== 'goods' || (stockByItem[item.id] ?? 0) > 0) return undefined;
    return tr('sales:editor.itemOutOfStockBlocked', { name: item.name });
  };
  const maxReturnQty = (line: DocumentLine | null) => {
    if (!sourceDoc || !line) return undefined;
    const src = sourceDoc.lines.find((l) => (line.itemId ? l.itemId === line.itemId : l.name === line.name));
    return src?.quantity;
  };

  const docTaxContext = draftTaxContext(draft);
  const interState =
    taxContext.regime === 'GST' &&
    (!!docTaxContext.crossBorder ||
      (!!taxContext.homeStateCode &&
        !!draft.placeOfSupplyStateCode &&
        taxContext.homeStateCode !== draft.placeOfSupplyStateCode));
  const taxBadge = docTaxContext.zeroRated
    ? tr('sales:editor.zeroRated')
    : interState
      ? 'IGST'
      : taxContext.regime === 'GST'
        ? 'CGST + SGST'
        : 'No tax';

  const canAdvance = step === 0 ? !!draft.partyId : step === 1 ? draft.lines.length > 0 : true;

  const pickParty = (id: string) => {
    const p = parties.find((x) => x.id === id);
    if (!p) return;
    patch(partyFields(p, draft.date, draft.dueDate));
  };

  useEffect(() => {
    if (seed?.missingParty) toast.show(tr('common:documentEditor.prefillMissingParty'), 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Lines that cannot go on a finalised tax document yet. */
  const lineProblem = (): string | undefined => {
    if (dateBeforeSource) return dateBeforeSource;
    const unnamed = draft.lines.find((l) => !l.name.trim());
    if (unnamed) return tr('sales:line.nameRequired');
    // Every line, and the document, must be worth something: rate, gross and
    // net (after discount) above 0. Catches a ₹0 item added straight from the list.
    const zero = draft.lines.filter((l) => {
      const b = calculateLine(l, draft.currency, docTaxContext);
      return l.unitPrice.minor <= 0 || b.gross.minor <= 0 || b.taxable.minor <= 0;
    });
    if (zero.length) return tr('sales:editor.zeroValueLines', { names: zero.map((l) => l.name).join(', ') });
    if (totals.grandTotal.minor <= 0) return tr('sales:editor.zeroTotal');
    if (needsHsn) {
      const missing = draft.lines.filter((l) => validHsn(l.hsnCode, { required: true }));
      if (missing.length) return tr('sales:editor.linesMissingHsn', { count: missing.length, names: missing.map((l) => l.name).join(', ') });
    }
    const short = stockShortfalls({
      doc: { kind, branchId: branchId ?? '', lines: draft.lines, sourceDocumentId: draft.sourceDocumentId },
      items: allItems,
      movements,
      allowNegativeStock: company?.allowNegativeStock,
    });
    if (short.length) {
      return tr('sales:editor.insufficientStock', {
        names: short.map((s) => tr('sales:editor.stockShort', { name: s.name, onHand: s.onHand, needed: s.needed, unit: s.unit })).join(', '),
      });
    }
    return undefined;
  };

  const creditLimitWarning = (): string | null => {
    if (kind !== 'invoice' || !party?.creditLimit || party.creditLimit.minor <= 0) return null;
    const check = checkCreditLimit({
      limit: party.creditLimit,
      partyId: party.id,
      documents,
      payments,
      newTotal: totals.grandTotal,
      excludeDocumentId: documentId,
      rateToBase: (c) =>
        c === baseCurrency ? 1 : c === draft.currency ? draft.exchangeRate : resolveRate(exchangeRates, c, baseCurrency, draft.date),
    });
    return check.exceeds
      ? tr('sales:editor.creditLimitExceeded', {
          party: party.name,
          limit: formatMoney(check.limit),
          exposure: formatMoney(check.exposure),
        })
      : null;
  };

  const creditNotice = creditLimitWarning();

  const requestFinalize = () => {
    const problem = lineProblem();
    if (problem) {
      toast.show(problem, 'error');
      return;
    }
    const warning = creditLimitWarning();
    if (warning) setCreditWarning(warning);
    else setConfirmFinalize(true);
  };

  // Ctrl+Enter (⌘+Enter on a Mac, shown as SHORTCUT_KEYS) does what the Finalise button does: the same
  // checks, then the same confirmation, so nothing is finalised without it.
  // Only while this editor is the screen in view; a phone has no keyboard for it.
  const finalizeShortcut = useRef(() => {});
  useEffect(() => {
    finalizeShortcut.current = () => {
      if (!draft.partyId || draft.lines.length === 0 || confirmFinalize || creditWarning) return;
      // Not over another sheet (picking an item, editing a line…): finish that first.
      if (editingLine || itemOpen || partyOpen || currencyOpen || posOpen || branchOpen) return;
      requestFinalize();
    };
  });
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        e.preventDefault();
        finalizeShortcut.current();
      };
      // Capturing, so it still works from inside a text field, which keeps Enter to itself.
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }, []),
  );

  const save = (finalize: boolean) => {
    if (!draft.partyId) return;
    if (roundOffError) {
      toast.show(roundOffError, 'error');
      return;
    }
    const problem = finalize ? lineProblem() : undefined;
    if (problem) {
      toast.show(problem, 'error');
      return;
    }

    const payload = {
      kind,
      partyId: draft.partyId,
      date: draft.date,
      dueDate: draft.dueDate,
      validUntil: draft.validUntil,
      currency: draft.currency,
      exchangeRate: draft.exchangeRate,
      lines: draft.lines,
      documentDiscountMode: draft.documentDiscountMode,
      documentDiscountValue: draft.documentDiscountValue,
      charges: draft.charges,
      applyRoundOff: draft.applyRoundOff,
      roundOffManual: draft.applyRoundOff ? draft.roundOffManual : undefined,
      notes: draft.notes || undefined,
      terms: draft.terms || undefined,
      reference: draft.reference || undefined,
      supplierDocNumber: draft.supplierDocNumber || undefined,
      placeOfSupplyStateCode: draft.placeOfSupplyStateCode,
      branchId,
      attachmentIds: draft.attachmentIds,
      sourceDocumentId: draft.sourceDocumentId,
    };

    let id = documentId;
    if (documentId) {
      updateDocument(documentId, payload);
    } else {
      id = createDocument({ ...payload, status: 'draft' });
    }
    if (!id) return;

    if (finalize) {
      const target =
        kind === 'quote'
          ? 'sent'
          : kind === 'salesOrder' || kind === 'purchaseOrder'
            ? 'confirmed'
            : kind === 'delivery'
              ? 'delivered'
              : kind === 'goodsReceipt'
                ? 'received'
                : kind === 'salesReturn' || kind === 'purchaseReturn'
                  ? 'approved'
                  : 'issued';
      setDocumentStatus(id, target, creditOverride ? { overrideCreditLimit: true } : undefined);
    }

    toast.show(
      finalize
        ? tr('common:documentEditor.finalised', { kind: kindName })
        : tr('common:documentEditor.savedDraft'),
      'success',
    );
    if (onSaved) onSaved(id);
    else router.replace(detailRouteFor(kind, id) as never);
  };

  /* ---------------------------------------------------------------- */

  const renderParty = () => (
    <View style={{ gap: t.spacing.lg }}>
      <Pressable
        onPress={() => setPartyOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={party ? `Change ${isPurchase ? 'supplier' : 'customer'}` : `Select ${isPurchase ? 'supplier' : 'customer'}`}
      >
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          {party ? (
            <>
              <Avatar name={party.name} size={44} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text variant="body" weight="600">
                  {party.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {party.taxId ?? party.phone ?? party.email ?? party.code}
                </Text>
                <View style={{ flexDirection: 'row', gap: 5, marginTop: 2 }}>
                  <Badge label={`${party.paymentTermsDays}d terms`} tone="neutral" size="sm" />
                  {party.currency !== baseCurrency ? <Badge label={party.currency} tone="info" size="sm" /> : null}
                </View>
              </View>
            </>
          ) : (
            <>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: t.c.chip,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons name="account-plus-outline" size={22} color={t.c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="600">
                  Select {isPurchase ? 'supplier' : 'customer'}
                </Text>
                <Text variant="caption" tone="muted">{tr('sales:editor.partySearch')}</Text>
              </View>
            </>
          )}
          <MaterialCommunityIcons name="chevron-right" size={20} color={t.c.muted} />
        </Card>
      </Pressable>

      <FieldRow>
      <DateField
        label={tr('common:documentEditor.dateLabel', { kind: kindName })}
        value={draft.date}
        onChange={(date) => patch({ date })}
        required
        error={dateBeforeSource}
      />

      {kind === 'invoice' || kind === 'purchaseBill' ? (
        <DateField
          label={tr('sales:editor.dueDate')}
          value={draft.dueDate ?? addDaysISO(draft.date, 30)}
          onChange={(dueDate) => patch({ dueDate })}
          hint={party ? `${party.name} is on ${party.paymentTermsDays}-day terms.` : undefined}
        />
      ) : null}

      {kind === 'quote' ? (
        <DateField
          label={tr('sales:editor.validUntil')}
          value={draft.validUntil ?? addDaysISO(draft.date, 15)}
          onChange={(validUntil) => patch({ validUntil })}
        />
      ) : null}
      </FieldRow>

      <FieldRow>
      {isPurchase ? (
        <TextField
          label={tr('sales:editor.supplierDocNumber')}
          value={draft.supplierDocNumber}
          onChangeText={(supplierDocNumber) => patch({ supplierDocNumber })}
          placeholder={tr('sales:editor.supplierDocPlaceholder')}
          icon="pound"
        />
      ) : null}

      <TextField
        label={tr('sales:editor.reference')}
        value={draft.reference}
        onChangeText={(reference) => patch({ reference })}
        placeholder={tr('sales:editor.referencePlaceholder')}
        icon="link-variant"
      />
      </FieldRow>

      <FieldRow>
      {branches.length > 1 ? (
        <PickerField label={tr('sales:editor.branch')} value={branch?.name} onPress={() => setBranchOpen(true)} icon="warehouse" />
      ) : null}

      {taxContext.regime === 'GST' ? (
        <PickerField
          label={tr('sales:editor.placeOfSupply')}
          value={
            draft.placeOfSupplyStateCode === OTHER_COUNTRY_CODE
              ? tr('sales:editor.otherCountry')
              : INDIAN_STATES.find((s) => s.code === draft.placeOfSupplyStateCode)?.name
          }
          onPress={() => setPosOpen(true)}
          icon="map-marker-outline"
          hint={
            docTaxContext.crossBorder
              ? tr(
                  docTaxContext.zeroRated
                    ? docTaxContext.crossBorder === 'import'
                      ? 'sales:editor.importHint'
                      : 'sales:editor.exportLutHint'
                    : 'sales:editor.exportIgstHint',
                )
              : interState
                ? 'Inter-state supply — IGST applies.'
                : 'Intra-state supply — CGST + SGST apply.'
          }
        />
      ) : null}

      {/* Multi-currency is a full-plan module; a document already in another currency still shows it. */}
      {hasFx || draft.currency !== baseCurrency ? (
        <PickerField
          label={tr('sales:editor.currency')}
          value={`${draft.currency}${draft.currency !== baseCurrency ? ` · 1 ${draft.currency} = ${draft.exchangeRate.toFixed(4)} ${baseCurrency}` : ''}`}
          onPress={() => setCurrencyOpen(true)}
          icon="cash-multiple"
        />
      ) : null}
      </FieldRow>

      {draft.currency !== baseCurrency ? (
        <TextField
          label={`Exchange rate (1 ${draft.currency} → ${baseCurrency})`}
          value={String(draft.exchangeRate)}
          onChangeText={(v) => patch({ exchangeRate: Number(v.replace(/[^0-9.]/g, '')) || 0 })}
          keyboardType="decimal-pad"
          icon="swap-horizontal"
          hint={tr('sales:editor.rateStored')}
        />
      ) : null}
    </View>
  );

  const renderItems = () => (
    <View style={{ gap: t.spacing.md }}>
      {/* With no lines yet, the empty state's own button is the one way to add; two would repeat. */}
      {draft.lines.length > 0 ? (
        <Button title={tr('sales:editor.addItem')} icon="plus" variant="secondary" onPress={() => setItemOpen(true)} fullWidth />
      ) : null}

      {draft.lines.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="tag-outline"
            title={tr('sales:editor.noLines')}
            message={tr('sales:editor.noLinesBody')}
            actionLabel={tr('sales:editor.addItem')}
            onAction={() => setItemOpen(true)}
            compact
          />
        </Card>
      ) : (
        <Card padded={false}>
          {draft.lines.map((line, i) => {
            // After the line's discount, % or amount, as the totals work it out.
            const calc = calculateLine(line, draft.currency, docTaxContext);
            const lineTotal = subtract(calc.gross, calc.discount);
            const maxQty = maxReturnQty(line);
            return (
              <View key={line.id} style={{ borderBottomWidth: i < draft.lines.length - 1 ? 0.5 : 0, borderBottomColor: t.c.line }}>
                <Pressable
                  onPress={() => setEditingLine(line)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${line.name}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    gap: t.spacing.md,
                    paddingHorizontal: t.spacing.lg,
                    paddingTop: t.spacing.lg,
                    paddingBottom: t.spacing.sm,
                    backgroundColor: pressed ? t.c.card2 : 'transparent',
                  })}
                >
                  <View style={{ flex: 1, gap: 5 }}>
                    <Text variant="body" weight="600" numberOfLines={1}>
                      {line.name || 'Untitled line'}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <Badge label={formatPercent(line.taxRate)} tone="neutral" size="sm" />
                      {line.taxInclusive ? <Badge label={tr('sales:editor.inclusive')} tone="info" size="sm" /> : null}
                      {line.hsnCode ? <Badge label={`HSN ${line.hsnCode}`} tone="neutral" size="sm" /> : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="body" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
                      {formatMoney(lineTotal)}
                    </Text>
                    <MaterialCommunityIcons name="pencil-outline" size={15} color={t.c.muted} />
                  </View>
                </Pressable>
                {/* The quantity changes right here, outside the tap that opens the full editor. */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: t.spacing.sm,
                    paddingHorizontal: t.spacing.lg,
                    paddingBottom: t.spacing.lg,
                  }}
                >
                  <QuantityStepper
                    compact
                    positive
                    value={line.quantity}
                    onChange={(q) => updateLine(line.id, { quantity: maxQty !== undefined ? Math.min(q, maxQty) : q })}
                    min={0}
                    decimals={unitDecimals(line.unit)}
                  />
                  <Text variant="caption" tone="muted">
                    {line.unit} × {formatMoney(line.unitPrice)}
                    {line.discountValue > 0
                      ? ` · −${line.discountMode === 'percent' ? formatPercent(line.discountValue) : formatMoney(money(line.discountValue * 100, draft.currency))}`
                      : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {draft.lines.length > 0 ? (
        <Card>
          <TotalsPanel
            totals={totals}
            currency={draft.currency}
            baseCurrency={baseCurrency}
            exchangeRate={draft.exchangeRate}
            compact
          />
        </Card>
      ) : null}
    </View>
  );

  const renderExtras = () => (
    <View style={{ gap: t.spacing.lg }}>
      <View style={{ gap: 6 }}>
        <Text variant="caption" tone="muted" weight="600">{tr('sales:editor.discountOnTotal')}</Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Segmented
            options={[
              { value: 'percent', label: '%' },
              { value: 'amount', label: draft.currency },
            ]}
            value={draft.documentDiscountMode}
            onChange={(v) => patch({ documentDiscountMode: v as 'percent' | 'amount' })}
            style={{ width: 130 }}
            size="sm"
          />
          <TextField
            value={discountText}
            onChangeText={(v) => {
              const clean = v.replace(/[^0-9.]/g, '');
              setDiscountText(clean);
              patch({ documentDiscountValue: Number(clean) || 0 });
            }}
            keyboardType="decimal-pad"
            placeholder="0"
            containerStyle={{ flex: 1 }}
          />
        </View>
      </View>

      <AmountField
        label={tr('sales:editor.otherCharges')}
        value={chargesText}
        onChangeValue={(v) => {
          setChargesText(v);
          patch({ charges: fromMajor(v || '0', draft.currency) });
        }}
        currency={draft.currency}
        hint={tr('sales:editor.otherChargesHint')}
        allowNegative
      />

      <SwitchField
        label={tr('sales:editor.roundOff')}
        description={tr('sales:editor.roundOffHint')}
        value={draft.applyRoundOff}
        onValueChange={(applyRoundOff) => patch({ applyRoundOff })}
      />

      {draft.applyRoundOff && (
        <View style={{ gap: t.spacing.sm }}>
          <Segmented
            options={[
              { value: 'auto', label: tr('sales:editor.roundOffAuto') },
              { value: 'manual', label: tr('sales:editor.roundOffManual') },
            ]}
            value={draft.roundOffManual ? 'manual' : 'auto'}
            onChange={(v) => {
              if (v === 'auto') {
                setRoundOffText('');
                patch({ roundOffManual: undefined });
              } else {
                // Start from the automatic adjustment so switching changes nothing until edited.
                const start = money(totals.roundOff.minor, draft.currency);
                setRoundOffText(String(toMajor(start)));
                patch({ roundOffManual: start });
              }
            }}
            size="sm"
          />
          {draft.roundOffManual && (
            <AmountField
              label={tr('sales:editor.roundOffAmount')}
              value={roundOffText}
              onChangeValue={(v) => {
                setRoundOffText(v);
                patch({ roundOffManual: fromMajor(v || '0', draft.currency) });
              }}
              currency={draft.currency}
              hint={tr('sales:editor.roundOffAmountHint')}
              error={roundOffError}
              allowNegative
            />
          )}
        </View>
      )}

      <TextField
        label={tr('sales:editor.notes')}
        value={draft.notes}
        onChangeText={(notes) => patch({ notes })}
        placeholder={tr('sales:editor.notesHint')}
        multiline
      />

      <TextField
        label={tr('sales:editor.terms')}
        value={draft.terms}
        onChangeText={(terms) => patch({ terms })}
        placeholder={tr('sales:editor.termsPlaceholder')}
        multiline
      />

      <Card>
        <TotalsPanel
          totals={totals}
          currency={draft.currency}
          baseCurrency={baseCurrency}
          exchangeRate={draft.exchangeRate}
          compact
        />
      </Card>
    </View>
  );

  const renderReview = () => (
    <View style={{ gap: t.spacing.lg }}>
      <Card style={{ gap: t.spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ gap: 3 }}>
            <Text variant="caption" tone="muted">
              {tr('common:documentEditor.numberLabel', { kind: kindName })}
            </Text>
            <Text variant="title" weight="700">
              {documentId ? '—' : nextNumberFor(kind as never)}
            </Text>
          </View>
          <Badge label={taxBadge} tone="info" />
        </View>

        <View style={{ height: 1, backgroundColor: t.c.line }} />

        {[
          { label: isPurchase ? 'Supplier' : 'Customer', value: party?.name ?? '—' },
          { label: 'Date', value: draft.date },
          ...(draft.dueDate ? [{ label: 'Due', value: draft.dueDate }] : []),
          ...(draft.validUntil ? [{ label: tr('sales:editor.validUntil'), value: draft.validUntil }] : []),
          { label: tr('sales:editor.branch'), value: branch?.name ?? '—' },
          { label: 'Lines', value: String(draft.lines.length) },
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
      </Card>

      <Card>
        <TotalsPanel
          totals={totals}
          currency={draft.currency}
          baseCurrency={baseCurrency}
          exchangeRate={draft.exchangeRate}
        />
      </Card>

      {/* Shown on the draft too, not only when finalising. */}
      {creditNotice ? (
        <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <MaterialCommunityIcons name="alert-outline" size={19} color={t.c.warn} />
          <Text variant="caption" tone="warn" style={{ flex: 1, lineHeight: 18 }}>
            {creditNotice}
          </Text>
        </Card>
      ) : null}

      <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <MaterialCommunityIcons name="information-outline" size={19} color={t.c.muted} />
        <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
          Finalising assigns a permanent number that is never reused
          {kind === 'invoice' || kind === 'delivery' ? ' and posts stock movements for tracked items' : ''}. Drafts can
          still be edited freely.
        </Text>
      </Card>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FormContainer wide style={desktop ? { maxWidth: '100%' } : undefined}>
        {desktop ? (
          <>
            <Stack.Screen
              options={{
                headerRight: () => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                    {/* Tells a keyboard user about the shortcut wired up above. */}
                    <Text variant="caption" tone="muted" style={{ marginRight: t.spacing.xs }}>
                      {tr('sales:editor.finaliseShortcut', { keys: SHORTCUT_KEYS })}
                    </Text>
                    <Button title={tr('sales:editor.saveDraft')} variant="ghost" onPress={() => save(false)} disabled={!draft.partyId} />
                    <Button title={tr('sales:editor.finalise')} icon="check-decagram-outline" onPress={requestFinalize} disabled={!draft.partyId || draft.lines.length === 0} />
                  </View>
                ),
              }}
            />
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={SHOW_SCROLLBAR}
            >
              <SplitPane
                sideWidth={360}
                main={
                  <View style={{ gap: t.spacing.xxl }}>
                    {(
                      [
                        ['party', renderParty()],
                        ['items', renderItems()],
                        ['extras', renderExtras()],
                      ] as const
                    ).map(([key, body]) => (
                      <View key={key} style={{ gap: t.spacing.md }}>
                        <Text variant="caption" tone="muted" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                          {tr(`common:editorStep.${key}` as 'common:editorStep.party')}
                        </Text>
                        {body}
                      </View>
                    ))}
                  </View>
                }
                side={renderReview()}
              />
            </ScrollView>
          </>
        ) : (
          <>
          <View style={{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.md, paddingBottom: t.spacing.sm }}>
            <Stepper steps={STEPS.map((k) => tr(`common:editorStep.${k}` as 'common:editorStep.party'))} current={step} />
          </View>

          <ScrollView
            contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={SHOW_SCROLLBAR}
          >
            {step === 0 ? renderParty() : step === 1 ? renderItems() : step === 2 ? renderExtras() : renderReview()}
          </ScrollView>

          <View
            style={{
              paddingHorizontal: t.spacing.lg,
              paddingTop: t.spacing.md,
              paddingBottom: insets.bottom + t.spacing.md,
              borderTopWidth: 1,
              borderTopColor: t.c.line,
              backgroundColor: t.c.paper,
              gap: t.spacing.sm,
            }}
          >
            {draft.lines.length > 0 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <Text variant="caption" tone="muted">{tr('sales:editor.total')}</Text>
                <Text variant="title" weight="700">
                  {formatMoney(totals.grandTotal)}
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              {step > 0 ? (
                <Button title={tr('sales:editor.back')} variant="ghost" onPress={() => setStep((s) => s - 1)} style={{ flex: 1 }} />
              ) : null}
              {step < STEPS.length - 1 ? (
                <Button
                  title={tr('sales:editor.continue')}
                  onPress={() => setStep((s) => s + 1)}
                  disabled={!canAdvance}
                  style={{ flex: 2 }}
                />
              ) : (
                <>
                  <Button title={tr('sales:editor.saveDraft')} variant="ghost" onPress={() => save(false)} style={{ flex: 1 }} />
                  <Button title={tr('sales:editor.finalise')} onPress={requestFinalize} style={{ flex: 1 }} />
                </>
              )}
            </View>
          </View>
          </>
        )}

        {/* ---------------- sheets ---------------- */}

        <SelectSheet
          visible={partyOpen}
          onClose={() => setPartyOpen(false)}
          title={isPurchase ? 'Select supplier' : 'Select customer'}
          options={parties.map((p) => ({
            value: p.id,
            label: p.name,
            description: [p.displayName, p.taxId, p.phone].filter(Boolean).join(' · '),
            trailing: p.currency !== baseCurrency ? p.currency : undefined,
          }))}
          value={draft.partyId}
          onSelect={pickParty}
          searchPlaceholder={isPurchase ? 'Search suppliers' : 'Search customers'}
          footer={
            <Button
              title={isPurchase ? 'Add new supplier' : 'Add new customer'}
              variant="secondary"
              icon="plus"
              fullWidth
              onPress={() => {
                setPartyOpen(false);
                router.push(isPurchase ? '/(app)/contacts/suppliers/new' : '/(app)/contacts/customers/new');
              }}
            />
          }
        />

        <SelectSheet
          visible={itemOpen}
          onClose={() => setItemOpen(false)}
          title={tr('sales:editor.addItem')}
          subtitle={sourceDoc ? tr('sales:editor.returnFrom', { number: sourceDoc.number }) : undefined}
          options={
            sourceDoc
              ? sourceDoc.lines.map((l) => ({
                  value: l.id,
                  label: l.name,
                  description: `${formatQty(l.quantity)} ${l.unit} × ${formatMoney(l.unitPrice)}`,
                  trailing: formatPercent(l.taxRate),
                }))
              : items.map((i) => ({
                  value: i.id,
                  label: i.name,
                  description: `${i.sku} · ${formatMoney(isPurchase ? i.purchasePrice : i.salePrice)} / ${i.unit}`,
                  trailing: formatPercent(taxCategories.find((c) => c.id === i.taxCategoryId)?.rate ?? 0),
                  note: stockNote(i),
                  blocked: outOfStockBlock(i),
                }))
          }
          multiple
          confirmLabel={(count) => tr('sales:editor.addItems', { count })}
          onConfirm={(ids) =>
            ids.forEach((id) => {
              if (sourceDoc) {
                const src = sourceDoc.lines.find((l) => l.id === id);
                const already = src && draft.lines.find((l) => (src.itemId ? l.itemId === src.itemId : l.name === src.name));
                if (src && !already) addLine({ ...src, id: uid('ln') });
                return;
              }
              const item = items.find((i) => i.id === id);
              if (item) addLine(lineFromItem(item, isPurchase, taxCategories));
            })
          }
          searchPlaceholder="Search by name or SKU"
          footer={
            sourceDoc ? undefined : (
              <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
                <Button
                  title={tr('sales:editor.oneOffLine')}
                  variant="ghost"
                  icon="pencil-plus-outline"
                  style={{ flex: 1 }}
                  onPress={() => {
                    // Added to the draft only when saved, so closing the sheet leaves no blank line behind.
                    setItemOpen(false);
                    setEditingLine(blankLine(draft.currency, taxCategories));
                  }}
                />
                <Button
                  title={tr('sales:editor.newItem')}
                  variant="secondary"
                  icon="plus"
                  style={{ flex: 1 }}
                  onPress={() => {
                    setItemOpen(false);
                    router.push('/(app)/catalog/items/new');
                  }}
                />
              </View>
            )
          }
        />

        <SelectSheet
          visible={currencyOpen}
          onClose={() => setCurrencyOpen(false)}
          title={tr('sales:editor.documentCurrency')}
          options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})`, trailing: c.symbol }))}
          value={draft.currency}
          onSelect={(code) =>
            setCurrency(code, code === baseCurrency ? 1 : resolveRate(exchangeRates, code, baseCurrency, draft.date))
          }
        />

        <SelectSheet
          visible={posOpen}
          onClose={() => setPosOpen(false)}
          title={tr('sales:editor.placeOfSupply')}
          subtitle={tr('sales:editor.posHint')}
          options={[
            ...INDIAN_STATES.map((s) => ({ value: s.code, label: s.name, trailing: s.code })),
            { value: OTHER_COUNTRY_CODE, label: tr('sales:editor.otherCountry'), trailing: OTHER_COUNTRY_CODE },
          ]}
          value={draft.placeOfSupplyStateCode}
          onSelect={(placeOfSupplyStateCode) => patch({ placeOfSupplyStateCode })}
        />

        <SelectSheet
          visible={branchOpen}
          onClose={() => setBranchOpen(false)}
          title={tr('sales:editor.branch')}
          options={branches.map((b) => ({ value: b.id, label: b.name, description: b.code }))}
          value={branchId}
          onSelect={(id) => patch({ branchId: id })}
          searchable={false}
        />

        <LineEditorSheet
          visible={!!editingLine}
          line={editingLine}
          currency={draft.currency}
          taxCategories={taxCategories}
          taxContext={docTaxContext}
          onClose={() => setEditingLine(null)}
          onSave={(p) => {
            if (!editingLine) return;
            if (editingIsNew) addLine({ ...editingLine, ...p });
            else updateLine(editingLine.id, p);
          }}
          onRemove={editingIsNew ? undefined : () => editingLine && removeLine(editingLine.id)}
          hsnRequired={needsHsn}
          maxQuantity={maxReturnQty(editingLine)}
        />

        <ConfirmDialog
          visible={!!creditWarning}
          title={tr('sales:editor.creditLimitTitle')}
          message={creditWarning ?? ''}
          confirmLabel={tr('sales:editor.creditLimitProceed')}
          icon="alert-outline"
          onCancel={() => setCreditWarning(null)}
          onConfirm={() => {
            setCreditWarning(null);
            setCreditOverride(true);
            setConfirmFinalize(true);
          }}
        />

        <ConfirmDialog
          visible={confirmFinalize}
          title={tr('common:documentEditor.finaliseTitle', { kind: kindName })}
          message={tr('common:documentEditor.finaliseMessage', { kind: kindName })}
          confirmLabel={tr('sales:editor.finalise')}
          icon="check-decagram-outline"
          onCancel={() => setConfirmFinalize(false)}
          onConfirm={() => {
            setConfirmFinalize(false);
            save(true);
          }}
        />
      </FormContainer>
    </KeyboardAvoidingView>
  );
}

export function detailRouteFor(kind: DocumentKind, id: string): string {
  const map: Record<DocumentKind, string> = {
    invoice: '/(app)/sales/invoices',
    quote: '/(app)/sales/quotes',
    salesOrder: '/(app)/sales/orders',
    delivery: '/(app)/sales/deliveries',
    salesReturn: '/(app)/sales/returns',
    purchaseOrder: '/(app)/purchases/orders',
    goodsReceipt: '/(app)/purchases/receipts',
    purchaseBill: '/(app)/purchases/bills',
    purchaseReturn: '/(app)/purchases/returns',
  };
  return `${map[kind]}/${id}`;
}

export function listRouteFor(kind: DocumentKind): string {
  return detailRouteFor(kind, '').replace(/\/$/, '');
}

export { emptyDraft };
