import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@esmart/ui/components/Icon';
import { useTheme } from '@esmart/ui/theme/ThemeProvider';
import { FieldGrid, FieldRow, FormContainer, SplitPane } from '@esmart/ui/components/Layout';
import { Text } from '@esmart/ui/components/Text';
import { Button } from '@esmart/ui/components/Button';
import { Card } from '@esmart/ui/components/Card';
import { Badge } from '@esmart/ui/components/Badge';
import { Stepper } from '@esmart/ui/components/Stepper';
import { EmptyState } from '@esmart/ui/components/EmptyState';
import { TotalsPanel } from '@esmart/ui/components/TotalsPanel';
import { ConfirmDialog } from '@esmart/ui/components/ConfirmDialog';
import { useToast, useToastClearance } from '@esmart/ui/components/Toast';
import { AmountField, FieldShell, PickerField, QuantityStepper, Segmented, SwitchField, TextField } from '@esmart/ui/components/Field';
import { focusRing, type WebPressState } from '@esmart/ui/theme/interaction';
import { useDecimalText } from '../../components/useDecimalText';
import { DateField } from '@esmart/ui/components/pickers/DateField';
import { SelectSheet } from '@esmart/ui/components/pickers/SelectSheet';
import { Avatar } from '@esmart/ui/components/Avatar';

import { Address, DocStatus, DocumentKind, DocumentLine, NoteReason, Party } from '@esmart/core/types';
import { NOTE_KINDS, PURCHASE_KINDS, isAwaitingApproval, isFinalized } from '@esmart/core/domain/documentStates';
import { TDS_SECTIONS, tdsSection } from '@esmart/core/data/tdsSections';
import { TCS_SECTIONS, partyTcsSection, tcsAskedOn, tcsRateFor, tcsSection } from '@esmart/core/data/tcsSections';
import { documentKindLabel } from '@esmart/core/labels';
import { resolveRate } from '@esmart/core/domain/fx';
import { buildTaxContext } from '@esmart/core/domain/taxEngine';
import { OTHER_COUNTRY_CODE } from '@esmart/core/domain/stateCodes';
import { CURRENCIES } from '@esmart/core/lib/currencies';
import { formatMoney, formatPercent, formatQty } from '@esmart/core/lib/format';
import { addDaysISO, daysBetween, formatDate, parseDate } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import { factorOf, fromMajor, money, subtract, toMajor, zero, type Money } from '@esmart/core/lib/money';
import { INDIAN_STATES, unitDecimals, unitShortName } from '@esmart/core/data/masters';
import { OUTBOUND_KINDS, isLowStock, shortfallsAgainst } from '@esmart/core/domain/stockLedger';
import { CHARGES_TAXED_FROM, calculateLine } from '@esmart/core/domain/lineCalc';
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
  useDefaultBranchId,
  useDocument,
  useTaxCategories,
  useVehicles,
} from '../../store/selectors';
import { useCostCentres } from '../../store/books';
import {
  DraftState,
  blankLine,
  emptyDraft,
  inCurrency,
  inclusiveState,
  lineFromItem,
  newLineInclusive,
  reprice,
  useDocumentDraft,
} from './useDocumentDraft';
import { LineEditorSheet } from './LineEditorSheet';
import { LineGrid } from './LineGrid';
import { SHOW_SCROLLBAR, useIsDesktop } from '@esmart/ui/theme/breakpoints';
import { useQueryParams } from '../../navigation/queryParams';
import { useCanWrite } from '../../remote/connectivity';
import { useSaveOnline } from '../../remote/save';
import { useDocumentRecord, useItemRecord, useItemSearch, useOpenDocuments, usePartyRecord, usePartySearch, useStockAvailable, useStockMovedBy, useTdsPreview } from '../../remote/queries';
import { LoadingView } from '../../components/LoadingView';
import { useDebounced } from '../../components/useDebounced';
import { useSaveShortcut } from '../../components/useSaveShortcut';
import { useLeaveGuard } from '../../components/useLeaveGuard';
import { FROM_DOCUMENT, takeHandBack } from '../../navigation/handBack';
import { tdsForDocument } from '../../store/tds';
import { useItcBreakup } from './itcBreakup';
import { lineRateLabel } from './lineRate';
import { useCessRows } from './cessRows';
import { expectedSaleTds } from '@esmart/core/domain/tds';
import { panOfGstin } from '@esmart/core/domain/gstin';
import { CostCentreField } from '../books/CostCentreField';
import { BillableExpenses } from './BillableExpenses';
import { CustomFieldsSection, customFieldErrors, useCustomFields } from '../customFields/CustomFieldsSection';
import { VehicleField } from '../vehicles/VehicleField';

/** What finalising moves a draft of this kind to. */

export function finaliseTarget(kind: DocumentKind): DocStatus {
  return kind === 'quote' || kind === 'proforma'
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
}

/** The Finalise button, saying what it does for this kind: Issue invoice, Mark as sent, Confirm order… */
export function finaliseActionLabel(tr: (key: never) => unknown, kind: DocumentKind): string {
  return String(tr(`sales:editor.finaliseAction.${kind}` as never));
}

/** Editor step keys, in order. Names live in `common:editorStep.*`. */
const STEPS = ['party', 'items', 'extras', 'review'] as const;

/** The documents GST is charged on, where reverse charge can apply. */
const TAX_KINDS: DocumentKind[] = ['invoice', 'salesReturn', 'purchaseBill', 'purchaseReturn', ...NOTE_KINDS];
const NOTE_REASONS: NoteReason[] = ['discount', 'priceChange', 'taxCorrection', 'deficiency', 'other'];
/** The documents goods travel with, where a vehicle is worth recording. */
const VEHICLE_KINDS: DocumentKind[] = ['invoice', 'salesOrder', 'delivery', 'salesReturn', 'purchaseOrder', 'goodsReceipt', 'purchaseBill', 'purchaseReturn'];

type EditorProps = {
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
    lines?: { name: string; quantity: number; unitPrice: number; itemId?: string }[];
    /** The scanned image, kept on the bill. */
    attachmentIds?: string[];
    /** Several catalogue items at once, e.g. what Low stock says to reorder. */
    items?: { itemId: string; quantity: number }[];
  };
  onSaved?: (id: string) => void;
};

/**
 * Loads what the editor starts from before it opens: the prefilled party and
 * item, and the document this one is made from. The form reads them from the
 * store, which no longer holds every record.
 */
export function DocumentEditor(props: EditorProps) {
  const party = usePartyRecord(props.prefill?.partyId);
  const item = useItemRecord(props.prefill?.itemId);
  const source = useDocumentRecord(props.initialDraft?.sourceDocumentId);
  // Several items at once (Low stock's reorder, a scanned bill's matched lines): any the store doesn't
  // hold are fetched first, or a reload would open the editor with those lines dropped.
  const companyId = useAppStore((s) => s.activeCompanyId);
  const wanted = useMemo(
    () => [...new Set([...(props.prefill?.items ?? []).map((x) => x.itemId), ...(props.prefill?.lines ?? []).flatMap((l) => (l.itemId ? [l.itemId] : []))])],
    [props.prefill?.items, props.prefill?.lines],
  );
  const held = useAppStore((s) => s.items);
  const [settled, setSettled] = useState<string[]>([]);
  const missing = wanted.filter((id) => !held.some((i) => i.id === id) && !settled.includes(id));
  const markSettled = useCallback((id: string) => setSettled((cur) => (cur.includes(id) ? cur : [...cur, id])), []);
  if (party.isLoading || item.isLoading || source.isLoading || missing.length) {
    return (
      <>
        {missing.map((id) => (
          <PrefillItemFetch key={id} id={id} onSettled={markSettled} />
        ))}
        <LoadingView variant="items-form" keepTitle />
      </>
    );
  }
  // Keyed by business: on web the page stays open across a switch, and the form seeds its branch,
  // taxes and party from the business it opened in.
  return <DocumentEditorForm key={companyId} {...props} />;
}

/** Fetches one prefilled item into the store; once it's answered (or can't be had) the editor may open. */
function PrefillItemFetch({ id, onSettled }: { id: string; onSettled: (id: string) => void }) {
  const q = useItemRecord(id);
  const done = q.isSuccess || q.isError;
  useEffect(() => {
    if (done) onSettled(id);
  }, [done, id, onSettled]);
  return null;
}

