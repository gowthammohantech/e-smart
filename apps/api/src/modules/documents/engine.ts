import { and, eq, inArray, lte, ne, notInArray } from 'drizzle-orm';
import { vehicleIssues } from '../settings/vehicles';
import { partyTcsSection, tcsAskedOn, tcsRateFor } from '@esmart/core/data/tcsSections';
import { OPENING_KINDS } from '@esmart/core/domain/documentStates';
import type { CustomValues } from '@esmart/core/domain/customFields';
import { cleanCustomValues } from '../settings/customFields';
import { bankDetailsOf } from '../companies/wire';
import { buysFrom, sellsTo } from '@esmart/core/domain/partyKinds';
import { NOTE_KINDS, PURCHASE_KINDS, initialStatus, isPayableDocument } from '@esmart/core/domain/documentStates';
import { resolveRate } from '@esmart/core/domain/fx';
import { calculateDocument, calculateLine } from '@esmart/core/domain/lineCalc';
import { FULL_PLAN, hasModule, saleTdsOnPlan } from '@esmart/core/domain/plan';
import { OTHER_COUNTRY_CODE } from '@esmart/core/domain/stateCodes';
import { buildTaxContext, taxAvailableOn, taxRateOn, type CrossBorderTax } from '@esmart/core/domain/taxEngine';
import { addDaysISO } from '@esmart/core/lib/date';
import type { Branch, ChargesKind, Company, ShipTo, DocumentKind, DocumentLine, DocumentTotals, GstFlags, Party, TaxCategory } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import type { CompanyRow } from '../../context';
import { conflict, planUpgradeRequired, unprocessable, type Issue } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { taxHistories } from '../../lib/taxRates';
import { gstColumns, gstFlagsFrom, iso, requiredAddressFrom } from '../../lib/wire';
import { tdsOn, tdsSectionFor } from '../../lib/tds';
import { expectedSaleTds } from '@esmart/core/domain/tds';
import { panOfGstin } from '@esmart/core/domain/gstin';
import { costCentreIssues } from '../books/costCentres';
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
    address: requiredAddressFrom(row, 'address'),
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
      lutNumber: row.lutNumber ?? undefined,
      lutValidTill: row.lutValidTill ?? undefined,
      returnFrequency: row.returnFrequency,
    },
    fiscalYearStartMonth: row.fiscalYearStartMonth,
    allowNegativeStock: row.allowNegativeStock,
    bankDetails: bankDetailsOf(row),
    invoiceTemplate: (row.invoiceTemplate as Company['invoiceTemplate']) ?? undefined,
    plan: row.plan,
    createdAt: iso(row.createdAt)!,
  };
}

export function partyCore(row: PartyRow): Party {
  return { ...(partyToWire(row) as unknown as Party), id: row.id, companyId: row.companyId, code: row.code, createdAt: iso(row.createdAt)! };
}

