import { and, eq, inArray, lte } from 'drizzle-orm';
import { PURCHASE_KINDS, initialStatus } from '@esmart/core/domain/documentStates';
import { resolveRate } from '@esmart/core/domain/fx';
import { calculateDocument, calculateLine } from '@esmart/core/domain/lineCalc';
import { FULL_PLAN, hasModule } from '@esmart/core/domain/plan';
import { OTHER_COUNTRY_CODE } from '@esmart/core/domain/stateCodes';
import { buildTaxContext } from '@esmart/core/domain/taxEngine';
import { addDaysISO } from '@esmart/core/lib/date';
import type { Company, DocumentKind, DocumentLine, DocumentTotals, Party, TaxCategory } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import type { CompanyRow } from '../../context';
import { planUpgradeRequired, unprocessable, type Issue } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { addressFrom, iso } from '../../lib/wire';
import { partyToWire } from '../parties/wire';

export type DocRow = typeof schema.documents.$inferSelect;
export type LineRow = typeof schema.documentLines.$inferSelect;
export type PartyRow = typeof schema.parties.$inferSelect;

const D = schema.documents;

export const isPurchaseKind = (kind: DocumentKind) => PURCHASE_KINDS.includes(kind);

/** Buying-side documents belong to the purchases module (Pro and up). */
export function assertKindAllowed(company: CompanyRow, kind: DocumentKind) {
  if (isPurchaseKind(kind) && !hasModule(company.plan, 'purchases')) throw planUpgradeRequired(FULL_PLAN, 'purchases');
}

/** `INVOICE-DRAFT`, `SALESORDER-DRAFT`: what an unnumbered document carries. */
export const draftNumber = (kind: DocumentKind) => `${kind.toUpperCase()}-DRAFT`;

// ------------------------------------------------------------ core adapters

export function companyCore(row: CompanyRow): Company {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    legalName: row.legalName ?? undefined,
    businessType: row.businessType,
    country: row.country.trim(),
    baseCurrency: row.baseCurrency.trim(),
    address: addressFrom(row, 'address')!,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    taxRegistration: {
      regime: row.taxRegime,
      identifier: row.taxIdentifier ?? undefined,
      identifierLabel: row.taxIdentifierLabel,
      registered: row.taxRegistered,
      compositionScheme: row.compositionScheme,
      placeOfSupplyStateCode: row.placeOfSupplyStateCode ?? undefined,
    },
    fiscalYearStartMonth: row.fiscalYearStartMonth,
    plan: row.plan,
    createdAt: iso(row.createdAt)!,
  };
}

export function partyCore(row: PartyRow): Party {
  return { ...(partyToWire(row) as unknown as Party), id: row.id, companyId: row.companyId, code: row.code, createdAt: iso(row.createdAt)! };
}

function taxCategoryCore(row: typeof schema.taxCategories.$inferSelect): TaxCategory {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    rate: Number(row.rate),
    type: row.type,
    hsnCode: row.hsnCode ?? undefined,
    effectiveFrom: row.effectiveFrom,
    description: row.description ?? undefined,
  };
}

/**
 * The company's rate from `currency` to its base currency in effect on
 * `date` (`@esmart/core` fx resolveRate: the latest on or before the date,
 * direct or inverse), or null when it has none.
 */
export async function rateToBase(db: DbOrTx, companyId: string, currency: string, baseCurrency: string, date: string): Promise<number | null> {
  if (currency === baseCurrency) return 1;
  const R = schema.exchangeRates;
  const rows = await db.select().from(R).where(and(eq(R.companyId, companyId), lte(R.effectiveFrom, date)));
  const rates = rows.map((r) => ({ id: r.id, companyId: r.companyId, from: r.fromCurrency.trim(), to: r.toCurrency.trim(), rate: Number(r.rate), effectiveFrom: r.effectiveFrom, source: r.source }));
  const known = rates.some((r) => (r.from === currency && r.to === baseCurrency) || (r.from === baseCurrency && r.to === currency));
  return known ? resolveRate(rates, currency, baseCurrency, date) : null;
}

