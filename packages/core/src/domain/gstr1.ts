/**
 * GSTR-1 — the outward-supplies return.
 *
 * Every sale lands in exactly one table, chosen by who the buyer is and, for
 * unregistered buyers, whether the supply crossed a state line above the
 * B2CL limit. The HSN table is a separate roll-up over the same documents.
 *
 * Amounts are in the company's base currency, at each document's stored
 * rate. Credit notes count against the totals and the HSN summary.
 *
 * A sale whose party is missing (a walk-in or cash sale, or a party not yet
 * synced) is still reported, as a supply to an unregistered buyer. Nil-rated
 * supplies to Indian buyers go to table 8 rather than B2B/B2C, and table 13
 * counts every invoice and credit note issued, cancelled ones included.
 */

import { Money, money, zero } from '../lib/money';
import { DateRange, inRange } from '../lib/date';
import { BusinessDocument, Company, Item, Party } from '../types';
import { AdvanceEvent, AdvanceRow, advancesForPeriod } from './advanceTax';
import type { Gstr1Amendments } from './gstr1Amend';
import { NOTE_KINDS, isCancelled } from './documentStates';
import { calculateLine, lineTreatment } from './lineCalc';
import { EXPORT_STATE_CODE } from './eInvoice';
import { stateNameOf } from './stateCodes';

/**
 * Inter-state B2C invoices above this go invoice by invoice (B2CL). The limit
 * was ₹2.5 lakh until Notification 12/2024-CT cut it to ₹1 lakh from
 * 1 August 2024.
 */
export const B2CL_THRESHOLD_MINOR = 1_00_000_00;

export type Gstr1Table = 'b2b' | 'b2cl' | 'b2cs' | 'exp' | 'cdnr' | 'cdnur';

export type Gstr1Row = {
  documentId: string;
  kind: BusinessDocument['kind'];
  table: Gstr1Table;
  gstin?: string;
  partyName: string;
  number: string;
  date: string;
  placeOfSupply: string;
  placeOfSupplyName: string;
  rate: number;
  taxableValue: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  cess: Money;
  invoiceValue: Money;
  /** Set on an export, or a credit note against one. */
  exported?: boolean;
  /** The buyer pays this tax under reverse charge; the seller reports it but doesn't pay it. */
  reverseCharge?: boolean;
  /** Set on a note: C (credit, lowers the supply) or D (debit, adds to it). */
  noteType?: 'C' | 'D';
};

export type HsnRow = {
  hsnCode: string;
  description: string;
  unit: string;
  quantity: number;
  taxableValue: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  cess: Money;
  totalValue: Money;
};

/** Table 8 rows, one per supply type. A taxable line charged at 0% counts as nil-rated. */
export type NilSupplyType = 'INTRB2B' | 'INTRAB2B' | 'INTRB2C' | 'INTRAB2C';

export type NilRow = {
  supplyType: NilSupplyType;
  nilRated: Money;
  exempt: Money;
  nonGst: Money;
};

/** Table 13: one row per numbering series of each document nature. */
export type DocIssueRow = {
  nature: 'invoice' | 'creditNote' | 'debitNote';
  series: string;
  from: string;
  to: string;
  total: number;
  cancelled: number;
};

export type Gstr1Summary = Record<Gstr1Table, Gstr1Row[]> & {
  hsn: HsnRow[];
  nil: NilRow[];
  docs: DocIssueRow[];
  /** Table 11: tax on advances for services received (11A) and adjusted against invoices (11B). */
  advances: { received: AdvanceRow[]; adjusted: AdvanceRow[] };
  totals: { taxableValue: Money; tax: Money; invoiceValue: Money; documents: number };
  /** Documents of earlier filed returns changed since: the amendment tables (gstr1Amendments). */
  amendments?: Gstr1Amendments;
};

export const GSTR1_TABLES: Gstr1Table[] = ['b2b', 'b2cl', 'b2cs', 'exp', 'cdnr', 'cdnur'];

export const GSTR1_TABLE_LABELS: Record<Gstr1Table, string> = {
  b2b: 'B2B — registered buyers',
  b2cl: 'B2CL — large inter-state B2C',
  b2cs: 'B2CS — small B2C, consolidated',
  exp: 'EXP — exports',
  cdnr: 'CDNR — credit notes to registered buyers',
  cdnur: 'CDNUR — credit notes to unregistered buyers',
};

export const NIL_SUPPLY_LABELS: Record<NilSupplyType, string> = {
  INTRB2B: 'Inter-state, registered',
  INTRAB2B: 'Intra-state, registered',
  INTRB2C: 'Inter-state, unregistered',
  INTRAB2C: 'Intra-state, unregistered',
};