function branchCore(row: typeof schema.branches.$inferSelect): Branch {
  return { id: row.id, companyId: row.companyId, name: row.name, code: row.code, address: requiredAddressFrom(row, 'address'), gstin: row.gstin ?? undefined, isPrimary: row.isPrimary };
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
  /** Sent with the line, or kept from the stored one; else the item's. */
  gst?: GstFlags;
  /** A reimbursement line: the billable expense it recovers. */
  expenseId?: string | null;
  /** On a purchase: a non-stock line's own cost centre; null takes the document's. */
  costCentreId?: string | null;
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
  billOfEntry: { number: string; date: string; portCode: string; assessableMinor: number; igstMinor: number; cessMinor: number } | null;
  isdInvoice: boolean;
  currency: string;
  exchangeRate: number | null;
  documentDiscountMode: 'percent' | 'amount';
  documentDiscountValue: number;
  chargesMinor: number;
  /** What the charges are for; null is other charges. */
  chargesKind: ChargesKind | null;
  /** The consignee, when the goods go somewhere other than the buyer's own address. */
  shipTo: ShipTo | null;
  chargesCurrency?: string;
  applyRoundOff: boolean | null;
  /** A round-off the user typed, in minor units of the document currency. */
  roundOffManualMinor: number | null;
  placeOfSupplyStateCode: string | null;
  reverseCharge: boolean | null;
  noteReason: NonNullable<DocRow['noteReason']> | null;
  /** A direct note's GST treatment (RULES 6.24): with GST under s.34 (null too), or a financial note without. */
  noteGst: 'withGst' | 'noGst' | null;
  /** An export, SEZ or import document: IGST charged, or none. Null takes the default (`defaultCrossBorderTax`). */
  crossBorderTax: CrossBorderTax | null;
  /** A direct note with GST: the original invoice or bill it adjusts. */
  originalNumber: string | null;
  originalDate: string | null;
  /** A TDS section, `none`, or unset for the supplier's own (on an invoice, the customer's). */
  tdsSection?: string;
  /** On an invoice: the rate the customer will deduct at; unset takes the section's. */
  tdsRate?: number | null;
  costCentreId: string | null;
  /** A TCS section (s.206C), `none`, or unset: an invoice keeps what it had, a new one takes the customer's. */
  tcsSection?: string | null;
  vehicleId?: string | null;
  transporterId?: string | null;
  /** Undefined keeps what the document had. */
  customFields?: Record<string, unknown>;
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
    gst: l.gst,
    expenseId: l.expenseId ?? null,
    costCentreId: l.costCentreId ?? null,
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
      gst: gstFlagsFrom(l) ?? {},
      expenseId: l.expenseId,
      costCentreId: l.costCentreId,
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
    billOfEntry:
      body.billOfEntry !== undefined
        ? body.billOfEntry && { number: body.billOfEntry.number.trim(), date: body.billOfEntry.date, portCode: body.billOfEntry.portCode.trim().toUpperCase(), assessableMinor: body.billOfEntry.assessableValue.minor, igstMinor: body.billOfEntry.igst.minor, cessMinor: body.billOfEntry.cess?.minor ?? 0 }
        : ((base?.billOfEntry as DocFields['billOfEntry'] | undefined) ?? null),
    isdInvoice: body.isdInvoice ?? base?.isdInvoice ?? false,
    currency: body.currency,
    exchangeRate: body.exchangeRate ?? (base && base.currency.trim() === body.currency ? Number(base.exchangeRate) : null),
    documentDiscountMode: body.documentDiscountMode ?? base?.documentDiscountMode ?? 'percent',
    documentDiscountValue: body.documentDiscountValue ?? (base ? Number(base.documentDiscountValue) : 0),
    chargesMinor: body.charges?.minor ?? base?.chargesMinor ?? 0,
    chargesKind: keep(body.chargesKind, base?.chargesKind as ChargesKind | null | undefined),
    // Another party ships to its own address unless told otherwise.
    shipTo: keep(body.shipTo === undefined ? undefined : cleanShipTo(body.shipTo), base && base.partyId !== body.partyId ? null : (base?.shipTo as ShipTo | null | undefined)),
    chargesCurrency: body.charges?.currency,
    applyRoundOff: body.applyRoundOff ?? base?.applyRoundOff ?? null,
    roundOffManualMinor: body.roundOffManual !== undefined ? body.roundOffManual.minor : (base?.roundOffManualMinor ?? null),
    // Another party brings their own state unless one is sent.
    placeOfSupplyStateCode: keep(body.placeOfSupplyStateCode, base && base.partyId !== body.partyId ? null : base?.placeOfSupplyStateCode),
    reverseCharge: keep(body.reverseCharge, base?.reverseCharge),
    noteReason: keep(body.noteReason, base?.noteReason),
    noteGst: keep(body.noteGst, base?.noteGst as DocFields['noteGst'] | undefined),
    // Another party starts from its own default unless one is sent.
    crossBorderTax: keep(body.crossBorderTax, base && base.partyId !== body.partyId ? null : (base?.crossBorderTax as DocFields['crossBorderTax'] | undefined)),
    originalNumber: keep(body.originalNumber === undefined ? undefined : body.originalNumber.trim() || null, base?.originalNumber),
    originalDate: keep(body.originalDate, base?.originalDate),
    // A stored document keeps what it had; a new one takes the supplier's section unless told otherwise.
    tdsSection: body.tdsSection ?? (base ? (base.tdsSection ?? 'none') : undefined),
    tdsRate: body.tdsRate ?? (base?.tdsRate != null && (body.tdsSection === undefined || body.tdsSection === base.tdsSection) ? Number(base.tdsRate) : null),
    costCentreId: keep(body.costCentreId, base?.costCentreId),
    customFields: (body.customFields as Record<string, unknown> | undefined) ?? (base?.customFields as Record<string, unknown> | undefined),
    // Like TDS: a stored invoice keeps what it had; a new one takes the customer's section unless told otherwise.
    tcsSection: body.tcsSection ?? (base ? base.tcsSection : undefined),
    vehicleId: keep(body.vehicleId, base?.vehicleId),
    transporterId: keep(body.transporterId, base?.transporterId),
    notes: keep(body.notes, base?.notes),
    terms: keep(body.terms, base?.terms),
    sourceDocumentId: keep(body.sourceDocumentId, base?.sourceDocumentId),
  };
}