// ------------------------------------------------------------ inputs

/** A line as the engine takes it: the wire line, or a stored one being re-used. */
export type LineInput = {
  id?: string;
  itemId?: string | null;
  name: string;
  description?: string | null;
  hsnCode?: string | null;
  quantity: number;
  unit: string;
  unitPriceMinor: number;
  unitPriceCurrency?: string;
  discountMode: 'percent' | 'amount';
  discountValue: number;
  taxCategoryId: string;
  taxInclusive: boolean;
  /** Kept on finalised documents; recomputed from the category on drafts. */
  taxRate?: number;
};

/** The header of a document, after defaults are applied. */
export type DocFields = {
  kind: DocumentKind;
  partyId: string;
  branchId: string | null;
  date: string;
  dueDate: string | null;
  validUntil: string | null;
  reference: string | null;
  supplierDocNumber: string | null;
  currency: string;
  exchangeRate: number | null;
  documentDiscountMode: 'percent' | 'amount';
  documentDiscountValue: number;
  chargesMinor: number;
  chargesCurrency?: string;
  applyRoundOff: boolean | null;
  placeOfSupplyStateCode: string | null;
  notes: string | null;
  terms: string | null;
  sourceDocumentId: string | null;
};

export function linesFromWire(lines: Schema<'DocumentLine'>[]): LineInput[] {
  return lines.map((l) => ({
    id: l.id,
    itemId: l.itemId ?? null,
    name: l.name,
    description: l.description ?? null,
    hsnCode: l.hsnCode ?? null,
    quantity: l.quantity,
    unit: l.unit,
    unitPriceMinor: l.unitPrice.minor,
    unitPriceCurrency: l.unitPrice.currency,
    discountMode: l.discountMode ?? 'percent',
    discountValue: l.discountValue ?? 0,
    taxCategoryId: l.taxCategoryId,
    taxInclusive: l.taxInclusive ?? false,
  }));
}

export function linesFromRows(rows: LineRow[]): LineInput[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((l) => ({
      id: l.id,
      itemId: l.itemId,
      name: l.name,
      description: l.description,
      hsnCode: l.hsnCode,
      quantity: Number(l.quantity),
      unit: l.unit,
      unitPriceMinor: l.unitPriceMinor,
      discountMode: l.discountMode,
      discountValue: Number(l.discountValue),
      taxCategoryId: l.taxCategoryId,
      taxInclusive: l.taxInclusive,
      taxRate: Number(l.taxRate),
    }));
}

/** Header fields from a request body, falling back to `base` for what it leaves out. */
export function fieldsFromWire(body: Schema<'NewDocumentInput'>, base?: DocRow): DocFields {
  const keep = <T>(v: T | undefined, b: T | null | undefined): T | null => (v !== undefined ? v : (b ?? null));
  return {
    kind: body.kind,
    partyId: body.partyId,
    branchId: keep(body.branchId, base?.branchId),
    date: body.date,
    dueDate: keep(body.dueDate, base?.dueDate),
    validUntil: keep(body.validUntil, base?.validUntil),
    reference: keep(body.reference, base?.reference),
    supplierDocNumber: keep(body.supplierDocNumber, base?.supplierDocNumber),
    currency: body.currency,
    exchangeRate: body.exchangeRate ?? (base && base.currency.trim() === body.currency ? Number(base.exchangeRate) : null),
    documentDiscountMode: body.documentDiscountMode ?? base?.documentDiscountMode ?? 'percent',
    documentDiscountValue: body.documentDiscountValue ?? (base ? Number(base.documentDiscountValue) : 0),
    chargesMinor: body.charges?.minor ?? base?.chargesMinor ?? 0,
    chargesCurrency: body.charges?.currency,
    applyRoundOff: body.applyRoundOff ?? base?.applyRoundOff ?? null,
    placeOfSupplyStateCode: keep(body.placeOfSupplyStateCode, base?.placeOfSupplyStateCode),
    notes: keep(body.notes, base?.notes),
    terms: keep(body.terms, base?.terms),
    sourceDocumentId: keep(body.sourceDocumentId, base?.sourceDocumentId),
  };
}