/** Who a sale with no party on record is reported as. */
export const WALK_IN_PARTY_NAME = 'Walk-in customer';

function walkInParty(id: string, stateCode: string): Party {
  return {
    id,
    name: WALK_IN_PARTY_NAME,
    gstRegistrationType: 'unregistered',
    billingAddress: { line1: '', city: '', state: '', stateCode, postalCode: '', country: 'IN' },
  } as Party;
}

/** `INV/24-25/0012` → series `INV/24-25/`, number 12. */
function seriesOf(number: string): { series: string; seq: number } {
  const m = /^(.*?)(\d+)$/.exec(number);
  return m ? { series: m[1], seq: Number(m[2]) } : { series: number, seq: 0 };
}

function documentSummary(documents: BusinessDocument[]): DocIssueRow[] {
  const groups = new Map<string, { row: DocIssueRow; first: number; last: number }>();
  documents.forEach((d) => {
    const nature = noteTypeOf(d.kind) === 'C' ? 'creditNote' : noteTypeOf(d.kind) === 'D' ? 'debitNote' : 'invoice';
    const { series, seq } = seriesOf(d.number);
    const key = `${nature}|${series}`;
    const g = groups.get(key) ?? {
      row: { nature, series, from: d.number, to: d.number, total: 0, cancelled: 0 },
      first: seq,
      last: seq,
    };
    g.row.total += 1;
    if (isCancelled(d.status)) g.row.cancelled += 1;
    if (seq < g.first) [g.first, g.row.from] = [seq, d.number];
    if (seq > g.last) [g.last, g.row.to] = [seq, d.number];
    groups.set(key, g);
  });
  return Array.from(groups.values())
    .map((g) => g.row)
    .sort((a, b) => a.nature.localeCompare(b.nature) || a.series.localeCompare(b.series));
}

function isRegistered(party: Party): boolean {
  if (party.gstRegistrationType === 'unregistered' || party.gstRegistrationType === 'overseas') return false;
  return !!party.taxId;
}

function isExport(party: Party, placeOfSupply: string): boolean {
  return placeOfSupply === EXPORT_STATE_CODE || party.gstRegistrationType === 'overseas';
}

/** The sales documents GSTR-1 reports: invoices, and the credit and debit notes against them. */
export const GSTR1_KINDS: BusinessDocument['kind'][] = ['invoice', 'salesReturn', 'creditNote', 'debitNote'];

/** C for a credit note (a return is one too), D for a debit note, nothing for an invoice. */
export function noteTypeOf(kind: BusinessDocument['kind']): 'C' | 'D' | undefined {
  if (kind === 'salesReturn' || kind === 'creditNote') return 'C';
  if (kind === 'debitNote') return 'D';
  return undefined;
}

/**
 * `originalValue` is the invoice a note was raised against: whether that sale was B2CL decides
 * where an unregistered buyer's note goes, not the note's own size.
 */
function tableFor(doc: BusinessDocument, party: Party, placeOfSupply: string, interState: boolean, originalValue: Money): Gstr1Table {
  const registered = isRegistered(party);
  const exported = isExport(party, placeOfSupply);
  const large = interState && originalValue.minor > B2CL_THRESHOLD_MINOR;
  if (noteTypeOf(doc.kind)) {
    if (registered) return 'cdnr';
    // CDNUR only takes notes against B2CL sales and exports; the rest
    // reduce B2CS, as the portal requires.
    return exported || large ? 'cdnur' : 'b2cs';
  }
  if (exported) return 'exp';
  if (registered) return 'b2b';
  if (large) return 'b2cl';
  return 'b2cs';
}

/** One line of table 7: B2C small supplies for a place of supply and rate. */
export type B2csLine = {
  placeOfSupply: string;
  placeOfSupplyName: string;
  rate: number;
  supplyType: 'INTRA' | 'INTER';
  taxableValue: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  cess: Money;
};

/**
 * B2CS consolidated by place of supply and rate, as the return lays it out,
 * net of the credit notes (and returns) filed against it. First-seen order.
 */
export function consolidateB2cs(rows: Gstr1Row[], homeState: string | undefined, currency: string): B2csLine[] {
  const out = new Map<string, B2csLine>();
  for (const r of rows) {
    const key = `${r.placeOfSupply}|${r.rate}`;
    const line =
      out.get(key) ??
      {
        placeOfSupply: r.placeOfSupply,
        placeOfSupplyName: r.placeOfSupplyName,
        rate: r.rate,
        supplyType: r.placeOfSupply === homeState ? 'INTRA' : 'INTER',
        taxableValue: zero(currency),
        cgst: zero(currency),
        sgst: zero(currency),
        igst: zero(currency),
        cess: zero(currency),
      };
    const sign = r.noteType === 'C' ? -1 : 1;
    const plus = (a: Money, b: Money) => money(a.minor + sign * b.minor, currency);
    line.taxableValue = plus(line.taxableValue, r.taxableValue);
    line.cgst = plus(line.cgst, r.cgst);
    line.sgst = plus(line.sgst, r.sgst);
    line.igst = plus(line.igst, r.igst);
    line.cess = plus(line.cess, r.cess);
    out.set(key, line);
  }
  return [...out.values()];
}

