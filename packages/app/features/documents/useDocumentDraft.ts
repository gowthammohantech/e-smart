import { useCallback, useMemo, useState } from 'react';
import { BusinessDocument, ChargesKind, ShipTo, DiscountMode, DocumentKind, DocumentLine, Item, NoteReason, Party, TaxCategory } from '@esmart/core/types';
import { Money, factorOf, fromMajor, money, zero } from '@esmart/core/lib/money';
import { addDaysISO, today } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import { calculateDocument } from '@esmart/core/domain/lineCalc';
import { TaxContext, taxRateOn } from '@esmart/core/domain/taxEngine';
import { NOTE_KINDS } from '@esmart/core/domain/documentStates';
import type { CustomValues } from '@esmart/core/domain/customFields';

export type DraftState = {
  partyId: string | null;
  date: string;
  dueDate?: string;
  validUntil?: string;
  reference: string;
  supplierDocNumber: string;
  /** An import bill's bill of entry (customs IGST is its credit). */
  billOfEntry?: BusinessDocument['billOfEntry'];
  /** An Input Service Distributor's invoice: its credit is 3B 4A(4). */
  isdInvoice?: boolean;
  currency: string;
  exchangeRate: number;
  lines: DocumentLine[];
  documentDiscountMode: DiscountMode;
  documentDiscountValue: number;
  charges: Money;
  /** What the charges are for; unset is other charges. */
  chargesKind?: ChargesKind;
  /** The consignee, when the goods go somewhere other than the buyer's own address. */
  shipTo?: ShipTo;
  applyRoundOff: boolean;
  roundOffManual?: Money;
  placeOfSupplyStateCode?: string;
  /** The whole document is under reverse charge: the buyer pays the GST. */
  reverseCharge?: boolean;
  /** Why a credit or debit note was raised. */
  noteReason?: NoteReason;
  /** A direct note's GST treatment, and (with GST) the original invoice or bill it adjusts (RULES 6.24). */
  noteGst?: 'withGst' | 'noGst';
  /** With an SEZ party: IGST charged or none (LUT or bond); unset takes the default (`defaultCrossBorderTax`). */
  crossBorderTax?: 'withTax' | 'withoutTax';
  originalNumber?: string;
  originalDate?: string;
  /** A TDS section, `none`, or unset for the supplier's own (on an invoice, the customer's). */
  tdsSection?: string;
  /** On an invoice: the rate the customer will deduct at; unset takes the section's. */
  tdsRate?: number;
  costCentreId?: string;
  /** Values of the company's document fields, by field id. */
  customFields?: CustomValues;
  /** On an invoice: the TCS section (s.206C), or none. */
  tcsSection?: string;
  vehicleId?: string;
  notes: string;
  terms: string;
  attachmentIds: string[];
  branchId?: string;
  /** The invoice/bill a return (or conversion) was raised against. */
  sourceDocumentId?: string;
  /**
   * Rates are typed with tax included: the editor's whole-document switch. Lines
   * the editor creates from now on start that way (`newLineInclusive`). On the
   * device only; each line's own `taxInclusive` is what is saved.
   */
  pricesIncludeTax?: boolean;
};

/** A reimbursement is recovered at cost, with no tax, so it is never tax-inclusive. */
const takesInclusive = (l: DocumentLine) => !l.gst?.reimbursement;

/** A freshly made line (from an item, or blank) set as the whole-document switch says. */
export function newLineInclusive(line: DocumentLine, draft: Pick<DraftState, 'pricesIncludeTax'>): DocumentLine {
  return draft.pricesIncludeTax && takesInclusive(line) ? { ...line, taxInclusive: true } : line;
}

/** Whether the lines' rates include tax: all of them, none, or a mix. */
export function inclusiveState(lines: DocumentLine[]): 'inclusive' | 'exclusive' | 'mixed' {
  const taxed = lines.filter(takesInclusive);
  if (!taxed.length) return 'exclusive';
  const n = taxed.filter((l) => l.taxInclusive).length;
  return n === 0 ? 'exclusive' : n === taxed.length ? 'inclusive' : 'mixed';
}

