import { useCallback, useMemo, useState } from 'react';
import { BusinessDocument, DiscountMode, DocumentKind, DocumentLine, Item, NoteReason, Party, TaxCategory } from '@esmart/core/types';
import { Money, fromMajor, money, zero } from '@esmart/core/lib/money';
import { addDaysISO, today } from '@esmart/core/lib/date';
import { uid } from '@esmart/core/lib/id';
import { calculateDocument } from '@esmart/core/domain/lineCalc';
import { TaxContext } from '@esmart/core/domain/taxEngine';

export type DraftState = {
  partyId: string | null;
  date: string;
  dueDate?: string;
  validUntil?: string;
  reference: string;
  supplierDocNumber: string;
  currency: string;
  exchangeRate: number;
  lines: DocumentLine[];
  documentDiscountMode: DiscountMode;
  documentDiscountValue: number;
  charges: Money;
  applyRoundOff: boolean;
  roundOffManual?: Money;
  placeOfSupplyStateCode?: string;
  /** The whole document is under reverse charge: the buyer pays the GST. */
  reverseCharge?: boolean;
  /** Why a credit or debit note was raised. */
  noteReason?: NoteReason;
  /** A TDS section, `none`, or unset for the supplier's own. */
  tdsSection?: string;
  costCentreId?: string;
  notes: string;
  terms: string;
  attachmentIds: string[];
  branchId?: string;
  /** The invoice/bill a return (or conversion) was raised against. */
  sourceDocumentId?: string;
};

/** `invoiceTerms` is the default terms text for an invoice, in the user's language (`sales:editor.defaultTerms`). */
export function emptyDraft(baseCurrency: string, kind: DocumentKind, invoiceTerms = ''): DraftState {
  return {
    partyId: null,
    date: today(),
    dueDate: kind === 'invoice' || kind === 'purchaseBill' ? addDaysISO(today(), 30) : undefined,
    validUntil: kind === 'quote' ? addDaysISO(today(), 15) : undefined,
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
    currency: doc.currency,
    exchangeRate: doc.exchangeRate,
    lines: doc.lines.map((l) => ({ ...l })),
    documentDiscountMode: doc.documentDiscountMode,
    documentDiscountValue: doc.documentDiscountValue,
    charges: doc.charges,
    applyRoundOff: doc.applyRoundOff,
    roundOffManual: doc.roundOffManual,
    placeOfSupplyStateCode: doc.placeOfSupplyStateCode,
    reverseCharge: doc.reverseCharge,
    noteReason: doc.noteReason,
    // A stored bill keeps what it was worked out with.
    tdsSection: doc.tdsSection ?? doc.tds?.section ?? 'none',
    costCentreId: doc.costCentreId,
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
    ...(item.gst && { gst: { ...item.gst } }),
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
}) {
  const { kind, baseCurrency, taxCategories, taxContext, initial } = options;
  const [draft, setDraft] = useState<DraftState>(() => alignCurrency(initial ?? emptyDraft(baseCurrency, kind), baseCurrency));

  // A party in another currency moves the whole draft into it.
  const patch = useCallback(
    (p: Partial<DraftState>) => setDraft((d) => alignCurrency({ ...d, ...p }, baseCurrency)),
    [baseCurrency],
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

  const updateLine = useCallback((id: string, p: Partial<DocumentLine>) => {
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) }));
  }, []);

  const removeLine = useCallback((id: string) => {
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) }));
  }, []);

  const setCurrency = useCallback(
    (currency: string, rate: number) => {
      setDraft((d) => ({
        ...d,
        currency,
        exchangeRate: rate,
        charges: money(d.charges.minor, currency),
        applyRoundOff: currency === 'INR',
        roundOffManual: undefined,
        lines: d.lines.map((l) => ({ ...l, unitPrice: money(l.unitPrice.minor, currency) })),
      }));
    },
    [],
  );

  const totals = useMemo(
    () =>
      calculateDocument({
        lines: draft.lines,
        currency: draft.currency,
        baseCurrency,
        exchangeRate: draft.exchangeRate,
        documentDiscountMode: draft.documentDiscountMode,
        documentDiscountValue: draft.documentDiscountValue,
        charges: draft.charges,
        applyRoundOff: draft.applyRoundOff,
        roundOffManual: draft.roundOffManual,
        taxCategories,
        taxContext:
          typeof taxContext === 'function'
            ? taxContext(draft)
            : { ...taxContext, placeOfSupplyStateCode: draft.placeOfSupplyStateCode ?? taxContext.placeOfSupplyStateCode },
      }),
    [draft, baseCurrency, taxCategories, taxContext],
  );

  return { draft, setDraft, patch, addLine, updateLine, removeLine, setCurrency, totals };
}

export function parseAmount(value: string, currency: string): Money {
  return fromMajor(value, currency);
}

export function partyLabel(party: Party | undefined): string {
  if (!party) return '';
  return party.displayName ? `${party.name} · ${party.displayName}` : party.name;
}