export function fieldsFromRow(row: DocRow): DocFields {
  return {
    kind: row.kind,
    partyId: row.partyId,
    branchId: row.branchId,
    date: row.date,
    dueDate: row.dueDate,
    validUntil: row.validUntil,
    reference: row.reference,
    supplierDocNumber: row.supplierDocNumber,
    currency: row.currency.trim(),
    exchangeRate: Number(row.exchangeRate),
    documentDiscountMode: row.documentDiscountMode,
    documentDiscountValue: Number(row.documentDiscountValue),
    chargesMinor: row.chargesMinor,
    applyRoundOff: row.applyRoundOff,
    placeOfSupplyStateCode: row.placeOfSupplyStateCode,
    notes: row.notes,
    terms: row.terms,
    sourceDocumentId: row.sourceDocumentId,
  };
}

// ------------------------------------------------------------ preparation

export type Prepared = {
  /** Columns for `documents`, totals included. */
  columns: Omit<typeof D.$inferInsert, 'id' | 'companyId' | 'number' | 'status' | 'createdBy'>;
  lines: (Omit<typeof schema.documentLines.$inferInsert, 'documentId'> & { id: string })[];
  totals: DocumentTotals;
  party: PartyRow;
};

/**
 * Validates a document against the company's records and computes its
 * totals with `@esmart/core` (lineCalc + taxEngine): the party must be the
 * right kind, lines must use the company's tax categories and items, and
 * money must be in the document's currency. Nothing is written.
 *
 * `snapshotRates` takes each line's rate from its tax category (drafts);
 * otherwise the stored snapshot is kept, so a finalised document never
 * changes when a category does.
 */