/** `invoiceTerms` is the default terms text for an invoice, in the user's language (`sales:editor.defaultTerms`). */
export function emptyDraft(baseCurrency: string, kind: DocumentKind, invoiceTerms = ''): DraftState {
  return {
    partyId: null,
    date: today(),
    dueDate: kind === 'invoice' || kind === 'purchaseBill' ? addDaysISO(today(), 30) : undefined,
    validUntil: kind === 'quote' || kind === 'proforma' ? addDaysISO(today(), 15) : undefined,
    reference: '',
    supplierDocNumber: '',
    currency: baseCurrency,
    exchangeRate: 1,
    lines: [],
    documentDiscountMode: 'amount',
    documentDiscountValue: 0,
    charges: zero(baseCurrency),
    applyRoundOff: baseCurrency === 'INR',
    notes: '',
    terms: kind === 'invoice' ? invoiceTerms : '',
    attachmentIds: [],
  };
}

export function draftFromDocument(doc: BusinessDocument): DraftState {
  return {
    partyId: doc.partyId,
    date: doc.date,
    dueDate: doc.dueDate,
    validUntil: doc.validUntil,
    reference: doc.reference ?? '',
    supplierDocNumber: doc.supplierDocNumber ?? '',
    billOfEntry: doc.billOfEntry,
    isdInvoice: doc.isdInvoice,
    currency: doc.currency,
    exchangeRate: doc.exchangeRate,
    lines: doc.lines.map((l) => ({ ...l })),
    documentDiscountMode: doc.documentDiscountMode,
    documentDiscountValue: doc.documentDiscountValue,
    charges: doc.charges,
    chargesKind: doc.chargesKind,
    shipTo: doc.shipTo ?? undefined,
    applyRoundOff: doc.applyRoundOff,
    roundOffManual: doc.roundOffManual,
    placeOfSupplyStateCode: doc.placeOfSupplyStateCode,
    reverseCharge: doc.reverseCharge,
    noteReason: doc.noteReason,
    noteGst: doc.noteGst,
    crossBorderTax: doc.crossBorderTax,
    originalNumber: doc.originalNumber,
    originalDate: doc.originalDate,
    // A stored bill keeps what it was worked out with.
    tdsSection: doc.tdsSection ?? doc.tds?.section ?? doc.tdsExpected?.section ?? 'none',
    tdsRate: doc.tdsRate ?? doc.tdsExpected?.rate,
    costCentreId: doc.costCentreId,
    customFields: doc.customFields,
    tcsSection: doc.tcs?.section,
    vehicleId: doc.vehicleId,
    notes: doc.notes ?? '',
    terms: doc.terms ?? '',
    attachmentIds: [...doc.attachmentIds],
    branchId: doc.branchId,
    sourceDocumentId: doc.sourceDocumentId,
  };
}

export function lineFromItem(item: Item, isPurchase: boolean, taxCategories: TaxCategory[]): DocumentLine {
  const category = taxCategories.find((c) => c.id === item.taxCategoryId);
  // Nil-rated, exempt and non-GST supplies, and reimbursements, are charged at 0% (as the server does).
  const taxable = !item.gst?.reimbursement && (item.gst?.supplyType ?? 'taxable') === 'taxable';
  return {
    id: uid('ln'),
    itemId: item.id,
    name: item.name,
    description: item.description,
    hsnCode: item.hsnCode,
    quantity: 1,
    unit: item.unit,
    unitPrice: isPurchase ? item.purchasePrice : item.salePrice,
    discountMode: 'amount',
    discountValue: 0,
    taxCategoryId: item.taxCategoryId,
    taxRate: taxable ? (category?.rate ?? 0) : 0,
    taxInclusive: false,
    // The item's treatment is the line's default, set once here when it is picked: later edits on
    // the line (a bill's capital goods, credit or reverse charge) are the line's own and stay.
    ...(item.gst && { gst: { ...item.gst } }),
  };
}

/**
 * `amount` restated in `currency`, through the base currency: `fromRate` and
 * `toRate` are each side's units of base per one (1 for the base itself).
 */