/** A consignee as stored: trimmed, the GSTIN upper-cased, empty parts dropped; null when there is none. */
function cleanShipTo(v: { name?: string; gstin?: string; address: Schema<'Address'> } | null): ShipTo | null {
  if (!v) return null;
  const name = v.name?.trim();
  const gstin = v.gstin?.trim().toUpperCase();
  return { ...(name && { name }), ...(gstin && { gstin }), address: v.address as ShipTo['address'] };
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
    billOfEntry: (row.billOfEntry as DocFields['billOfEntry']) ?? null,
    isdInvoice: row.isdInvoice,
    currency: row.currency.trim(),
    exchangeRate: Number(row.exchangeRate),
    documentDiscountMode: row.documentDiscountMode,
    documentDiscountValue: Number(row.documentDiscountValue),
    chargesMinor: row.chargesMinor,
    chargesKind: row.chargesKind as ChargesKind | null,
    shipTo: (row.shipTo as ShipTo | null) ?? null,
    applyRoundOff: row.applyRoundOff,
    roundOffManualMinor: row.roundOffManualMinor,
    placeOfSupplyStateCode: row.placeOfSupplyStateCode,
    reverseCharge: row.reverseCharge,
    noteReason: row.noteReason,
    noteGst: row.noteGst as DocFields['noteGst'],
    crossBorderTax: row.crossBorderTax as DocFields['crossBorderTax'],
    originalNumber: row.originalNumber,
    originalDate: row.originalDate,
    tdsSection: row.tdsSection ?? (row.finalizedAt ? 'none' : undefined),
    tdsRate: row.tdsRate != null ? Number(row.tdsRate) : null,
    costCentreId: row.costCentreId,
    customFields: row.customFields as Record<string, unknown>,
    tcsSection: row.tcsSection,
    vehicleId: row.vehicleId,
    transporterId: row.transporterId,
    notes: row.notes,
    terms: row.terms,
    sourceDocumentId: row.sourceDocumentId,
  };
}

// ------------------------------------------------------------ preparation

/**
 * Reimbursement lines recovering billable expenses (Rule 33): each on an invoice to the customer the
 * expense is billed to, and recovered once. A draft holds nothing; a live document holds its expenses.
 */
async function checkRecoveredExpenses(db: DbOrTx, companyId: string, f: DocFields, lines: DocumentLine[], documentId: string | undefined, blocking: (field: string, message: string) => void) {
  const linked = lines.map((l, i) => ({ id: l.expenseId, i, reimbursement: !!l.gst?.reimbursement })).filter((l): l is { id: string; i: number; reimbursement: boolean } => !!l.id);
  if (!linked.length) return;
  const E = schema.expenses;
  const expenses = await db.select({ id: E.id, number: E.number, billable: E.billable, customerId: E.customerId }).from(E).where(and(eq(E.companyId, companyId), inArray(E.id, linked.map((l) => l.id))));
  const seen = new Set<string>();
  let wrong = false;
  const block = (field: string, message: string) => {
    wrong = true;
    blocking(field, message);
  };
  for (const l of linked) {
    const field = `lines[${l.i}].expenseId`;
    const e = expenses.find((x) => x.id === l.id);
    if (!e) block(field, 'No such expense in this company');
    else if (f.kind !== 'invoice') block(field, 'Only an invoice recovers an expense');
    else if (!l.reimbursement) block(field, 'A line recovering an expense is a reimbursement line');
    else if (!e.billable) block(field, `${e.number} is not marked billable`);
    else if (e.customerId && e.customerId !== f.partyId) block(field, `${e.number} is billed to another customer`);
    else if (seen.has(e.id)) block(field, `${e.number} is on this invoice twice`);
    seen.add(l.id);
  }
  if (wrong) return;
  const L = schema.documentLines;
  const [taken] = await db
    .select({ number: D.number, expenseId: L.expenseId })
    .from(L)
    .innerJoin(D, eq(D.id, L.documentId))
    .where(and(inArray(L.expenseId, linked.map((l) => l.id)), notInArray(D.status, ['draft', 'cancelled', 'rejected']), documentId ? ne(D.id, documentId) : undefined))
    .limit(1);
  if (taken) {
    const e = expenses.find((x) => x.id === taken.expenseId);
    throw conflict('EXPENSE_ALREADY_RECOVERED', `${e?.number ?? 'The expense'} is already recovered on ${taken.number}`);
  }
}