export async function prepareDocument(
  db: DbOrTx,
  company: CompanyRow,
  f: DocFields,
  lines: LineInput[],
  opts: { snapshotRates: boolean },
): Promise<Prepared> {
  const issues: Issue[] = [];
  const blocking = (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });
  const baseCurrency = company.baseCurrency.trim();

  const [party] = await db.select().from(schema.parties).where(and(eq(schema.parties.companyId, company.id), eq(schema.parties.id, f.partyId)));
  if (!party) blocking('partyId', 'No such party in this company');
  else {
    const wanted = isPurchaseKind(f.kind) ? 'supplier' : 'customer';
    if (party.kind !== wanted) blocking('partyId', `A ${f.kind} needs a ${wanted}`);
  }

  let branchId = f.branchId;
  if (branchId) {
    const [b] = await db.select({ id: schema.branches.id }).from(schema.branches).where(and(eq(schema.branches.companyId, company.id), eq(schema.branches.id, branchId)));
    if (!b) blocking('branchId', 'No such branch in this company');
  } else {
    const branches = await db.select().from(schema.branches).where(eq(schema.branches.companyId, company.id));
    branchId = (branches.find((b) => b.isPrimary) ?? branches[0])?.id ?? null;
    if (!branchId) blocking('branchId', 'The company has no branch');
  }

  const [cur] = await db.select().from(schema.currencies).where(eq(schema.currencies.code, f.currency));
  if (!cur) blocking('currency', `Unknown currency ${f.currency}`);
  if (f.chargesCurrency && f.chargesCurrency !== f.currency) blocking('charges.currency', `Must be in the document's currency (${f.currency})`);

  if (f.sourceDocumentId) {
    const [src] = await db.select({ id: D.id }).from(D).where(and(eq(D.companyId, company.id), eq(D.id, f.sourceDocumentId)));
    if (!src) blocking('sourceDocumentId', 'No such document in this company');
  }

  const categories = (await db.select().from(schema.taxCategories).where(eq(schema.taxCategories.companyId, company.id))).map(taxCategoryCore);
  const itemIds = [...new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x))];
  const items = itemIds.length
    ? await db.select().from(schema.items).where(and(eq(schema.items.companyId, company.id), inArray(schema.items.id, itemIds)))
    : [];

  const coreLines: DocumentLine[] = lines.map((l, i) => {
    const category = categories.find((c) => c.id === l.taxCategoryId);
    if (!category) blocking(`lines[${i}].taxCategoryId`, 'No such tax category in this company');
    const item = l.itemId ? items.find((it) => it.id === l.itemId) : undefined;
    if (l.itemId && !item) blocking(`lines[${i}].itemId`, 'No such item in this company');
    if (l.unitPriceCurrency && l.unitPriceCurrency !== f.currency) blocking(`lines[${i}].unitPrice.currency`, `Must be in the document's currency (${f.currency})`);
    if (!(l.quantity > 0)) blocking(`lines[${i}].quantity`, 'Must be more than zero');
    if (l.unitPriceMinor < 0) blocking(`lines[${i}].unitPrice`, 'Cannot be negative');
    return {
      id: l.id ?? '',
      itemId: l.itemId ?? undefined,
      name: l.name,
      description: l.description ?? undefined,
      hsnCode: l.hsnCode ?? item?.hsnCode ?? undefined,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: { minor: l.unitPriceMinor, currency: f.currency },
      discountMode: l.discountMode,
      discountValue: l.discountValue,
      taxCategoryId: l.taxCategoryId,
      taxRate: opts.snapshotRates || l.taxRate === undefined ? (category?.rate ?? 0) : l.taxRate,
      taxInclusive: l.taxInclusive,
    };
  });

  // The rate to base: what the client sent, else the effective rate on the date.
  let exchangeRate = f.exchangeRate;
  if (f.currency === baseCurrency) exchangeRate = 1;
  else if (!exchangeRate) {
    exchangeRate = await rateToBase(db, company.id, f.currency, baseCurrency, f.date);
    if (!exchangeRate) blocking('exchangeRate', `No ${f.currency}→${baseCurrency} rate on or before ${f.date}; send exchangeRate`);
  }
  if (exchangeRate !== null && !(exchangeRate > 0)) blocking('exchangeRate', 'Must be more than zero');

  if (issues.length) throw unprocessable(issues);

  // Place of supply: what was sent, else the buyer's state, else "other
  // country" for a party abroad, else the company's own state.
  const partyCountry = party!.billingCountry.trim();
  const placeOfSupply =
    f.placeOfSupplyStateCode ??
    (party!.billingStateCode ||
      (partyCountry !== company.country.trim() ? OTHER_COUNTRY_CODE : company.placeOfSupplyStateCode) ||
      null);

  const coreCompany = companyCore(company);
  const taxContext = buildTaxContext(coreCompany, {
    placeOfSupply: placeOfSupply ?? undefined,
    party: partyCore(party!),
    date: f.date,
    purchase: isPurchaseKind(f.kind),
  });
  const applyRoundOff = f.applyRoundOff ?? f.currency === 'INR';
  const totals = calculateDocument({
    lines: coreLines,
    currency: f.currency,
    baseCurrency,
    exchangeRate: exchangeRate!,
    documentDiscountMode: f.documentDiscountMode,
    documentDiscountValue: f.documentDiscountValue,
    charges: { minor: f.chargesMinor, currency: f.currency },
    applyRoundOff,
    taxCategories: categories,
    taxContext,
  });

  // Invoices and bills fall due after the party's terms unless a date was given.
  const dueDate = f.dueDate ?? (f.kind === 'invoice' || f.kind === 'purchaseBill' ? addDaysISO(f.date, party!.paymentTermsDays) : null);

  return {
    party: party!,
    totals,
    columns: {
      branchId: branchId!,
      kind: f.kind,
      partyId: f.partyId,
      date: f.date,
      dueDate,
      validUntil: f.validUntil,
      reference: f.reference,
      supplierDocNumber: f.supplierDocNumber,
      currency: f.currency,
      exchangeRate: String(exchangeRate),
      documentDiscountMode: f.documentDiscountMode,
      documentDiscountValue: String(f.documentDiscountValue),
      chargesMinor: f.chargesMinor,
      applyRoundOff,
      placeOfSupplyStateCode: placeOfSupply,
      notes: f.notes,
      terms: f.terms,
      sourceDocumentId: f.sourceDocumentId,
      subtotalMinor: totals.subtotal.minor,
      lineDiscountMinor: totals.lineDiscount.minor,
      documentDiscountMinor: totals.documentDiscount.minor,
      taxableAmountMinor: totals.taxableAmount.minor,
      totalTaxMinor: totals.totalTax.minor,
      roundOffMinor: totals.roundOff.minor,
      grandTotalMinor: totals.grandTotal.minor,
      grandTotalBaseMinor: totals.grandTotalBase.minor,
    },
    lines: coreLines.map((l, i) => ({
      id: l.id || newId('dln'),
      position: i + 1,
      itemId: l.itemId ?? null,
      name: l.name,
      description: l.description ?? null,
      hsnCode: l.hsnCode ?? null,
      quantity: String(l.quantity),
      unit: l.unit,
      unitPriceMinor: l.unitPrice.minor,
      discountMode: l.discountMode,
      discountValue: String(l.discountValue),
      taxCategoryId: l.taxCategoryId,
      taxRate: String(l.taxRate),
      taxInclusive: l.taxInclusive,
      lineTotalMinor: calculateLine(l, f.currency, taxContext).total.minor,
    })),
  };
}