export function reprice(amount: Money, currency: string, fromRate: number, toRate: number): Money {
  if (amount.currency === currency) return amount;
  const major = ((amount.minor / factorOf(amount.currency)) * fromRate) / (toRate || 1);
  return money(Math.round(major * factorOf(currency)), currency);
}

const roundTo = (v: number, currency: string) => Math.round(v * factorOf(currency)) / factorOf(currency);

/**
 * The draft moved to another currency. Every price, the charges and the fixed
 * discounts are converted at the rates, so a ₹120 item reads $1.37 on a USD
 * invoice rather than $120, and the server takes it: it wants every amount in
 * the document's currency. An amount not in the draft's currency, such as an
 * item's price, is taken as base.
 */
export function inCurrency(d: DraftState, currency: string, rate: number): DraftState {
  const rateOf = (m: Money) => (m.currency === d.currency ? d.exchangeRate : 1);
  const to = (m: Money) => reprice(m, currency, rateOf(m), rate);
  const same = d.currency === currency;
  const fixed = (v: number) => (same ? v : roundTo((v * d.exchangeRate) / (rate || 1), currency));
  return {
    ...d,
    currency,
    exchangeRate: rate,
    charges: to(d.charges),
    applyRoundOff: same ? d.applyRoundOff : currency === 'INR',
    roundOffManual: same ? d.roundOffManual : undefined,
    documentDiscountValue: d.documentDiscountMode === 'amount' ? fixed(d.documentDiscountValue) : d.documentDiscountValue,
    lines: d.lines.map((l) => ({
      ...l,
      unitPrice: to(l.unitPrice),
      discountValue: l.discountMode === 'amount' ? fixed(l.discountValue) : l.discountValue,
    })),
  };
}

/**
 * Puts every price on the draft in the draft's currency, which the server
 * insists on. A price in the base currency (an item's own price) is converted
 * at the draft's rate; any other mismatch is re-tagged, as picking a currency does.
 */
export function alignCurrency(d: DraftState, baseCurrency: string): DraftState {
  const to = (m: Money): Money => {
    if (m.currency === d.currency) return m;
    if (m.currency === baseCurrency && d.exchangeRate > 0) return money(Math.round(m.minor / d.exchangeRate), d.currency);
    return money(m.minor, d.currency);
  };
  if (d.charges.currency === d.currency && d.lines.every((l) => l.unitPrice.currency === d.currency)) return d;
  return { ...d, charges: to(d.charges), lines: d.lines.map((l) => ({ ...l, unitPrice: to(l.unitPrice) })) };
}

/**
 * Lines moved from one date to another: each still charging its category's rate on `from` takes
 * the category's rate on `to`. A line at a rate of its own (0% on a non-taxable supply, a rate the
 * list doesn't have) keeps it.
 */
export function reRated(lines: DocumentLine[], taxCategories: TaxCategory[], from: string, to: string): DocumentLine[] {
  return lines.map((l) => {
    const c = taxCategories.find((x) => x.id === l.taxCategoryId);
    if (!c || l.taxRate !== taxRateOn(c, from)) return l;
    const rate = taxRateOn(c, to);
    return rate === l.taxRate ? l : { ...l, taxRate: rate };
  });
}

export function blankLine(currency: string, taxCategories: TaxCategory[]): DocumentLine {
  const fallback = taxCategories.find((c) => c.rate === 18) ?? taxCategories[0];
  return {
    id: uid('ln'),
    name: '',
    quantity: 1,
    unit: 'NOS',
    unitPrice: zero(currency),
    discountMode: 'amount',
    discountValue: 0,
    taxCategoryId: fallback?.id ?? '',
    taxRate: fallback?.rate ?? 0,
    taxInclusive: false,
  };
}

