import { useCallback, useMemo, useState } from 'react';
import {
  BusinessDocument,
  DiscountMode,
  DocumentKind,
  DocumentLine,
  Item,
  Party,
  TaxCategory,
} from '@/types';
import { Money, fromMajor, money, zero } from '@/lib/money';
import { addDaysISO, today } from '@/lib/date';
import { uid } from '@/lib/id';
import { calculateDocument } from '@/domain/lineCalc';
import { TaxContext } from '@/domain/taxEngine';

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
  placeOfSupplyStateCode?: string;
  notes: string;
  terms: string;
  attachmentIds: string[];
  branchId?: string;
};

export function emptyDraft(baseCurrency: string, kind: DocumentKind): DraftState {
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
    documentDiscountMode: 'percent',
    documentDiscountValue: 0,
    charges: zero(baseCurrency),
    applyRoundOff: baseCurrency === 'INR',
    notes: '',
    terms:
      kind === 'invoice'
        ? 'Goods once sold will not be taken back. Interest @18% p.a. on overdue amounts.'
        : '',
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
    placeOfSupplyStateCode: doc.placeOfSupplyStateCode,
    notes: doc.notes ?? '',
    terms: doc.terms ?? '',
    attachmentIds: [...doc.attachmentIds],
    branchId: doc.branchId,
  };
}

export function lineFromItem(item: Item, isPurchase: boolean, taxCategories: TaxCategory[]): DocumentLine {
  const category = taxCategories.find((c) => c.id === item.taxCategoryId);
  return {
    id: uid('ln'),
    itemId: item.id,
    name: item.name,
    description: item.description,
    hsnCode: item.hsnCode,
    quantity: 1,
    unit: item.unit,
    unitPrice: isPurchase ? item.purchasePrice : item.salePrice,
    discountMode: 'percent',
    discountValue: 0,
    taxCategoryId: item.taxCategoryId,
    taxRate: category?.rate ?? 0,
    taxInclusive: false,
  };
}

export function blankLine(currency: string, taxCategories: TaxCategory[]): DocumentLine {
  const fallback = taxCategories.find((c) => c.rate === 18) ?? taxCategories[0];
  return {
    id: uid('ln'),
    name: '',
    quantity: 1,
    unit: 'NOS',
    unitPrice: zero(currency),
    discountMode: 'percent',
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
  taxContext: TaxContext;
  initial?: DraftState;
}) {
  const { kind, baseCurrency, taxCategories, taxContext, initial } = options;
  const [draft, setDraft] = useState<DraftState>(() => initial ?? emptyDraft(baseCurrency, kind));

  const patch = useCallback((p: Partial<DraftState>) => setDraft((d) => ({ ...d, ...p })), []);

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
      return { ...d, lines: [...d.lines, line] };
    });
  }, []);

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
        taxCategories,
        taxContext: { ...taxContext, placeOfSupplyStateCode: draft.placeOfSupplyStateCode ?? taxContext.placeOfSupplyStateCode },
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