function DocumentEditorForm({ kind, documentId, initialDraft, prefill, onSaved }: EditorProps) {
  const t = useTheme();
  const { t: tr } = useTranslation(['common', 'domain', 'sales', 'purchases', 'contacts']);
  const router = useRouter();
  const toast = useToast();
  // The phone footer (total and buttons) is tall; a toast sits above it.
  const onFooterLayout = useToastClearance();
  const { save: saveOnline, saving, release: releaseSave } = useSaveOnline();
  // View-only (no internet, offline not agreed to): the header's badge says so and offers offline mode.
  const blocked = !useCanWrite();
  const insets = useSafeAreaInsets();
  const desktop = useIsDesktop();
  // Whether these pickers show at all, so a desktop doesn't keep an empty row for them.
  const hasCostCentres = useCostCentres().length > 0;
  const hasVehicles = useVehicles().length > 0;

  const company = useActiveCompany();
  const baseCurrency = useBaseCurrency();
  const hasFx = useHasModule('fx');
  const hasInventory = useHasModule('inventory');
  const hasPos = useHasModule('pos');
  const branches = useBranches();
  const taxCategories = useTaxCategories();
  const exchangeRates = useExchangeRates();
  const isPurchase = PURCHASE_KINDS.includes(kind);
  const parties = useParties(isPurchase ? 'supplier' : 'customer');
  const items = useItems({ activeOnly: true });
  const allItems = useItems();
  // Only the device's TDS fallback reads these; everything else asks the server.
  const documents = useDocuments();
  const hsnRequired = hsnMandatory(company?.taxRegistration);
  const isReturn = kind === 'salesReturn' || kind === 'purchaseReturn';
  // Tax documents carry HSN/SAC per line; quotes and orders do not have to.
  const isNote = NOTE_KINDS.includes(kind);
  const needsHsn = hsnRequired && (kind === 'invoice' || kind === 'purchaseBill' || isReturn || isNote);

  // An issued invoice opened here is the latest of its series being edited in full (RULES 6.23): it is
  // saved, never finalised again, and the server says whether it may be.
  const existing = useDocument(documentId);
  const editingIssued = !!existing && isFinalized(existing.status) && existing.status !== 'cancelled';
  const createDocument = useAppStore((s) => s.createDocument);
  const updateDocument = useAppStore((s) => s.updateDocument);
  const setDocumentStatus = useAppStore((s) => s.setDocumentStatus);
  const nextNumberFor = useAppStore((s) => s.nextNumberFor);
  const defaultBranchId = useDefaultBranchId();

  const taxContext = useMemo(
    () => ({
      regime: company?.taxRegistration?.regime ?? ('NONE' as const),
      homeStateCode: company?.taxRegistration?.placeOfSupplyStateCode,
      placeOfSupplyStateCode: company?.taxRegistration?.placeOfSupplyStateCode,
      registered: !!company?.taxRegistration?.registered,
    }),
    [company],
  );

  /**
   * What choosing a party sets on the draft; shared by the picker and
   * `prefill`. The draft takes the party's currency with its prices converted.
   */
  const withParty = (d: DraftState, p: Party): DraftState =>
    inCurrency(
      {
        ...d,
        partyId: p.id,
        // A party synced from an older API can arrive without an address.
        placeOfSupplyStateCode: p.billingAddress?.stateCode,
        dueDate: kind === 'invoice' || kind === 'purchaseBill' ? addDaysISO(d.date, p.paymentTermsDays) : d.dueDate,
        // A supplier under reverse charge puts their bills under it; the bill can still say otherwise.
        ...(isPurchase && { reverseCharge: !!p.reverseCharge }),
        // A customer with TCS puts their invoices under its section; another party clears one picked before.
        ...(kind === 'invoice' && { tcsSection: partyTcsSection(p) ?? (d.tcsSection ? 'none' : undefined) }),
      },
      p.currency,
      p.currency === baseCurrency ? 1 : resolveRate(exchangeRates, p.currency, baseCurrency, d.date),
    );

  // A prefill seeds the draft and the opening step, as if the person had
  // picked the party and item by hand. Read once, like `initialDraft`.
  const [seed] = useState(() => {
    const empty: DraftState = { ...emptyDraft(baseCurrency, kind, tr('sales:editor.defaultTerms')), branchId: defaultBranchId };
    if (!prefill) return { missingParty: false, draft: empty, step: 0 };
    const base: DraftState = {
      ...empty,
      date: prefill.date ?? empty.date,
      supplierDocNumber: prefill.supplierDocNumber ?? empty.supplierDocNumber,
      attachmentIds: prefill.attachmentIds ?? empty.attachmentIds,
    };
    const p = prefill.partyId ? parties.find((x) => x.id === prefill.partyId) : undefined;
    const item = prefill.itemId ? items.find((i) => i.id === prefill.itemId) : undefined;
    // A scanned line the server matched to an item starts from that item, so it moves stock.
    const scanned = (prefill.lines ?? []).map((l) => {
      const matched = l.itemId ? items.find((i) => i.id === l.itemId) : undefined;
      return {
        ...(matched ? lineFromItem(matched, isPurchase, taxCategories) : { ...blankLine(p?.currency ?? baseCurrency, taxCategories), name: l.name }),
        quantity: l.quantity,
        unitPrice: fromMajor(String(l.unitPrice), p?.currency ?? baseCurrency),
      };
    });
    const listed = (prefill.items ?? []).flatMap((x) => {
      const it = items.find((i) => i.id === x.itemId);
      return it ? [{ ...lineFromItem(it, isPurchase, taxCategories), quantity: x.quantity }] : [];
    });
    const lines = item
      ? [{ ...lineFromItem(item, isPurchase, taxCategories), quantity: prefill.quantity ?? 1 }]
      : listed.length
        ? listed
        : scanned;
    // Without a party (e.g. "Sell" from an item) the line is ready and the party step stays open.
    if (!p) return { missingParty: !!prefill.partyId, draft: { ...base, lines }, step: 0 };
    return {
      missingParty: false,
      draft: withParty({ ...base, lines }, p),
      step: STEPS.indexOf(item ? 'review' : 'items'),
    };
  });

  // Party and place of supply decide export / SEZ / import treatment (IGST, or none under LUT).
  const draftTaxContext = useCallback(
    (d: DraftState) => {
      const ctx = buildTaxContext(company, {
        placeOfSupply: d.placeOfSupplyStateCode,
        party: parties.find((p) => p.id === d.partyId),
        date: d.date,
        purchase: isPurchase,
        branch: branches.find((b) => b.id === (d.branchId ?? defaultBranchId)),
        reverseCharge: d.reverseCharge,
      });
      // A financial note without GST charges none, as the server works it out (RULES 6.24).
      return isNote && !d.sourceDocumentId && d.noteGst === 'noGst' ? { ...ctx, registered: false, reverseCharge: false } : ctx;
    },
    [company, parties, isPurchase, isNote, branches, defaultBranchId],
  );

  // TCS on an invoice (s.206C): the section's rate, higher for a buyer with no PAN, over the 206C(1F) threshold only.
  const tcsRateOfDraft = useCallback(
    (d: { tcsSection?: string; partyId?: string | null; date?: string }, totalBaseMinor: number) => {
      // Not asked from TCS_ENDS_ON: none is collected on an invoice dated then or later.
      if (!tcsAskedOn(d.date)) return 0;
      const buyer = parties.find((p) => p.id === d.partyId);
      return tcsRateFor(d.tcsSection, !!(buyer?.pan || buyer?.taxId), totalBaseMinor);
    },
    [parties],
  );
  // A credit note or return against an invoice that collected TCS gives it back at that invoice's rate.
  const tcsRateOfNote = useCallback((d: { sourceDocumentId?: string }) => documents.find((x) => x.id === d.sourceDocumentId)?.tcs?.rate ?? 0, [documents]);
  const { draft, setDraft, patch, addLine, updateLine, removeLine, setCurrency, setPricesIncludeTax, totals } = useDocumentDraft({
    kind,
    baseCurrency,
    taxCategories,
    taxContext: draftTaxContext,
    initial: initialDraft ?? seed?.draft,
    tcsRate: kind === 'invoice' ? tcsRateOfDraft : kind === 'creditNote' || kind === 'salesReturn' ? tcsRateOfNote : undefined,
  });

  // A note raised against no one invoice or bill (?direct=1): it chooses its GST treatment.
  const directNote = isNote && !draft.sourceDocumentId;

  // What the person has picked or typed, to tell an untouched form from one with changes to lose.
  const entered = JSON.stringify([
    draft.partyId, draft.date, draft.dueDate, draft.validUntil, draft.notes, draft.terms, draft.reference, draft.supplierDocNumber,
    draft.charges, draft.documentDiscountMode, draft.documentDiscountValue, draft.attachmentIds,
    draft.lines.map((l) => [l.itemId, l.name, l.description, l.quantity, l.unit, l.unitPrice.minor, l.discountMode, l.discountValue, l.taxCategoryId]),
  ]);
  const [untouched] = useState(entered);
  const leaveGuard = useLeaveGuard(entered !== untouched);

  // TDS kept back on a supplier's bill or debit note, for a business with a TAN: worked out as the server will.
  // The section shows on every bill: without a TAN it says where to add one, rather than hiding.
  const billTds = kind === 'purchaseBill' || kind === 'supplierDebitNote';
  const takesTds = !!company?.tan && billTds;
  // On an invoice: TDS the customer will deduct (RULES 4.14). Shown, never taken off the GST invoice value.
  const saleTds = kind === 'invoice';
  const fx = draft.currency === company?.baseCurrency ? 1 : draft.exchangeRate || 1;
  // The server counts the deductee's year so far; the device's own figure is the fallback while it answers or offline.
  const serverTds = useTdsPreview(
    takesTds && draft.partyId
      ? { partyId: draft.partyId, date: draft.date, taxableMinor: Math.round(totals.taxableAmount.minor * fx), currency: company!.baseCurrency, section: draft.tdsSection, documentId }
      : null,
  ).data;
  const deviceTds = useMemo(
    () =>
      takesTds && draft.partyId
        ? tdsForDocument(
            { id: documentId ?? '', kind, partyId: draft.partyId, date: draft.date, currency: draft.currency, exchangeRate: draft.exchangeRate, totals, tdsSection: draft.tdsSection, sourceDocumentId: draft.sourceDocumentId },
            { company, parties, documents },
          )
        : undefined,
    [takesTds, documentId, kind, draft.partyId, draft.date, draft.currency, draft.exchangeRate, draft.tdsSection, draft.sourceDocumentId, totals, company, parties, documents],
  );
  const draftTds = useMemo<typeof deviceTds>(() => {
    if (!takesTds || !serverTds) return deviceTds;
    if (!serverTds.section || !serverTds.amount.minor) return undefined;
    // The server answers in base currency; the bill shows its own.
    return { section: serverTds.section, rate: serverTds.rate, amount: money(Math.round(serverTds.amount.minor / fx), draft.currency) };
  }, [takesTds, serverTds, deviceTds, fx, draft.currency]);
  const saleSection = saleTds ? (draft.tdsSection ?? parties.find((p) => p.id === draft.partyId)?.tdsSection) : undefined;
  const expectedTds = useMemo(() => {
    if (!saleTds || !saleSection || saleSection === 'none') return undefined;
    const e = expectedSaleTds({ section: saleSection, rate: draft.tdsRate, sellerPan: panOfGstin(company?.taxRegistration?.identifier) || undefined, date: draft.date, baseMinor: totals.taxableAmount.minor });
    return e ? { section: e.section, rate: e.rate, amount: money(e.amountMinor, draft.currency) } : undefined;
  }, [saleTds, saleSection, draft.tdsRate, draft.date, draft.currency, totals.taxableAmount.minor, company]);
  const tdsRow = draftTds
    ? { label: tr('common:totals.tdsLabel', { section: tdsSection(draftTds.section)?.label ?? draftTds.section, rate: formatPercent(draftTds.rate) }), amount: draftTds.amount }
    : expectedTds
      ? { label: tr('sales:tds.expectedLabel', { section: tdsSection(expectedTds.section)?.label ?? expectedTds.section, rate: formatPercent(expectedTds.rate) }), amount: expectedTds.amount, netLabel: tr('sales:tds.netReceivable') }
      : undefined;
  const itcBreakup = useItcBreakup({ kind, lines: draft.lines, totals, currency: draft.currency, exchangeRate: draft.exchangeRate, reverseCharge: draft.reverseCharge }, company?.baseCurrency ?? draft.currency);
  // The cess item by item, under the totals, when anything on it carries cess.
  const cessRows = useCessRows(draft.lines, totals, draft.currency, draft.reverseCharge);
  const tdsSectionLabel = (code: string | undefined) => (!code || code === 'none' ? tr('purchases:tds.none') : `${tdsSection(code)?.label ?? code} · ${tdsSection(code)?.nature ?? ''}`);

  const [step, setStep] = useState(seed?.step ?? 0);
  const [partyOpen, setPartyOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  // The pickers search the server, so a long customer or item list needn't be on the device.
  const [partyQuery, setPartyQuery] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const partySearch = usePartySearch(isPurchase ? 'supplier' : 'customer', useDebounced(partyQuery), partyOpen);
  const itemSearch = useItemSearch(useDebounced(itemQuery), itemOpen && !(isReturn && draft.sourceDocumentId));
  const partyOptions = partySearch.data ?? [];
  // Looked up in the store, where the search keeps what it found, for stock and opening-date checks.
  const itemOptions = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    return (itemSearch.data ?? []).flatMap((r) => (r.id && byId.get(r.id) ? [byId.get(r.id)!] : []));
  }, [itemSearch.data, items]);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [tdsOpen, setTdsOpen] = useState(false);
  const [tcsOpen, setTcsOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<DocumentLine | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  // "Save & send": finalise as usual, then the detail screen emails it.
  const [sendAfter, setSendAfter] = useState(false);
  const canSend = !isPurchase && kind !== 'delivery' && kind !== 'salesReturn';
  const [creditWarning, setCreditWarning] = useState<string | null>(null);
  // Set once the user accepts the credit-limit warning, so the server lets the invoice through.
  const [creditOverride, setCreditOverride] = useState(false);
  // The warning came from saving an issued invoice's edit (RULES 6.23), not from finalising: accepting it saves again.
  const [creditOnEdit, setCreditOnEdit] = useState(false);
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
  // An import bill: goods from an overseas supplier, with a bill of entry for the IGST paid at customs.
  const imported = party?.gstRegistrationType === 'overseas' || draft.placeOfSupplyStateCode === '96';
  const boe = draft.billOfEntry ?? { number: '', date: draft.date, portCode: '', assessableValue: zero(baseCurrency), igst: zero(baseCurrency) };
  const patchBoe = (p: Partial<NonNullable<DraftState['billOfEntry']>>) => patch({ billOfEntry: { ...boe, ...p } });
  const boeAmount = (m?: Money) => (m && m.minor ? String(toMajor(m)) : '');
  // The party's other open invoices, as the server counts what they still owe.
  const openInvoices = useOpenDocuments(kind === 'invoice' && party?.creditLimit?.minor ? draft.partyId : null, ['invoice']).data;
  /** Core's `checkCreditLimit`: what's owed on other invoices plus this one, in the limit's currency. */
  const creditCheck = (limit: Money) => {
    const rateToBase = (c: string) => (c === baseCurrency ? 1 : c === draft.currency ? draft.exchangeRate : resolveRate(exchangeRates, c, baseCurrency, draft.date));
    const limitRate = rateToBase(limit.currency) || 1;
    const inLimit = (m: Money) => (m.currency === limit.currency ? m.minor : Math.round((m.minor * (rateToBase(m.currency) || 1)) / limitRate));
    const owed = (openInvoices ?? []).filter((d) => d.id !== documentId).reduce((acc, d) => acc + inLimit((d.outstanding ?? zero(d.grandTotal.currency)) as Money), 0);
    const exposureMinor = owed + inLimit(totals.grandTotal);
    return { exposure: money(exposureMinor, limit.currency), limit, exceeds: limit.minor > 0 && exposureMinor > limit.minor };
  };
  const branchId = draft.branchId ?? defaultBranchId ?? undefined;
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
  // An item has stock from the day its opening stock was counted: nothing with
  // it can be dated before that (the server refuses it too).
  const startsAfter = (item: (typeof allItems)[number] | undefined) =>
    item?.trackInventory && item.openingStockDate && draft.date < item.openingStockDate ? item.openingStockDate : undefined;
  const openingStockBlock = (item: (typeof items)[number]) => {
    const from = startsAfter(item);
    return from ? tr('sales:editor.itemBeforeOpeningStock', { name: item.name, date: formatDate(from) }) : undefined;
  };
  const lateStarter = draft.lines.map((l) => allItems.find((i) => i.id === l.itemId)).find((i) => startsAfter(i));
  const dateBeforeOpeningStock = lateStarter?.openingStockDate
    ? tr('sales:editor.dateBeforeOpeningStock', { date: formatDate(lateStarter.openingStockDate), name: lateStarter.name })
    : undefined;
  // An invoice or bill falls due, and a quote lapses, on or after the day it is dated.
  const beforeDocDate = tr('sales:editor.beforeDocDate', { date: formatDate(draft.date) });
  const dueBeforeDate = (kind === 'invoice' || kind === 'purchaseBill') && draft.dueDate && draft.dueDate < draft.date ? beforeDocDate : undefined;
  const validBeforeDate = (kind === 'quote' || kind === 'proforma') && draft.validUntil && draft.validUntil < draft.date ? beforeDocDate : undefined;
  // What the server refuses on any save, a draft too.
  // A draft can't be dated before what it was made from either; the server refuses it.
  const dateProblem = dateBeforeSource ?? dateBeforeOpeningStock ?? dueBeforeDate ?? validBeforeDate;
  const editingIsNew = !!editingLine && !draft.lines.some((l) => l.id === editingLine.id);

  // The item list shows stock at this branch when finalising this document moves
  // stock: not for a quote or an order, nor an invoice whose stock already left
  // with the delivery it came from.
  useDocumentRecord(draft.sourceDocumentId);
  const sourceMoved = useStockMovedBy(draft.sourceDocumentId).data ?? false;
  const movesStock = ['invoice', 'delivery', 'goodsReceipt', 'purchaseBill', 'salesReturn', 'purchaseReturn'].includes(kind) && !sourceMoved;
  // What the branch can give on the document date, not today, as finalising will check it.
  const available = useStockAvailable(branchId, draft.date, movesStock && hasInventory).data;
  const stockByItem = itemOpen && movesStock ? available : undefined;
  /** Tracked goods going out beyond what the server says is there; it refuses them on finalising too. */
  const shortfalls = () =>
    available && movesStock && !company?.allowNegativeStock && OUTBOUND_KINDS.includes(kind) ? shortfallsAgainst(available, draft.lines, allItems) : [];
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
  const inclusive = inclusiveState(draft.lines);
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
        : tr('common:totals.noTax');

  const canAdvance = step === 0 ? !!draft.partyId : step === 1 ? draft.lines.length > 0 : true;

  const rateText = useDecimalText(draft.exchangeRate, (exchangeRate) => patch({ exchangeRate }));

  const [, setParams] = useQueryParams();
  const pickParty = (id: string) => {
    const p = parties.find((x) => x.id === id);
    if (!p) return;
    setDraft((d) => withParty(d, p));
    // A new document keeps its party in the URL (replaced, not pushed), so a
    // refresh or a shared link reopens it with the same party.
    if (!documentId) setParams({ partyId: id });
  };

  // Back from New item opened from this document: the item goes on as a line.
  const takeMade = useRef<() => void>(() => {});
  useEffect(() => {
    takeMade.current = () => {
      const made = takeHandBack();
      if (made?.kind !== 'item') return;
      const line = lineFromItem(made.record, isPurchase, taxCategories);
      addLine({ ...line, unitPrice: reprice(line.unitPrice, draft.currency, 1, draft.exchangeRate) });
    };
  });
  useFocusEffect(useCallback(() => takeMade.current(), []));

  // "Add customer" from the picker: the party saved there is the one this document is for.
  const partiesBeforeAdd = useRef<Set<string> | null>(null);
  useEffect(() => {
    const before = partiesBeforeAdd.current;
    const added = before && parties.find((p) => !before.has(p.id));
    if (!added) return;
    partiesBeforeAdd.current = null;
    pickParty(added.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parties]);

  useEffect(() => {
    if (seed?.missingParty) toast.show(tr('common:documentEditor.prefillMissingParty'), 'warning', { icon: 'account-question-outline' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The company's own fields on a document, checked as the server will; shown once a save is tried.
  const documentFields = useCustomFields('document');
  const fieldErrors = customFieldErrors(documentFields, 'document', draft.customFields, tr);
  const [showFieldErrors, setShowFieldErrors] = useState(false);
  const fieldProblem = Object.values(fieldErrors)[0];

  /** Lines that cannot go on a finalised tax document yet. */
  const lineProblem = (): string | undefined => {
    if (dateBeforeSource) return dateBeforeSource;
    if (dateProblem) return dateProblem;
    if (fieldProblem) {
      setShowFieldErrors(true);
      return fieldProblem;
    }
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
    const short = shortfalls();
    if (short.length) {
      return tr('sales:editor.insufficientStock', {
        date: formatDate(draft.date),
        // A long order would fill the screen; three names and a count are enough.
          names: [
            ...short.slice(0, 3).map((s) => tr('sales:editor.stockShort', { name: s.name, onHand: s.onHand, needed: s.needed, unit: s.unit })),
            ...(short.length > 3 ? [tr('sales:editor.stockMore', { count: short.length - 3 })] : []),
          ].join(', '),
      });
    }
    return undefined;
  };

  const creditLimitWarning = (): string | null => {
    if (kind !== 'invoice' || !party?.creditLimit || party.creditLimit.minor <= 0) return null;
    const check = creditCheck(party.creditLimit);
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

  const save = async (finalize: boolean, opts?: { overrideCreditLimit?: boolean }) => {
    if (!draft.partyId) return;
    if (roundOffError) {
      toast.show(roundOffError, 'error');
      return;
    }
    const problem = finalize ? lineProblem() : dateProblem;
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
      billOfEntry: imported ? draft.billOfEntry : undefined,
      isdInvoice: kind === 'purchaseBill' && !imported ? !!draft.isdInvoice : undefined,
      placeOfSupplyStateCode: draft.placeOfSupplyStateCode,
      // Sent as false too: left out, the server keeps the supplier's (or the stored) reverse charge.
      reverseCharge: TAX_KINDS.includes(kind) ? !!draft.reverseCharge : undefined,
      noteReason: isNote ? draft.noteReason : undefined,
      // A direct note says how it stands with GST; with GST it names the supply it adjusts (RULES 6.24).
      noteGst: directNote ? (draft.noteGst ?? 'withGst') : undefined,
      originalNumber: directNote && draft.noteGst !== 'noGst' ? draft.originalNumber?.trim() || undefined : undefined,
      originalDate: directNote && draft.noteGst !== 'noGst' ? draft.originalDate : undefined,
      tdsSection: billTds || saleTds ? draft.tdsSection : undefined,
      tdsRate: saleTds && draft.tdsSection && draft.tdsSection !== 'none' ? draft.tdsRate : undefined,
      // `none` is sent as itself: unset on a new invoice would take the customer's section.
      // From TCS_ENDS_ON it is 'none' outright, so the server doesn't take the customer's section either.
      tcsSection: kind === 'invoice' ? (tcsAskedOn(draft.date) ? draft.tcsSection : 'none') : undefined,
      costCentreId: draft.costCentreId,
      customFields: draft.customFields,
      vehicleId: draft.vehicleId,
      branchId,
      attachmentIds: draft.attachmentIds,
      sourceDocumentId: draft.sourceDocumentId,
    };

    // One save: it waits for the server, which numbers and checks it.
    const res = await saveOnline(
      () => {
        let saved = documentId;
        if (documentId) updateDocument(documentId, payload, opts?.overrideCreditLimit ? { overrideCreditLimit: true } : undefined);
        else saved = createDocument({ ...payload, status: 'draft' });
        if (saved && finalize) finalizeLocal(saved);
        return saved;
      },
      // Busy until it has left for the saved document: a second tap would create it again.
      { hold: true },
    );
    // Another save from this screen is still running.
    if (!res) return;
    if (res.outcome === 'unreachable') {
      toast.show(tr('common:save.unreachable'), 'error');
      return;
    }
    if (!res.result) {
      releaseSave();
      return;
    }
    if (res.outcome === 'refused') {
      // An issued invoice's edit that takes the customer past their limit: the same warning finalising gives,
      // and accepting it saves the edit again with the override.
      if (res.errorCode === 'CREDIT_LIMIT_EXCEEDED' && editingIssued && !opts?.overrideCreditLimit) {
        setCreditOnEdit(true);
        setCreditWarning(creditLimitWarning() ?? res.error ?? '');
        return;
      }
      toast.show(tr('common:save.refused', { reason: res.error }), 'error');
      return;
    }
    const id = res.id ?? res.result;
    // Over an approval rule's amount the server keeps it a draft for an owner or admin: it isn't finalised yet.
    const saved = useAppStore.getState().documents.find((d) => d.id === id);
    const held = finalize && !!saved && isAwaitingApproval(saved);
    const issued = finalize && !held;
    // An issued invoice can still be put right while it is the latest (RULES 6.23), so the toast offers
    // that; an issued bill is usually paid next, so its toast offers that.
    const issuedInvoice = kind === 'invoice' && (issued || editingIssued);
    toast.show(
      editingIssued
        ? tr('common:documentEditor.updatedIssued', { kind: kindName })
        : held
          ? tr('common:documentEditor.sentForApproval', { kind: kindName })
          : finalize
            ? tr('common:documentEditor.finalised', { kind: kindName })
            : tr('common:documentEditor.savedDraft'),
      held ? 'info' : 'success',
      {
        icon: held ? 'clipboard-clock-outline' : finalize || editingIssued ? 'file-check-outline' : 'content-save-outline',
        detail: [party?.name, formatMoney(totals.grandTotal)].filter(Boolean).join(' · '),
        action: issuedInvoice
          ? { label: tr('common:toast.editInvoice'), onPress: () => router.push(`${detailRouteFor(kind, id)}/edit` as never) }
          : issued && kind === 'purchaseBill'
            ? {
                label: tr('common:toast.paySupplier'),
                onPress: () => router.push(`/(app)/payments/new?direction=paid&partyId=${draft.partyId}&documentId=${id}` as never),
              }
            : undefined,
      },
    );
    // Saved: leaving for the saved document isn't leaving changes behind.
    await leaveGuard.release();
    if (onSaved) onSaved(id);
    // Sent from the detail screen, the same way its own Send by email does it.
    // A held draft isn't sent: it goes out once it is approved and issued.
    else router.replace(`${detailRouteFor(kind, id)}${issued && sendAfter ? '?send=email' : ''}` as never);
  };

  const finalizeLocal = (id: string) => {
    setDocumentStatus(id, finaliseTarget(kind), creditOverride ? { overrideCreditLimit: true } : undefined);
  };
  const finaliseLabel = finaliseActionLabel(tr, kind);

  // Ctrl+Enter (⌘+Enter on a Mac, shown on the Finalise button) does what the Finalise button does: the same
  // checks, then the same confirmation, so nothing is finalised without it.
  // Only while this editor is the screen in view; a phone has no keyboard for it.
  const finalizeShortcut = useRef(() => {});
  useEffect(() => {
    finalizeShortcut.current = () => {
      if (!draft.partyId || draft.lines.length === 0 || confirmFinalize || creditWarning) return;
      // Not over another sheet (picking an item, editing a line…): finish that first.
      if (editingLine || itemOpen || partyOpen || currencyOpen || posOpen || branchOpen) return;
      if (editingIssued) return void save(false);
      setSendAfter(false);
      requestFinalize();
    };
  });
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        // Held down, the key repeats: one finalise per press.
        if (e.repeat) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        finalizeShortcut.current();
      };
      // Capturing, so it still works from inside a text field, which keeps Enter to itself.
      document.addEventListener('keydown', onKey, true);
      return () => document.removeEventListener('keydown', onKey, true);
    }, []),
  );

  // Ctrl+S (⌘+S) saves the draft, as "Save draft" does; not over another sheet.
  useSaveShortcut(
    () => void save(false),
    !saving && !!draft.partyId && !confirmFinalize && !creditWarning && !editingLine && !itemOpen && !partyOpen && !currencyOpen && !posOpen && !branchOpen,
  );

  /* ---------------------------------------------------------------- */

  const renderParty = () => {
    const partyA11y = party
      ? tr(isPurchase ? 'sales:editor.changeSupplier' : 'sales:editor.changeCustomer')
      : tr(isPurchase ? 'sales:editor.selectSupplier' : 'sales:editor.selectCustomer');
    const partyDetails = party ? (
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
            <Badge label={tr('sales:editor.termsBadge', { days: party.paymentTermsDays })} tone="neutral" size="sm" />
            {party.currency !== baseCurrency ? <Badge label={party.currency} tone="info" size="sm" /> : null}
          </View>
        </View>
      </>
    ) : null;
    // Each field once; a phone stacks them in this order, a desktop lays them out as an invoice's head.
    // A desktop gives the party the page's whole width, as the bill-to block of an invoice: empty, a
    // slim dashed bar to pick one into; picked, who they are beside where it is billed and shipped to.
    type PartyLine = { text: string; icon?: IconName };
    const addressLines = (a?: Address): PartyLine[] =>
      a?.line1 ? [a.line1, a.line2, [a.city, a.postalCode].filter(Boolean).join(' – '), a.state].filter((l): l is string => !!l).map((text) => ({ text })) : [];
    const billTo = addressLines(party?.billingAddress);
    const shipTo = addressLines(party?.shippingAddress);
    const sameAddress = shipTo.map((l) => l.text).join() === billTo.map((l) => l.text).join();
    const contact: PartyLine[] = [];
    if (party?.phone) contact.push({ text: party.phone, icon: 'phone-outline' });
    if (party?.email) contact.push({ text: party.email, icon: 'email-outline' });
    const partyColumns = [
      billTo.length ? { label: tr('contacts:form.billingAddress'), lines: billTo } : null,
      shipTo.length && !sameAddress ? { label: tr('contacts:form.shippingAddress'), lines: shipTo } : null,
      contact.length ? { label: tr('sales:editor.partyContact'), lines: contact } : null,
    ].filter((c): c is { label: string; lines: PartyLine[] } => !!c);
    const partyCard = desktop ? (
      <FieldShell label={tr(isPurchase ? 'common:table.supplier' : 'common:table.customer')} required>
        <Pressable
          style={(state) => {
            const { hovered, pressed, focused } = state as WebPressState;
            return [
              {
                flexDirection: 'row',
                alignItems: party ? 'stretch' : 'center',
                gap: t.spacing.lg,
                borderRadius: t.radius.md,
                borderWidth: party ? 1 : 1.5,
                borderStyle: party ? 'solid' : 'dashed',
                borderColor: hovered || pressed ? t.c.primary : t.c.inputBorder,
                backgroundColor: !party && (hovered || pressed) ? t.c.chip : t.c.paper,
                paddingHorizontal: t.spacing.lg,
                paddingVertical: party ? t.spacing.lg : t.spacing.md,
              } as const,
              focusRing(t, focused),
            ];
          }}
          onPress={() => setPartyOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={partyA11y}
        >
          {party ? (
            <>
              <View style={{ flex: 1.3, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>{partyDetails}</View>
              {partyColumns.map((c) => (
                <View key={c.label} style={{ flex: 1, minWidth: 0, gap: 3, paddingLeft: t.spacing.lg, borderLeftWidth: 1, borderLeftColor: t.c.line }}>
                  <Text variant="caption" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {c.label}
                  </Text>
                  {c.lines.map((l, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {l.icon ? <Icon name={l.icon} size={14} color={t.c.muted} /> : null}
                      <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>
                        {l.text}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
              <View style={{ justifyContent: 'center' }}>
                <Icon name="chevron-right" size={20} color={t.c.muted} />
              </View>
            </>
          ) : (
            <>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.chip, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="account-plus-outline" size={20} color={t.c.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="body" weight="600" tone="primary">
                  {tr(isPurchase ? 'sales:editor.selectSupplier' : 'sales:editor.selectCustomer')}
                </Text>
                <Text variant="caption" tone="muted">{tr('sales:editor.partySearch')}</Text>
              </View>
              <Icon name="chevron-right" size={20} color={t.c.muted} />
            </>
          )}
        </Pressable>
      </FieldShell>
    ) : (
      <Pressable onPress={() => setPartyOpen(true)} accessibilityRole="button" accessibilityLabel={partyA11y}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          {party ? (
            partyDetails
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
                <Icon name="account-plus-outline" size={22} color={t.c.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="600">
                  {tr(isPurchase ? 'sales:editor.selectSupplier' : 'sales:editor.selectCustomer')}
                </Text>
                <Text variant="caption" tone="muted">{tr('sales:editor.partySearch')}</Text>
              </View>
            </>
          )}
          <Icon name="chevron-right" size={20} color={t.c.muted} />
        </Card>
      </Pressable>
    );
    const dateField = (
      <DateField
        label={tr('common:documentEditor.dateLabel', { kind: kindName })}
        value={draft.date}
        // The due date (or validity) keeps its distance from the document date when that moves.
        onChange={(date) =>
          patch({
            date,
            ...(draft.dueDate && (kind === 'invoice' || kind === 'purchaseBill') ? { dueDate: addDaysISO(date, Math.max(0, daysBetween(draft.date, draft.dueDate))) } : {}),
            ...(draft.validUntil && (kind === 'quote' || kind === 'proforma') ? { validUntil: addDaysISO(date, Math.max(0, daysBetween(draft.date, draft.validUntil))) } : {}),
          })
        }
        required
        error={dateBeforeSource ?? dateBeforeOpeningStock}
      />
    );
    const dueField =
      kind === 'invoice' || kind === 'purchaseBill' ? (
        <DateField
          label={tr('sales:editor.dueDate')}
          value={draft.dueDate ?? addDaysISO(draft.date, 30)}
          onChange={(dueDate) => patch({ dueDate })}
          minimumDate={parseDate(draft.date)}
          error={dueBeforeDate}
          hint={party ? tr('sales:editor.termsHint', { name: party.name, days: party.paymentTermsDays }) : undefined}
        />
      ) : null;
    const validField =
      kind === 'quote' || kind === 'proforma' ? (
        <DateField
          label={tr('sales:editor.validUntil')}
          value={draft.validUntil ?? addDaysISO(draft.date, 15)}
          onChange={(validUntil) => patch({ validUntil })}
          minimumDate={parseDate(draft.date)}
          error={validBeforeDate}
        />
      ) : null;
    const supplierDocField = isPurchase ? (
      <TextField
        label={tr('sales:editor.supplierDocNumber')}
        value={draft.supplierDocNumber}
        onChangeText={(supplierDocNumber) => patch({ supplierDocNumber })}
        placeholder={tr('sales:editor.supplierDocPlaceholder')}
        icon="pound"
      />
    ) : null;
    const referenceField = (
      <TextField
        label={tr('sales:editor.reference')}
        value={draft.reference}
        onChangeText={(reference) => patch({ reference })}
        placeholder={tr('sales:editor.referencePlaceholder')}
        icon="link-variant"
      />
    );
    const branchField = branches.length > 1 ? <PickerField label={tr('sales:editor.branch')} value={branch?.name} onPress={() => setBranchOpen(true)} icon="warehouse" /> : null;
    const posField =
      taxContext.regime === 'GST' ? (
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
                ? tr('sales:editor.interStateHint')
                : tr('sales:editor.intraStateHint')
          }
        />
      ) : null;
    // Multi-currency is a full-plan module; a document already in another currency still shows it.
    const currencyField =
      hasFx || draft.currency !== baseCurrency ? (
        <PickerField
          label={tr('sales:editor.currency')}
          value={`${draft.currency}${draft.currency !== baseCurrency ? ` · 1 ${draft.currency} = ${draft.exchangeRate.toFixed(4)} ${baseCurrency}` : ''}`}
          onPress={() => setCurrencyOpen(true)}
          icon="cash-multiple"
        />
      ) : null;
    const noteReasonField = isNote ? (
      <PickerField
        label={tr('sales:editor.noteReason')}
        value={draft.noteReason ? tr(`domain:noteReason.${draft.noteReason}`) : undefined}
        onPress={() => setReasonOpen(true)}
        icon="text-box-outline"
        hint={tr('sales:editor.noteReasonHint')}
      />
    ) : null;
    const fxField =
      draft.currency !== baseCurrency ? (
        <TextField
          label={`${tr('common:totals.exchangeRate')} (1 ${draft.currency} → ${baseCurrency})`}
          {...rateText}
          keyboardType="decimal-pad"
          icon="swap-horizontal"
          hint={tr('sales:editor.rateStored')}
        />
      ) : null;
    const isdField =
      kind === 'purchaseBill' && !imported && party?.taxId ? (
        <SwitchField label={tr('purchases:isd.label')} description={tr('purchases:isd.hint')} value={!!draft.isdInvoice} onValueChange={(isdInvoice) => patch({ isdInvoice })} />
      ) : null;
    const directNoteBlock = directNote ? (
      <View style={{ gap: t.spacing.sm }}>
        <Text variant="small" tone="muted" weight="500">
          {tr('sales:editor.noteGst.label')}
        </Text>
        <Segmented
          options={[
            { value: 'withGst', label: tr('sales:editor.noteGst.withGst') },
            { value: 'noGst', label: tr('sales:editor.noteGst.noGst') },
          ]}
          value={draft.noteGst ?? 'withGst'}
          onChange={(v) => patch({ noteGst: v as 'withGst' | 'noGst' })}
        />
        <Text variant="caption" tone="muted">
          {tr(draft.noteGst === 'noGst' ? 'sales:editor.noteGst.noGstHint' : 'sales:editor.noteGst.withGstHint')}
        </Text>
        {draft.noteGst !== 'noGst' ? (
          <FieldRow>
            <TextField
              label={tr(isPurchase ? 'sales:editor.noteGst.originalBill' : 'sales:editor.noteGst.originalInvoice')}
              value={draft.originalNumber ?? ''}
              onChangeText={(originalNumber) => patch({ originalNumber })}
              icon="file-document-outline"
              maxLength={40}
            />
            <DateField
              label={tr('sales:editor.noteGst.originalDate')}
              value={draft.originalDate ?? ''}
              onChange={(originalDate) => patch({ originalDate })}
              maximumDate={new Date()}
            />
          </FieldRow>
        ) : null}
      </View>
    ) : null;

    if (!desktop) {
      return (
        <View style={{ gap: t.spacing.lg }}>
          {partyCard}
          {dateField}
          {dueField}
          {validField}
          {supplierDocField}
          {kind === 'purchaseBill' && imported ? (
            <View style={{ gap: t.spacing.sm }}>
              <Text variant="caption" tone="muted">{tr('purchases:boe.hint')}</Text>
              <TextField label={tr('purchases:boe.number')} value={boe.number} onChangeText={(number) => patchBoe({ number })} icon="file-certificate-outline" />
              <DateField label={tr('purchases:boe.date')} value={boe.date} onChange={(date) => patchBoe({ date })} maximumDate={new Date()} />
              <TextField label={tr('purchases:boe.port')} value={boe.portCode} onChangeText={(portCode) => patchBoe({ portCode: portCode.toUpperCase() })} maxLength={6} autoCapitalize="characters" icon="ferry" />
              <AmountField label={tr('purchases:boe.assessable')} value={boeAmount(boe.assessableValue)} onChangeValue={(v) => patchBoe({ assessableValue: fromMajor(v || '0', baseCurrency) })} currency={baseCurrency} />
              <AmountField label={tr('purchases:boe.igst')} value={boeAmount(boe.igst)} onChangeValue={(v) => patchBoe({ igst: fromMajor(v || '0', baseCurrency) })} currency={baseCurrency} />
              <AmountField label={tr('purchases:boe.cess')} value={boeAmount(boe.cess)} onChangeValue={(v) => patchBoe({ cess: fromMajor(v || '0', baseCurrency) })} currency={baseCurrency} />
            </View>
          ) : null}
          {isdField}
          {referenceField}
          {branchField}
          {posField}
          {currencyField}
          {noteReasonField}
          {directNoteBlock}
          {fxField}
        </View>
      );
    }

    // A desktop: who across the top, then the document's dates and numbers and where it is supplied,
    // in rows of equal columns: three to a row, or four when that leaves no row short.
    const fields = [dateField, dueField ?? validField ?? noteReasonField, supplierDocField, referenceField, branchField, posField, currencyField, fxField].filter(Boolean);
    const perRow = fields.length % 3 === 0 || fields.length % 4 !== 0 ? 3 : 4;
    const fieldRows: React.ReactNode[][] = [];
    for (let i = 0; i < fields.length; i += perRow) fieldRows.push(fields.slice(i, i + perRow));
    return (
      <View style={{ gap: t.spacing.lg }}>
        {partyCard}
        {fieldRows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.lg }}>
            {Array.from({ length: perRow }, (_, i) => (
              <View key={i} style={{ flex: 1, minWidth: 0 }}>
                {row[i] ?? null}
              </View>
            ))}
          </View>
        ))}
        {kind === 'purchaseBill' && imported ? (
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="caption" tone="muted">{tr('purchases:boe.hint')}</Text>
            <FieldRow>
              <TextField label={tr('purchases:boe.number')} value={boe.number} onChangeText={(number) => patchBoe({ number })} icon="file-certificate-outline" />
              <DateField label={tr('purchases:boe.date')} value={boe.date} onChange={(date) => patchBoe({ date })} maximumDate={new Date()} />
              <TextField label={tr('purchases:boe.port')} value={boe.portCode} onChangeText={(portCode) => patchBoe({ portCode: portCode.toUpperCase() })} maxLength={6} autoCapitalize="characters" icon="ferry" />
            </FieldRow>
            <FieldRow>
              <AmountField label={tr('purchases:boe.assessable')} value={boeAmount(boe.assessableValue)} onChangeValue={(v) => patchBoe({ assessableValue: fromMajor(v || '0', baseCurrency) })} currency={baseCurrency} />
              <AmountField label={tr('purchases:boe.igst')} value={boeAmount(boe.igst)} onChangeValue={(v) => patchBoe({ igst: fromMajor(v || '0', baseCurrency) })} currency={baseCurrency} />
              <AmountField label={tr('purchases:boe.cess')} value={boeAmount(boe.cess)} onChangeValue={(v) => patchBoe({ cess: fromMajor(v || '0', baseCurrency) })} currency={baseCurrency} />
            </FieldRow>
          </View>
        ) : null}
        {isdField}
        {directNoteBlock}
      </View>
    );
  };

  const renderItems = () => (
    <View style={{ gap: t.spacing.md }}>
      {/* With no lines yet, the empty state's own button is the one way to add; two would repeat. */}
      {draft.lines.length > 0 ? (
        <Button title={tr('sales:editor.addItem')} icon="plus" variant="secondary" onPress={() => setItemOpen(true)} fullWidth={!desktop} />
      ) : null}

      {kind === 'invoice' ? <BillableExpenses partyId={draft.partyId ?? undefined} currency={draft.currency} documentId={documentId} lines={draft.lines} onAdd={addLine} /> : null}

      {/* Whether rates are typed with tax in them, for the whole document; a line can still differ. */}
      {draft.lines.length > 0 && taxContext.regime !== 'NONE' ? (
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, flexWrap: 'wrap' }}>
            <Text variant="small" tone="muted" weight="500">
              {tr('sales:editor.amountsAre')}
            </Text>
            <View style={{ minWidth: 240 }}>
              <Segmented
                options={[
                  { value: 'exclusive', label: tr('sales:editor.taxExclusive') },
                  { value: 'inclusive', label: tr('sales:editor.taxInclusive') },
                ]}
                // Neither is picked while the lines disagree.
                value={inclusive === 'mixed' ? '' : inclusive}
                onChange={(v) => setPricesIncludeTax(v === 'inclusive')}
              />
            </View>
          </View>
          {inclusive === 'mixed' ? (
            <Text variant="caption" tone="warn">
              {tr('sales:editor.taxMixed')}
            </Text>
          ) : null}
        </View>
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
      ) : desktop ? (
        <LineGrid
          lines={draft.lines}
          currency={draft.currency}
          taxContext={docTaxContext}
          taxCategories={taxCategories}
          onUpdate={updateLine}
          onRemove={removeLine}
          onEdit={setEditingLine}
          onAddRequest={() => setItemOpen(true)}
          maxQuantity={(line) => maxReturnQty(line)}
          purchase={isPurchase}
        />
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
                  accessibilityLabel={tr('sales:editor.editLineNamed', { name: line.name })}
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
                      {line.name || tr('sales:editor.untitledLine')}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <Badge label={lineRateLabel(line)} tone="neutral" size="sm" />
                      {line.taxInclusive ? <Badge label={tr('sales:editor.inclusive')} tone="info" size="sm" /> : null}
                      {line.hsnCode ? <Badge label={`HSN ${line.hsnCode}`} tone="neutral" size="sm" /> : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text variant="body" weight="700" style={{ fontVariant: ['tabular-nums'] }}>
                      {formatMoney(lineTotal)}
                    </Text>
                    <Icon name="pencil-outline" size={15} color={t.c.muted} />
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
                    {unitShortName(line.unit)} × {formatMoney(line.unitPrice)}
                    {/* A fixed discount is in major units, whatever the currency's decimals. */}
                    {line.discountValue > 0
                      ? ` · −${line.discountMode === 'percent' ? formatPercent(line.discountValue) : formatMoney(fromMajor(String(line.discountValue), draft.currency))}`
                      : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {/* A desktop has the full totals beside the lines, kept in view; a phone shows them here. */}
      {draft.lines.length > 0 && !desktop ? (
        <Card>
          <TotalsPanel
            totals={totals}
            currency={draft.currency}
            baseCurrency={baseCurrency}
            exchangeRate={draft.exchangeRate}
            compact
            tds={tdsRow}
            itc={itcBreakup}
            cess={cessRows}
          />
        </Card>
      ) : null}
    </View>
  );

  const renderExtras = () => (
    <View style={{ gap: t.spacing.lg }}>
      {/* Tax and bookkeeping details: kept off the first step so a phone's Who step is just who and when. */}
      {taxContext.regime === 'GST' && TAX_KINDS.includes(kind) ? (
        <SwitchField
          label={tr('sales:editor.reverseCharge')}
          description={tr(isPurchase ? 'sales:editor.reverseChargeBillHint' : 'sales:editor.reverseChargeSaleHint')}
          value={!!draft.reverseCharge}
          onValueChange={(reverseCharge) => patch({ reverseCharge })}
        />
      ) : null}
      {/* TDS kept on a bill, TDS a customer deducts and its rate, TCS on an invoice: two to a row on a desktop. */}
      <FieldGrid
        items={[
          billTds ? (
            <View style={{ gap: t.spacing.xs }}>
              <PickerField
                label={tr('purchases:tds.section')}
                value={tdsSectionLabel(draft.tdsSection ?? parties.find((p) => p.id === draft.partyId)?.tdsSection)}
                onPress={() => setTdsOpen(true)}
                icon="bank-minus"
                hint={draftTds ? tr('purchases:tds.willKeep', { amount: formatMoney(draftTds.amount), rate: formatPercent(draftTds.rate) }) : tr('purchases:tds.hint')}
              />
              {/* Without a TAN nothing is kept back: say so where the section is chosen, with the way to add one. */}
              {!company?.tan && (draft.tdsSection ?? parties.find((p) => p.id === draft.partyId)?.tdsSection ?? 'none') !== 'none' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, flexWrap: 'wrap' }}>
                  <Text variant="caption" tone="warn" style={{ flex: 1, minWidth: 180 }}>
                    {tr('purchases:tds.needsTan')}
                  </Text>
                  <Button title={tr('purchases:tds.addTan')} variant="ghost" size="sm" icon="office-building-cog-outline" onPress={() => router.push('/(app)/settings/company')} />
                </View>
              ) : null}
            </View>
          ) : null,
          saleTds ? (
            <PickerField
              label={tr('sales:tds.section')}
              value={tdsSectionLabel(saleSection)}
              onPress={() => setTdsOpen(true)}
              icon="bank-plus"
              hint={expectedTds ? tr('sales:tds.willDeduct', { amount: formatMoney(expectedTds.amount), net: formatMoney(subtract(totals.grandTotal, expectedTds.amount)) }) : tr('sales:tds.hint')}
            />
          ) : null,
          saleTds && saleSection && saleSection !== 'none' ? (
            <TextField
              label={tr('sales:tds.rate')}
              value={draft.tdsRate !== undefined ? String(draft.tdsRate) : ''}
              onChangeText={(v) => {
                const clean = v.replace(/[^0-9.]/g, '');
                patch({ tdsRate: clean === '' ? undefined : Math.min(Number(clean) || 0, 100) });
              }}
              placeholder={expectedTds ? String(expectedTds.rate) : '0'}
              keyboardType="decimal-pad"
              icon="percent-outline"
              hint={tr('sales:tds.rateHint')}
            />
          ) : null,
          kind === 'invoice' && tcsAskedOn(draft.date) ? (
            <PickerField
              label={tr('sales:tcs.section')}
              value={draft.tcsSection && draft.tcsSection !== 'none' ? `${tcsSection(draft.tcsSection)?.label ?? draft.tcsSection} · ${tcsSection(draft.tcsSection)?.nature ?? ''}` : tr('sales:tcs.none')}
              onPress={() => setTcsOpen(true)}
              icon="cash-plus"
              hint={totals.tcs ? tr('sales:tcs.willCollect', { amount: formatMoney(totals.tcs) }) : tr('sales:tcs.hint')}
            />
          ) : null,
        ]}
      />

      {desktop ? (
        // Each only when it shows: the fields hide themselves when the business has none.
        <FieldGrid
          items={[
            hasCostCentres || draft.costCentreId ? <CostCentreField value={draft.costCentreId} onChange={(costCentreId) => patch({ costCentreId })} /> : null,
            VEHICLE_KINDS.includes(kind) && (hasVehicles || draft.vehicleId) ? <VehicleField value={draft.vehicleId} onChange={(vehicleId) => patch({ vehicleId })} /> : null,
          ]}
        />
      ) : (
        <>
          <CostCentreField value={draft.costCentreId} onChange={(costCentreId) => patch({ costCentreId })} />
          {/* A vehicle goes with goods on the move, not on a quote or a note. */}
          {VEHICLE_KINDS.includes(kind) ? <VehicleField value={draft.vehicleId} onChange={(vehicleId) => patch({ vehicleId })} /> : null}
        </>
      )}
      <CustomFieldsSection entity="document" values={draft.customFields ?? {}} onChange={(customFields) => patch({ customFields })} errors={showFieldErrors ? fieldErrors : undefined} />
      {/* Where the customer pays: the company's account, as the PDF prints it. Set in settings, not per document. */}
      {kind === 'invoice' || kind === 'quote' || kind === 'proforma' || kind === 'salesOrder' ? (
        <Card variant="flat" style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <Icon name="bank-outline" size={18} color={t.c.muted} />
            <Text variant="caption" tone="muted" weight="600" style={{ flex: 1 }}>
              {tr('sales:editor.bankCard')}
            </Text>
            <Button
              title={company?.bankDetails ? tr('sales:editor.bankEdit') : tr('sales:editor.bankAdd')}
              variant="ghost"
              size="sm"
              onPress={() => router.push('/(app)/settings/company')}
            />
          </View>
          {company?.bankDetails ? (
            <>
              <Text variant="small">
                {[
                  company.bankDetails.bankName,
                  company.bankDetails.accountNumber ? `•••• ${company.bankDetails.accountNumber.slice(-4)}` : undefined,
                  company.bankDetails.ifsc,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {company.bankDetails.upiId && draft.currency === 'INR' && kind === 'invoice' ? (
                <Text variant="caption" tone="muted">
                  {`${company.bankDetails.upiId} · ${tr('sales:editor.bankUpiQr')}`}
                </Text>
              ) : null}
            </>
          ) : (
            <Text variant="caption" tone="muted">
              {tr('sales:editor.bankNone')}
            </Text>
          )}
        </Card>
      ) : null}
      {/* Two short amounts side by side on a desktop; a phone stacks them as before. */}
      <FieldRow>
        <View style={{ gap: 6 }}>
          <Text variant="caption" tone="muted" weight="600">{tr('sales:editor.discountOnTotal')}</Text>
          <View style={{ flexDirection: 'row', gap: t.spacing.md, alignItems: 'stretch' }}>
            {/* Full size, as tall as the amount box beside it. */}
            <Segmented
              options={[
                { value: 'percent', label: '%' },
                { value: 'amount', label: draft.currency },
              ]}
              value={draft.documentDiscountMode}
              onChange={(v) => patch({ documentDiscountMode: v as 'percent' | 'amount' })}
              style={{ width: 130, justifyContent: 'center' }}
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
              accessibilityLabel={`${tr('sales:editor.discountOnTotal')} (${draft.documentDiscountMode === 'percent' ? '%' : draft.currency})`}
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
          // From CHARGES_TAXED_FROM the charges are part of the taxable value (RULES 1.10).
          hint={tr(draft.date >= CHARGES_TAXED_FROM ? 'sales:editor.otherChargesTaxedHint' : 'sales:editor.otherChargesHint')}
          allowNegative
        />
      </FieldRow>

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
            <FieldRow>
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
            </FieldRow>
          )}
        </View>
      )}

      <FieldRow>
      <TextField
        label={tr('sales:editor.notes')}
        value={draft.notes}
        onChangeText={(notes) => patch({ notes })}
        hint={tr('sales:editor.notesHint')}
        multiline
      />

      <TextField
        label={tr('sales:editor.terms')}
        value={draft.terms}
        onChangeText={(terms) => patch({ terms })}
        placeholder={tr('sales:editor.termsPlaceholder')}
        multiline
      />
      </FieldRow>

      {/* A desktop keeps the totals in the summary beside the form; shown here too, they'd be there twice. */}
      {desktop ? null : (
        <Card>
          <TotalsPanel
            totals={totals}
            currency={draft.currency}
            baseCurrency={baseCurrency}
            exchangeRate={draft.exchangeRate}
            compact
            tds={tdsRow}
            itc={itcBreakup}
            cess={cessRows}
          />
        </Card>
      )}
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
              {/* An issued document keeps its number; a draft gets one when it is finalised. */}
              {existing && isFinalized(existing.status) ? existing.number : documentId ? tr('common:documentList.draftNumber') : nextNumberFor(kind as never)}
            </Text>
          </View>
          <Badge label={taxBadge} tone="info" />
        </View>

        <View style={{ height: 1, backgroundColor: t.c.line }} />

        {[
          { label: tr(isPurchase ? 'common:table.supplier' : 'common:table.customer'), value: party?.name ?? '—' },
          { label: tr('common:table.date'), value: formatDate(draft.date) },
          ...(draft.dueDate ? [{ label: tr('common:table.due'), value: formatDate(draft.dueDate) }] : []),
          ...(draft.validUntil ? [{ label: tr('sales:editor.validUntil'), value: formatDate(draft.validUntil) }] : []),
          { label: tr('sales:editor.branch'), value: branch?.name ?? '—' },
          { label: tr('sales:editor.lines'), value: String(draft.lines.length) },
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
          tds={tdsRow}
          itc={itcBreakup}
          cess={cessRows}
        />
      </Card>

      {/* Shown on the draft too, not only when finalising. */}
      {creditNotice ? (
        <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
          <Icon name="alert-outline" size={19} color={t.c.warn} />
          <Text variant="caption" tone="warn" style={{ flex: 1, lineHeight: 18 }}>
            {creditNotice}
          </Text>
        </Card>
      ) : null}

      <Card variant="flat" style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <Icon name="information-outline" size={19} color={t.c.muted} />
        <Text variant="caption" tone="muted" style={{ flex: 1, lineHeight: 18 }}>
          {/* Every kind that moves stock: returns and receipts as well as invoices and deliveries. */}
          {tr(movesStock && hasInventory ? 'sales:editor.finaliseNoteStock' : 'sales:editor.finaliseNote')}
        </Text>
      </Card>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* The whole page column, so the page header's buttons line up with the summary beside the form. */}
      <FormContainer wide style={desktop ? { maxWidth: '100%' } : undefined}>
        {desktop ? (
          <>
            <Stack.Screen
              options={{
                headerRight: () => (
                  editingIssued ? (
                    <Button shortcut="S" title={tr('sales:editor.saveChanges')} icon="content-save-outline" onPress={() => void save(false)} loading={saving} disabled={blocked || !draft.partyId || draft.lines.length === 0} />
                  ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                    <Button shortcut="S" title={tr('sales:editor.saveDraft')} variant="ghost" onPress={() => void save(false)} loading={saving} disabled={blocked || !draft.partyId} />
                    {canSend && !onSaved ? (
                      <Button
                        title={tr('sales:editor.saveAndSend')}
                        tooltip={tr('sales:editor.saveAndSendHint')}
                        icon="email-fast-outline"
                        variant="secondary"
                        onPress={() => {
                          setSendAfter(true);
                          requestFinalize();
                        }}
                        loading={saving}
                        disabled={blocked || !draft.partyId || draft.lines.length === 0}
                      />
                    ) : null}
                    <Button
                      shortcut="Enter"
                      title={finaliseLabel}
                      icon="check-decagram-outline"
                      onPress={() => {
                        setSendAfter(false);
                        requestFinalize();
                      }}
                      loading={saving}
                      disabled={blocked || !draft.partyId || draft.lines.length === 0}
                    />
                  </View>
                  )
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
                // The totals and what's left to fill in stay beside a long list of lines.
                stickySide
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
          {/* A draft can be kept from any step, not only the last; the last has it in the footer. */}
          <Stack.Screen
            options={{
              headerRight:
                step < STEPS.length - 1 && !editingIssued
                  ? () => <Button title={tr('sales:editor.saveDraft')} variant="ghost" size="sm" onPress={() => void save(false)} loading={saving} disabled={blocked || !draft.partyId} />
                  : undefined,
            }}
          />
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
            onLayout={onFooterLayout}
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

            {/* Save & send, as on a desktop: finalised, then emailed from the document. */}
            {step === STEPS.length - 1 && !editingIssued && canSend && !onSaved ? (
              <Button
                title={tr('sales:editor.saveAndSend')}
                icon="email-fast-outline"
                variant="secondary"
                onPress={() => {
                  setSendAfter(true);
                  requestFinalize();
                }}
                loading={saving}
                disabled={blocked || !draft.partyId || draft.lines.length === 0}
                fullWidth
              />
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
                editingIssued ? (
                  <Button shortcut="S" title={tr('sales:editor.saveChanges')} onPress={() => void save(false)} loading={saving} disabled={blocked} style={{ flex: 1 }} />
                ) : (
                <>
                  <Button shortcut="S" title={tr('sales:editor.saveDraft')} variant="ghost" onPress={() => void save(false)} loading={saving} disabled={blocked} style={{ flex: 1 }} />
                  <Button
                    title={finaliseLabel}
                    onPress={() => {
                      setSendAfter(false);
                      requestFinalize();
                    }}
                    loading={saving}
                    disabled={blocked}
                    style={{ flex: 1 }}
                  />
                </>
                )
              )}
            </View>
          </View>
          </>
        )}

        {/* ---------------- sheets ---------------- */}

        <SelectSheet
          visible={tdsOpen}
          onClose={() => setTdsOpen(false)}
          title={saleTds ? tr('sales:tds.section') : tr('purchases:tds.section')}
          options={[{ value: 'none', label: tr('purchases:tds.none') }, ...TDS_SECTIONS.map((x) => ({ value: x.code, label: x.label, description: x.nature, trailing: formatPercent(x.rateOther) }))]}
          value={draft.tdsSection ?? parties.find((p) => p.id === draft.partyId)?.tdsSection ?? 'none'}
          // A new section takes its own rate, unless the person types another.
          onSelect={(v) => patch(saleTds ? { tdsSection: v, tdsRate: undefined } : { tdsSection: v })}
          searchable={false}
        />
        <SelectSheet
          visible={tcsOpen}
          onClose={() => setTcsOpen(false)}
          title={tr('sales:tcs.section')}
          options={[{ value: 'none', label: tr('sales:tcs.none') }, ...TCS_SECTIONS.map((x) => ({ value: x.code, label: x.label, description: x.nature, trailing: formatPercent(x.rate) }))]}
          value={draft.tcsSection ?? 'none'}
          onSelect={(v) => patch({ tcsSection: v })}
          searchable={false}
        />
        <SelectSheet
          visible={reasonOpen}
          onClose={() => setReasonOpen(false)}
          title={tr('sales:editor.noteReason')}
          options={NOTE_REASONS.map((r) => ({ value: r, label: tr(`domain:noteReason.${r}`) }))}
          value={draft.noteReason}
          onSelect={(r) => patch({ noteReason: r as NoteReason })}
          searchable={false}
        />
        <SelectSheet
          visible={partyOpen}
          onClose={() => setPartyOpen(false)}
          title={tr(isPurchase ? 'sales:editor.selectSupplier' : 'sales:editor.selectCustomer')}
          options={partyOptions.map((p) => ({
            value: p.id!,
            label: p.name ?? '',
            description: [p.displayName, p.taxId, p.phone].filter(Boolean).join(' · '),
            trailing: p.currency && p.currency !== baseCurrency ? p.currency : undefined,
          }))}
          onQueryChange={setPartyQuery}
          loading={partySearch.isFetching}
          value={draft.partyId}
          onSelect={pickParty}
          searchPlaceholder={tr(isPurchase ? 'sales:editor.searchSuppliers' : 'sales:editor.searchCustomers')}
          footer={
            <Button
              title={tr(isPurchase ? 'sales:editor.addSupplier' : 'sales:editor.addCustomer')}
              variant="secondary"
              icon="plus"
              fullWidth={!desktop}
              onPress={() => {
                setPartyOpen(false);
                partiesBeforeAdd.current = new Set(parties.map((p) => p.id));
                router.push(isPurchase ? '/(app)/contacts/suppliers/new?then=back' : '/(app)/contacts/customers/new?then=back');
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
                  description: `${formatQty(l.quantity)} ${unitShortName(l.unit)} × ${formatMoney(l.unitPrice)}`,
                  trailing: lineRateLabel(l),
                }))
              : itemOptions.map((i) => ({
                  value: i.id,
                  label: i.name,
                  description: `${hasPos ? `${i.sku} · ` : ''}${formatMoney(isPurchase ? i.purchasePrice : i.salePrice)} / ${unitShortName(i.unit)}`,
                  trailing: formatPercent(taxCategories.find((c) => c.id === i.taxCategoryId)?.rate ?? 0),
                  note: stockNote(i),
                  blocked: openingStockBlock(i) ?? outOfStockBlock(i),
                }))
          }
          onQueryChange={sourceDoc ? undefined : setItemQuery}
          loading={!sourceDoc && itemSearch.isFetching}
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
              // An item is priced in base; the line takes the document's currency.
              const line = item && lineFromItem(item, isPurchase, taxCategories);
              if (line) addLine(newLineInclusive({ ...line, unitPrice: reprice(line.unitPrice, draft.currency, 1, draft.exchangeRate) }, draft));
            })
          }
          searchPlaceholder={tr('sales:editor.searchItems')}
          footer={
            sourceDoc ? undefined : (
              <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
                <Button
                  title={tr('sales:editor.oneOffLine')}
                  variant="ghost"
                  icon="pencil-plus-outline"
                  style={desktop ? undefined : { flex: 1 }}
                  onPress={() => {
                    // Added to the draft only when saved, so closing the sheet leaves no blank line behind.
                    setItemOpen(false);
                    setEditingLine(newLineInclusive(blankLine(draft.currency, taxCategories), draft));
                  }}
                />
                <Button
                  title={tr('sales:editor.newItem')}
                  variant="secondary"
                  icon="plus"
                  style={desktop ? undefined : { flex: 1 }}
                  onPress={() => {
                    setItemOpen(false);
                    router.push(`/(app)/catalog/items/new?from=${FROM_DOCUMENT}` as never);
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
          purchase={isPurchase}
        />

        <ConfirmDialog
          visible={!!creditWarning}
          title={tr('sales:editor.creditLimitTitle')}
          message={creditWarning ?? ''}
          confirmLabel={tr('sales:editor.creditLimitProceed')}
          icon="alert-outline"
          onCancel={() => {
            setCreditWarning(null);
            setCreditOnEdit(false);
            setSendAfter(false);
          }}
          onConfirm={() => {
            setCreditWarning(null);
            if (creditOnEdit) {
              setCreditOnEdit(false);
              void save(false, { overrideCreditLimit: true });
              return;
            }
            setCreditOverride(true);
            setConfirmFinalize(true);
          }}
        />

        <ConfirmDialog
          visible={confirmFinalize}
          title={tr('common:documentEditor.finaliseTitle', { kind: kindName })}
          message={tr('common:documentEditor.finaliseMessage', { kind: kindName })}
          confirmLabel={sendAfter ? tr('sales:editor.saveAndSend') : finaliseLabel}
          icon={sendAfter ? 'email-fast-outline' : 'check-decagram-outline'}
          onCancel={() => {
            setConfirmFinalize(false);
            setSendAfter(false);
          }}
          onConfirm={() => {
            setConfirmFinalize(false);
            void save(true);
          }}
        />
        {leaveGuard.dialog}
      </FormContainer>
    </KeyboardAvoidingView>
  );
}

export function detailRouteFor(kind: DocumentKind, id: string): string {
  const map: Record<DocumentKind, string> = {
    invoice: '/(app)/sales/invoices',
    quote: '/(app)/sales/quotes',
    proforma: '/(app)/sales/proformas',
    salesOrder: '/(app)/sales/orders',
    delivery: '/(app)/sales/deliveries',
    salesReturn: '/(app)/sales/returns',
    purchaseOrder: '/(app)/purchases/orders',
    goodsReceipt: '/(app)/purchases/receipts',
    purchaseBill: '/(app)/purchases/bills',
    purchaseReturn: '/(app)/purchases/returns',
    creditNote: '/(app)/sales/credit-notes',
    debitNote: '/(app)/sales/debit-notes',
    supplierCreditNote: '/(app)/purchases/credit-notes',
    supplierDebitNote: '/(app)/purchases/debit-notes',
    // No editor of their own: an opening invoice or bill opens as the document itself.
    openingInvoice: '/(app)/documents',
    openingBill: '/(app)/documents',
  };
  return `${map[kind]}/${id}`;
}

export function listRouteFor(kind: DocumentKind): string {
  return detailRouteFor(kind, '').replace(/\/$/, '');
}

export { emptyDraft };