/** A direct note's GST treatment; with GST unless it says otherwise. */
export const directNoteGst = (f: Pick<DocFields, 'noteGst'>): 'withGst' | 'noGst' => (f.noteGst === 'noGst' ? 'noGst' : 'withGst');

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
  opts: { snapshotRates: boolean; documentId?: string },
): Promise<Prepared> {
  const issues: Issue[] = [];
  const blocking = (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });
  const baseCurrency = company.baseCurrency.trim();

  const [party] = await db.select().from(schema.parties).where(and(eq(schema.parties.companyId, company.id), eq(schema.parties.id, f.partyId)));
  if (!party) blocking('partyId', 'No such party in this company');
  else {
    // A party that is both is on either side; a general contact on neither.
    const purchase = isPurchaseKind(f.kind);
    if (!(purchase ? buysFrom(party.kind) : sellsTo(party.kind))) blocking('partyId', `A ${f.kind} needs a ${purchase ? 'supplier' : 'customer'}`);
  }

  let branchId = f.branchId;
  let branch: typeof schema.branches.$inferSelect | undefined;
  if (branchId) {
    [branch] = await db.select().from(schema.branches).where(and(eq(schema.branches.companyId, company.id), eq(schema.branches.id, branchId)));
    if (!branch) blocking('branchId', 'No such branch in this company');
  } else {
    const branches = await db.select().from(schema.branches).where(eq(schema.branches.companyId, company.id));
    branch = branches.find((b) => b.isPrimary) ?? branches[0];
    branchId = branch?.id ?? null;
    if (!branchId) blocking('branchId', 'The company has no branch');
  }

  const [cur] = await db.select().from(schema.currencies).where(eq(schema.currencies.code, f.currency));
  if (!cur) blocking('currency', `Unknown currency ${f.currency}`);
  if (f.chargesCurrency && f.chargesCurrency !== f.currency) blocking('charges.currency', `Must be in the document's currency (${f.currency})`);

  // A document falls due, or a quote lapses, on or after the day it is dated.
  if (f.dueDate && f.dueDate < f.date) blocking('dueDate', `The due date cannot be before the document date (${f.date})`);
  if (f.validUntil && f.validUntil < f.date) blocking('validUntil', `Valid until cannot be before the document date (${f.date})`);

  // A bill of entry belongs on an import bill; an ISD invoice comes from a registered distributor at home.
  if (f.billOfEntry) {
    const abroad = party?.gstRegistrationType === 'overseas' || f.placeOfSupplyStateCode === '96';
    if (f.kind !== 'purchaseBill') blocking('billOfEntry', 'Only a purchase bill carries a bill of entry');
    else if (!abroad) blocking('billOfEntry', 'A bill of entry is for goods imported from an overseas supplier');
    if (!/^[A-Z0-9]{6}$/.test(f.billOfEntry.portCode)) blocking('billOfEntry.portCode', 'A six-character port code');
    if (!f.billOfEntry.number) blocking('billOfEntry.number', 'The bill of entry number is required');
    if (f.billOfEntry.igstMinor < 0 || f.billOfEntry.cessMinor < 0 || f.billOfEntry.assessableMinor < 0) blocking('billOfEntry', 'Amounts cannot be negative');
  }
  if (f.isdInvoice) {
    if (f.kind !== 'purchaseBill') blocking('isdInvoice', 'Only a purchase bill can be an ISD invoice');
    if (f.billOfEntry) blocking('isdInvoice', 'An ISD invoice is not an import');
    if (!party?.taxId) blocking('isdInvoice', "An ISD invoice comes from the distributor's GSTIN; the supplier has none");
  }

  // A return or note against an export, SEZ or import document reverses it as it was charged: with IGST or without.
  let crossBorderTax = f.crossBorderTax;
  if (f.sourceDocumentId) {
    const [src] = await db.select({ id: D.id, date: D.date, number: D.number, crossBorderTax: D.crossBorderTax }).from(D).where(and(eq(D.companyId, company.id), eq(D.id, f.sourceDocumentId)));
    if (src?.crossBorderTax && (f.kind === 'salesReturn' || f.kind === 'purchaseReturn' || NOTE_KINDS.includes(f.kind))) crossBorderTax = src.crossBorderTax as CrossBorderTax;
    if (!src) blocking('sourceDocumentId', 'No such document in this company');
    // What a document is made from (the quote behind an order, the invoice behind a return) came first.
    else if (f.date < src.date) blocking('date', `Can't be before ${src.date}, the date of ${src.number.trim()} it was made from`);
  } else if (NOTE_KINDS.includes(f.kind)) {
    // A direct note (a discount over several invoices, a rate revision) needn't name one invoice or bill, but must say why.
    if (!f.noteReason) blocking('noteReason', `A ${f.kind} not raised against a ${isPurchaseKind(f.kind) ? 'purchase bill' : 'invoice'} needs a reason`);
    // With GST (s.34) it still adjusts one supply: its number and date go to GSTR-1 CDNR/CDNUR and set the
    // credit note's deadline (RULES 6.24). A financial note without GST adjusts none.
    if (directNoteGst(f) === 'withGst') {
      const what = isPurchaseKind(f.kind) ? 'bill' : 'invoice';
      if (!f.originalNumber) blocking('originalNumber', `A ${f.kind} with GST and no linked ${what} needs the original ${what} number`);
      if (!f.originalDate) blocking('originalDate', `A ${f.kind} with GST and no linked ${what} needs the original ${what} date`);
      else if (f.originalDate > f.date) blocking('originalDate', `The original ${what} cannot be dated after the note (${f.date})`);
    }
  }
  if (f.noteGst && !NOTE_KINDS.includes(f.kind)) blocking('noteGst', 'Only a credit or debit note has a GST treatment');
  if (f.noteGst === 'noGst' && f.sourceDocumentId) blocking('noteGst', 'A note against an invoice or bill adjusts its GST; only a direct note can be without GST');

  const noGst = NOTE_KINDS.includes(f.kind) && !f.sourceDocumentId && f.noteGst === 'noGst';
  const categories = (await db.select().from(schema.taxCategories).where(eq(schema.taxCategories.companyId, company.id))).map(taxCategoryCore);
  const itemIds = [...new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x))];
  const items = itemIds.length
    ? await db.select().from(schema.items).where(and(eq(schema.items.companyId, company.id), inArray(schema.items.id, itemIds)))
    : [];

  // A return, or a note against an invoice or bill, reverses exactly what was charged, whatever the
  // category says now: the note's line takes its source line's rate when it names the same item.
  const returned = new Map<string, number>();
  if (f.sourceDocumentId && (f.kind === 'salesReturn' || f.kind === 'purchaseReturn' || NOTE_KINDS.includes(f.kind))) {
    const stored = await db.select().from(schema.documentLines).where(eq(schema.documentLines.documentId, f.sourceDocumentId));
    for (const s of stored) returned.set(s.itemId ?? s.name, Number(s.taxRate));
  }
  // A category changed since the document's date charged its earlier rate then.
  const histories = await taxHistories(db, categories.filter((c) => c.effectiveFrom > f.date).map((c) => c.id));
  const rateOn = (c: (typeof categories)[number]) => taxRateOn({ ...c, history: histories.get(c.id) }, f.date);

  const coreLines: DocumentLine[] = lines.map((l, i) => {
    const category = categories.find((c) => c.id === l.taxCategoryId);
    if (!category) blocking(`lines[${i}].taxCategoryId`, 'No such tax category in this company');
    // A tax that starts later can't be charged on a document dated before it.
    else if (!taxAvailableOn({ ...category, history: histories.get(category.id) }, f.date)) {
      blocking(`lines[${i}].taxCategoryId`, `${category.name} applies from ${category.effectiveFrom}; the document is dated ${f.date}`);
    }
    const item = l.itemId ? items.find((it) => it.id === l.itemId) : undefined;
    if (l.itemId && !item) blocking(`lines[${i}].itemId`, 'No such item in this company');
    // An item has stock from the day its opening stock was counted, not before.
    if (item?.trackInventory && item.openingStockDate && f.date < item.openingStockDate) {
      blocking('date', `${item.name}'s opening stock is dated ${item.openingStockDate}; the document cannot be dated before it`);
    }
    if (l.unitPriceCurrency && l.unitPriceCurrency !== f.currency) blocking(`lines[${i}].unitPrice.currency`, `Must be in the document's currency (${f.currency})`);
    if (!(l.quantity > 0)) blocking(`lines[${i}].quantity`, 'Must be more than zero');
    if (l.unitPriceMinor < 0) blocking(`lines[${i}].unitPrice`, 'Cannot be negative');
    // The line's own treatment, else the item's. A non-taxable supply is charged at 0%.
    // A financial note without GST charges none on any line (RULES 6.24).
    const own = l.gst ?? (item ? gstFlagsFrom(item) : undefined) ?? {};
    const gst = noGst ? { ...own, supplyType: 'nonGst' as const, reverseCharge: false, cessRate: 0 } : own;
    const taxable = !gst.reimbursement && (gst.supplyType ?? 'taxable') === 'taxable';
    // A line's own cost centre is for what is spent, not stock (RULES 6.20): stock takes the document's,
    // since its cost reaches profit only when it is sold.
    if (l.costCentreId && !isPurchaseKind(f.kind)) blocking(`lines[${i}].costCentreId`, 'A line has its own cost centre only on a purchase; the document carries one');
    else if (l.costCentreId && item?.trackInventory) blocking(`lines[${i}].costCentreId`, `${item.name} is stock: it takes the bill's cost centre`);
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
      taxRate: !taxable ? 0 : (returned.get(l.itemId ?? l.name) ?? (opts.snapshotRates || l.taxRate === undefined ? Number(category ? rateOn(category) : 0) : l.taxRate)),
      taxInclusive: l.taxInclusive,
      gst,
      expenseId: l.expenseId ?? undefined,
      costCentreId: l.costCentreId ?? undefined,
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

  issues.push(...(await costCentreIssues(db, company.id, [{ field: 'costCentreId', id: f.costCentreId }, ...lines.map((l, i) => ({ field: `lines[${i}].costCentreId`, id: l.costCentreId }))])));
  issues.push(...(await vehicleIssues(db, company.id, f.vehicleId)));
  if (f.transporterId) {
    const [tr] = await db.select({ id: schema.transporters.id }).from(schema.transporters).where(and(eq(schema.transporters.companyId, company.id), eq(schema.transporters.id, f.transporterId)));
    if (!tr) issues.push({ field: 'transporterId', message: 'No such transporter in this company', severity: 'blocking' });
  }
  await checkRecoveredExpenses(db, company.id, f, coreLines, opts.documentId, blocking);
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
  // A supplier marked reverse charge puts the whole bill under it unless the document says otherwise.
  const reverseCharge = noGst ? false : (f.reverseCharge ?? (isPurchaseKind(f.kind) && party!.reverseCharge));
  const taxContext = buildTaxContext(coreCompany, {
    placeOfSupply: placeOfSupply ?? undefined,
    party: partyCore(party!),
    date: f.date,
    purchase: isPurchaseKind(f.kind),
    branch: branch ? branchCore(branch) : undefined,
    reverseCharge,
    crossBorderTax,
  });
  // What an export, SEZ or import document applied, so it reads the same however the LUT changes later;
  // none for anything else.
  const appliedCrossBorderTax: CrossBorderTax | null = taxContext.crossBorder ? (taxContext.zeroRated ? 'withoutTax' : 'withTax') : null;
  // An import bill charging IGST on its lines has none paid at customs: a bill of entry too would claim it twice.
  if (taxContext.crossBorder === 'import' && appliedCrossBorderTax === 'withTax' && f.kind === 'purchaseBill' && f.billOfEntry) {
    throw unprocessable([{ field: 'billOfEntry', message: 'An import bill charging IGST has no bill of entry: choose without tax to record the IGST paid at customs', severity: 'blocking' }]);
  }
  const applyRoundOff = f.applyRoundOff ?? f.currency === 'INR';
  const calcInput = {
    lines: coreLines,
    currency: f.currency,
    baseCurrency,
    exchangeRate: exchangeRate!,
    documentDiscountMode: f.documentDiscountMode,
    documentDiscountValue: f.documentDiscountValue,
    charges: { minor: f.chargesMinor, currency: f.currency },
    applyRoundOff,
    roundOffManual: f.roundOffManualMinor !== null ? { minor: f.roundOffManualMinor, currency: f.currency } : undefined,
    taxCategories: categories,
    taxContext,
    // From CHARGES_TAXED_FROM the charges are part of the taxable value (RULES 1.10).
    date: f.date,
  };
  let totals = calculateDocument(calcInput);
  // TCS the seller collects on an invoice under its section (s.206C), worked on the price with GST.
  let tcsCode = f.tcsSection === undefined ? (partyTcsSection(party!) ?? null) : f.tcsSection;
  // From TCS_ENDS_ON an invoice collects none, whatever section was sent or the customer has on file.
  let tcsRate = f.kind === 'invoice' && tcsAskedOn(f.date) ? tcsRateFor(tcsCode, !!(party!.pan || party!.taxId), totals.grandTotalBase.minor) : 0;
  // A credit note or return against an invoice that collected TCS gives it back in proportion: at the
  // invoice's rate and under its section, on the note's own value (RULES 6.13, pending CA).
  if ((f.kind === 'creditNote' || f.kind === 'salesReturn') && f.sourceDocumentId) {
    const [src] = await db.select({ section: D.tcsSection, rate: D.tcsRate }).from(D).where(and(eq(D.companyId, company.id), eq(D.id, f.sourceDocumentId)));
    if (src?.section && Number(src.rate) > 0) {
      tcsCode = src.section;
      tcsRate = Number(src.rate);
    }
  }
  if (tcsRate > 0) totals = calculateDocument({ ...calcInput, tcsRate });

  // TDS the business keeps back from a supplier, worked on the taxable value in base currency.
  let tds: { section: string | null; rate: number; amountMinor: number } = { section: null, rate: 0, amountMinor: 0 };
  const baseMinor = Math.round(totals.taxableAmount.minor * exchangeRate!);
  if (f.kind === 'purchaseBill' || f.kind === 'supplierDebitNote') {
    tds = await tdsOn(db, company, party!, tdsSectionFor(company, party!, f.tdsSection), f.date, baseMinor, { documentId: opts.documentId });
  } else if (f.kind === 'invoice' && saleTdsOnPlan(company.plan)) {
    // TDS the customer will deduct (RULES 4.14): expected only, never posted, and the total is unchanged.
    // Not on the Free plan, where the invoice doesn't ask for it.
    const section = f.tdsSection === 'none' ? null : (f.tdsSection ?? party!.tdsSection ?? null);
    const expected = expectedSaleTds({ section, rate: f.tdsRate, sellerPan: panOfGstin(company.taxIdentifier ?? undefined) || undefined, date: f.date, baseMinor });
    if (expected) tds = expected;
  } else if ((f.kind === 'supplierCreditNote' || f.kind === 'purchaseReturn') && f.sourceDocumentId) {
    // A credit note or return gives back TDS at the rate its bill was taxed at.
    const [src] = await db.select({ section: D.tdsSection, rate: D.tdsRate }).from(D).where(eq(D.id, f.sourceDocumentId));
    if (src?.section && src.rate) tds = { section: src.section, rate: Number(src.rate), amountMinor: Math.round((baseMinor * Number(src.rate)) / 100) };
  }
  // Held in the document's currency, like what is paid against it.
  const tdsAmountMinor = exchangeRate === 1 ? tds.amountMinor : Math.round(tds.amountMinor / exchangeRate!);

  // Invoices and bills fall due after the party's terms unless a date was given.
  const dueDate = f.dueDate ?? (isPayableDocument(f.kind) ? addDaysISO(f.date, party!.paymentTermsDays) : null);

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
      billOfEntry: f.kind === 'purchaseBill' ? f.billOfEntry : null,
      isdInvoice: f.kind === 'purchaseBill' && f.isdInvoice,
      currency: f.currency,
      exchangeRate: String(exchangeRate),
      documentDiscountMode: f.documentDiscountMode,
      documentDiscountValue: String(f.documentDiscountValue),
      chargesMinor: f.chargesMinor,
      // Named only when there is something charged.
      chargesKind: f.chargesMinor ? f.chargesKind : null,
      shipTo: f.shipTo,
      applyRoundOff,
      roundOffManualMinor: f.roundOffManualMinor,
      placeOfSupplyStateCode: placeOfSupply,
      reverseCharge,
      noteReason: NOTE_KINDS.includes(f.kind) ? f.noteReason : null,
      noteGst: NOTE_KINDS.includes(f.kind) && !f.sourceDocumentId ? directNoteGst(f) : null,
      crossBorderTax: appliedCrossBorderTax,
      originalNumber: NOTE_KINDS.includes(f.kind) && !f.sourceDocumentId && !noGst ? f.originalNumber : null,
      originalDate: NOTE_KINDS.includes(f.kind) && !f.sourceDocumentId && !noGst ? f.originalDate : null,
      tcsSection: tcsRate > 0 ? tcsCode : null,
      vehicleId: f.vehicleId ?? null,
      transporterId: f.transporterId ?? null,
      tcsRate: tcsRate > 0 ? String(tcsRate) : null,
      tdsSection: tds.amountMinor > 0 || tds.section ? tds.section : null,
      tdsRate: tds.section ? String(tds.rate) : null,
      tdsAmountMinor,
      costCentreId: f.costCentreId,
      // A balance brought in from before the books began isn't filled in like a new document.
      customFields: OPENING_KINDS.includes(f.kind) ? {} : await cleanCustomValues(db, company.id, 'document', f.customFields as CustomValues | undefined),
      notes: f.notes,
      terms: f.terms,
      sourceDocumentId: f.sourceDocumentId,
      subtotalMinor: totals.subtotal.minor,
      lineDiscountMinor: totals.lineDiscount.minor,
      documentDiscountMinor: totals.documentDiscount.minor,
      taxableAmountMinor: totals.taxableAmount.minor,
      totalTaxMinor: totals.totalTax.minor,
      reverseChargeTaxMinor: totals.reverseChargeTax?.minor ?? 0,
      reimbursementsMinor: totals.reimbursements?.minor ?? 0,
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
      ...gstColumns(l.gst),
      expenseId: l.expenseId ?? null,
      costCentreId: l.costCentreId ?? null,
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
      reverseCharge: !!tl.reverseCharge,
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

/**
 * What the audit trail keeps of a document: the fields a person edits, in
 * readable form, so the trail can show what changed. Each line is one string
 * ("Steel rod × 2 NOS @ 1000.00, 18%"), so an edit shows as a line removed
 * and another added.
 */
export async function auditSnapshot(db: DbOrTx, row: DocRow, lines: LineRow[]) {
  const [party] = await db.select({ name: schema.parties.name }).from(schema.parties).where(eq(schema.parties.id, row.partyId));
  const currency = row.currency.trim();
  return {
    status: row.status,
    party: party?.name ?? row.partyId,
    date: row.date,
    dueDate: row.dueDate ?? undefined,
    reference: row.reference ?? undefined,
    notes: row.notes ?? undefined,
    terms: row.terms ?? undefined,
    total: { minor: row.grandTotalMinor, currency },
    lines: [...lines]
      .sort((a, b) => a.position - b.position)
      .map((l) => `${l.name} × ${Number(l.quantity)} ${l.unit} @ ${(l.unitPriceMinor / 100).toFixed(2)}, ${Number(l.taxRate)}%`),
  };
}