/**
 * Replaces a document's lines and tax breakdown with `prepared`. Line ids the
 * document already had are kept (so conversions can pick lines by id); any
 * other id is replaced by a fresh one.
 */
export async function writeLines(tx: DbOrTx, documentId: string, prepared: Prepared) {
  const existing = await tx.select({ id: schema.documentLines.id }).from(schema.documentLines).where(eq(schema.documentLines.documentId, documentId));
  const own = new Set(existing.map((l) => l.id));
  await deleteLines(tx, documentId);
  const seen = new Set<string>();
  const lines = prepared.lines.map((l) => {
    const id = own.has(l.id) && !seen.has(l.id) ? l.id : newId('dln');
    seen.add(id);
    return { ...l, id, documentId };
  });
  if (lines.length) await tx.insert(schema.documentLines).values(lines);

  for (const tl of prepared.totals.taxLines) {
    const taxLineId = newId('dtl');
    await tx.insert(schema.documentTaxLines).values({
      id: taxLineId,
      documentId,
      taxCategoryId: tl.categoryId,
      categoryName: tl.categoryName.slice(0, 100),
      rate: String(tl.rate),
      taxableAmountMinor: tl.taxableAmount.minor,
      totalTaxMinor: tl.totalTax.minor,
    });
    if (tl.components.length) {
      await tx.insert(schema.documentTaxComponents).values(
        tl.components.map((c) => ({ id: newId('dtc'), taxLineId, type: c.type, label: c.label.slice(0, 20), rate: String(c.rate), amountMinor: c.amount.minor })),
      );
    }
  }
}

export async function deleteLines(tx: DbOrTx, documentId: string) {
  const taxLines = await tx.select({ id: schema.documentTaxLines.id }).from(schema.documentTaxLines).where(eq(schema.documentTaxLines.documentId, documentId));
  if (taxLines.length) await tx.delete(schema.documentTaxComponents).where(inArray(schema.documentTaxComponents.taxLineId, taxLines.map((t) => t.id)));
  await tx.delete(schema.documentTaxLines).where(eq(schema.documentTaxLines.documentId, documentId));
  await tx.delete(schema.documentLines).where(eq(schema.documentLines.documentId, documentId));
}

/** The status a new document starts in: its kind's initial status, or the finalised one asked for. */
export function requestedStatus(kind: DocumentKind, status: string | undefined): string {
  return !status || status === 'draft' ? initialStatus(kind) : status;
}