export function useDocumentDraft(options: {
  kind: DocumentKind;
  baseCurrency: string;
  taxCategories: TaxCategory[];
  /** A fixed context, or one derived from the draft (party, place of supply, date). */
  taxContext: TaxContext | ((draft: DraftState) => TaxContext);
  initial?: DraftState;
  /** The TCS rate for the draft, given its total in base currency before TCS; 0 when none. */
  tcsRate?: (draft: DraftState, grandTotalBaseMinor: number) => number;
}) {
  const { kind, baseCurrency, taxCategories, taxContext, initial, tcsRate } = options;
  const [draft, setDraft] = useState<DraftState>(() => {
    const start = alignCurrency(initial ?? emptyDraft(baseCurrency, kind), baseCurrency);
    // An existing document opens with the switch where its lines are.
    return start.pricesIncludeTax === undefined && start.lines.length ? { ...start, pricesIncludeTax: inclusiveState(start.lines) === 'inclusive' } : start;
  });

  // A party in another currency moves the whole draft into it. A new date charges each line the
  // rate its category has on that day, as the server will (a return or note against an invoice
  // keeps the invoice's rates).
  const patch = useCallback(
    (p: Partial<DraftState>) =>
      setDraft((d) => {
        const next = { ...d, ...p };
        const keepsSourceRates = !!next.sourceDocumentId && (NOTE_KINDS.includes(kind) || kind === 'salesReturn' || kind === 'purchaseReturn');
        if (p.date && p.date !== d.date && !keepsSourceRates) next.lines = reRated(next.lines, taxCategories, d.date, p.date);
        return alignCurrency(next, baseCurrency);
      }),
    [baseCurrency, kind, taxCategories],
  );

  const addLine = useCallback((line: DocumentLine) => {
    setDraft((d) => {
      // Bump the quantity instead of duplicating a line for the same item.
      const existing = line.itemId ? d.lines.find((l) => l.itemId === line.itemId) : undefined;
      if (existing) {
        return {
          ...d,
          lines: d.lines.map((l) => (l.id === existing.id ? { ...l, quantity: l.quantity + line.quantity } : l)),
        };
      }
      return alignCurrency({ ...d, lines: [...d.lines, line] }, baseCurrency);
    });
  }, [baseCurrency]);

  /** The whole-document switch: every line's rate read with tax included (or not), and new lines alike. */
  const setPricesIncludeTax = useCallback((on: boolean) => {
    setDraft((d) => ({
      ...d,
      pricesIncludeTax: on,
      lines: d.lines.map((l) => (takesInclusive(l) ? { ...l, taxInclusive: on } : l)),
    }));
  }, []);

  const updateLine = useCallback((id: string, p: Partial<DocumentLine>) => {
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) }));
  }, []);

  const removeLine = useCallback((id: string) => {
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));
  }, []);

  const setCurrency = useCallback(
    (currency: string, rate: number) => {
      setDraft((d) => inCurrency(d, currency, rate));
    },
    [],
  );

  const totals = useMemo(() => {
    const input = {
        lines: draft.lines,
        currency: draft.currency,
        baseCurrency,
        exchangeRate: draft.exchangeRate,
        documentDiscountMode: draft.documentDiscountMode,
        documentDiscountValue: draft.documentDiscountValue,
        charges: draft.charges,
        applyRoundOff: draft.applyRoundOff,
        roundOffManual: draft.roundOffManual,
        // From CHARGES_TAXED_FROM the charges are taxed with the lines, as the server works it out.
        date: draft.date,
        taxCategories,
        taxContext:
          typeof taxContext === 'function'
            ? taxContext(draft)
            : { ...taxContext, placeOfSupplyStateCode: draft.placeOfSupplyStateCode ?? taxContext.placeOfSupplyStateCode },
    };
    const before = calculateDocument(input);
    // TCS, as the server works it: on the price with GST, at the section's rate for this buyer.
    const rate = tcsRate ? tcsRate(draft, before.grandTotalBase.minor) : 0;
    return rate > 0 ? calculateDocument({ ...input, tcsRate: rate }) : before;
  }, [draft, baseCurrency, taxCategories, taxContext, tcsRate]);

  return { draft, setDraft, patch, addLine, updateLine, removeLine, setCurrency, setPricesIncludeTax, totals };
}

export function parseAmount(value: string, currency: string): Money {
  return fromMajor(value, currency);
}

export function partyLabel(party: Party | undefined): string {
  if (!party) return '';
  return party.displayName ? `${party.name} · ${party.displayName}` : party.name;
}