export function gstr1Summary(args: {
  company: Company;
  documents: BusinessDocument[];
  parties: Party[];
  items: Item[];
  baseCurrency: string;
  period: DateRange;
  /** Tax on the period's advances for services, from advanceTaxEvents. */
  advances?: AdvanceEvent[];
}): Gstr1Summary {
  const { company, documents, parties, items, baseCurrency, period } = args;
  const homeState = company.taxRegistration?.placeOfSupplyStateCode ?? company.address.stateCode ?? '';
  const toBase = (m: Money, rate: number) => money(Math.round(m.minor * (rate || 1)), baseCurrency);

  const rows: Gstr1Row[] = [];
  const hsnMap = new Map<string, HsnRow>();
  const nilMap = new Map<NilSupplyType, NilRow>();
  let taxable = 0;
  let tax = 0;
  let value = 0;

  const issued = documents.filter(
    (d) => GSTR1_KINDS.includes(d.kind) && d.status !== 'draft' && inRange(d.date, period),
  );
  const reportable = issued.filter((d) => !isCancelled(d.status));

  reportable.forEach((doc) => {
    const party =
      parties.find((p) => p.id === doc.partyId) ?? walkInParty(doc.partyId, doc.placeOfSupplyStateCode ?? homeState);
    const noteType = noteTypeOf(doc.kind);
    const sign = noteType === 'C' ? -1 : 1;
    const rate = doc.currency === baseCurrency ? 1 : doc.exchangeRate;

    const placeOfSupply =
      doc.placeOfSupplyStateCode ??
      party.shippingAddress?.stateCode ??
      party.billingAddress?.stateCode ??
      homeState;
    const interState = !!homeState && placeOfSupply !== homeState;
    const invoiceValue = toBase(doc.totals.grandTotal, rate);
    const source = noteType && doc.sourceDocumentId ? documents.find((d) => d.id === doc.sourceDocumentId) : undefined;
    const originalValue = source ? toBase(source.totals.grandTotal, source.currency === baseCurrency ? 1 : source.exchangeRate) : invoiceValue;
    const table = tableFor(doc, party, placeOfSupply, interState, originalValue);
    // The buyer as registered when the document was issued.
    const gstin = isRegistered(party) ? (doc.partyGstin ?? party.taxId) : undefined;

    // Exempt and non-GST lines are reported apart from nil-rated ones. Reimbursements are no supply at all.
    const apart = { exempt: 0, nonGst: 0 };
    doc.lines.forEach((line) => {
      const type = line.gst?.supplyType;
      if (line.gst?.reimbursement || (type !== 'exempt' && type !== 'nonGst')) return;
      apart[type] += calculateLine(line, doc.currency, { regime: 'GST', registered: false }).taxable.minor;
    });
    // One row per rate, as the return itself is laid out. The calculator
    // keeps no tax line for 0% lines, so their value is whatever the taxed
    // slabs leave of the document's taxable amount.
    const untaxed =
      doc.totals.taxableAmount.minor - doc.totals.taxLines.reduce((a, l) => a + l.taxableAmount.minor, 0);
    const nilRated = untaxed - apart.exempt - apart.nonGst;
    const slabs = [
      ...doc.totals.taxLines,
      ...(untaxed > 0 || !doc.totals.taxLines.length
        ? [{ rate: 0, taxableAmount: money(untaxed, doc.currency), components: [], reverseCharge: false }]
        : []),
    ];
    slabs.forEach((slab) => {
      if (slab.rate === 0 && !slab.components.length && doc.kind === 'invoice' && table !== 'exp') {
        const supplyType = `${interState ? 'INTR' : 'INTRA'}${isRegistered(party) ? 'B2B' : 'B2C'}` as NilSupplyType;
        const nil = nilMap.get(supplyType) ?? { supplyType, nilRated: zero(baseCurrency), exempt: zero(baseCurrency), nonGst: zero(baseCurrency) };
        const add = (m: Money, minor: number) => money(m.minor + toBase(money(minor, doc.currency), rate).minor, baseCurrency);
        nil.nilRated = add(nil.nilRated, nilRated);
        nil.exempt = add(nil.exempt, apart.exempt);
        nil.nonGst = add(nil.nonGst, apart.nonGst);
        nilMap.set(supplyType, nil);
        taxable += toBase(slab.taxableAmount, rate).minor;
        return;
      }
      const reverseCharge = !!slab.reverseCharge || !!doc.reverseCharge;
      const part = (type: string) =>
        toBase(money(slab.components.filter((c) => c.type === type).reduce((a, c) => a + c.amount.minor, 0), doc.currency), rate);
      const row: Gstr1Row = {
        documentId: doc.id,
        kind: doc.kind,
        table,
        gstin,
        partyName: party.name,
        number: doc.number,
        date: doc.date,
        placeOfSupply,
        placeOfSupplyName: stateNameOf(placeOfSupply),
        rate: slab.rate,
        taxableValue: toBase(slab.taxableAmount, rate),
        cgst: part('CGST'),
        sgst: part('SGST'),
        igst: part('IGST'),
        cess: part('CESS'),
        invoiceValue,
        ...(isExport(party, placeOfSupply) && { exported: true }),
        ...(reverseCharge && { reverseCharge: true }),
        ...(noteType && { noteType }),
      };
      rows.push(row);
      taxable += sign * row.taxableValue.minor;
      // Reverse-charge tax is the buyer's to pay, so it isn't in the seller's liability.
      if (!reverseCharge) tax += sign * (row.cgst.minor + row.sgst.minor + row.igst.minor + row.cess.minor);
    });
    value += sign * invoiceValue.minor;

    // HSN: each line's own taxable value (after its discount) and tax, split
    // the way this document was split.
    const igstDoc = doc.totals.taxLines.some((l) => l.components.some((c) => c.type === 'IGST'));
    const charged = doc.totals.totalTax.minor + (doc.totals.reverseChargeTax?.minor ?? 0) > 0;
    doc.lines.forEach((line) => {
      if (line.gst?.reimbursement) return;
      const item = items.find((i) => i.id === line.itemId);
      const hsnCode = line.hsnCode ?? item?.hsnCode ?? 'Unclassified';
      const ctx = { regime: 'GST' as const, registered: charged, reverseCharge: doc.reverseCharge };
      const b = calculateLine(line, doc.currency, ctx);
      const { rate: gstRate, cessRate } = lineTreatment(line, ctx);
      const lineTaxable = sign * toBase(b.taxable, rate).minor;
      const allTax = sign * toBase(b.taxAmount, rate).minor;
      // The line's tax is GST and cess together; cess is reported in its own column.
      const lineCess = gstRate + cessRate > 0 ? Math.round((allTax * cessRate) / (gstRate + cessRate)) : 0;
      const lineTax = allTax - lineCess;
      const cgst = igstDoc ? 0 : Math.floor(lineTax / 2);
      const sgst = igstDoc ? 0 : lineTax - cgst;
      const igst = igstDoc ? lineTax : 0;

      const row = hsnMap.get(hsnCode) ?? {
        hsnCode,
        description: item?.name ?? line.name,
        unit: line.unit,
        quantity: 0,
        taxableValue: zero(baseCurrency),
        cgst: zero(baseCurrency),
        sgst: zero(baseCurrency),
        igst: zero(baseCurrency),
        cess: zero(baseCurrency),
        totalValue: zero(baseCurrency),
      };
      // A value-only note changes what was charged, not how much was supplied.
      if (!NOTE_KINDS.includes(doc.kind)) row.quantity += sign * line.quantity;
      row.taxableValue = money(row.taxableValue.minor + lineTaxable, baseCurrency);
      row.cgst = money(row.cgst.minor + cgst, baseCurrency);
      row.sgst = money(row.sgst.minor + sgst, baseCurrency);
      row.igst = money(row.igst.minor + igst, baseCurrency);
      row.cess = money(row.cess.minor + lineCess, baseCurrency);
      row.totalValue = money(row.totalValue.minor + lineTaxable + allTax, baseCurrency);
      hsnMap.set(hsnCode, row);
    });
  });

  const byTable = Object.fromEntries(
    GSTR1_TABLES.map((table) => [table, rows.filter((r) => r.table === table)]),
  ) as Record<Gstr1Table, Gstr1Row[]>;

  return {
    ...byTable,
    hsn: Array.from(hsnMap.values()).sort((a, b) => a.hsnCode.localeCompare(b.hsnCode)),
    nil: Array.from(nilMap.values()),
    docs: documentSummary(issued),
    advances: advancesForPeriod(args.advances ?? [], period.from, period.to),
    totals: {
      taxableValue: money(taxable, baseCurrency),
      tax: money(tax, baseCurrency),
      invoiceValue: money(value, baseCurrency),
      documents: reportable.length,
    },
  };
}
