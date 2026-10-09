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
import { isCancelled } from './documentStates';
import { calculateLine } from './lineCalc';
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
  invoiceValue: Money;
  /** Set on an export, or a credit note against one. */
  exported?: boolean;
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
  totalValue: Money;
};

/** Table 8 rows, one per supply type. GST has no exempt/non-GST flag on a line, so 0% goes to nil-rated. */
export type NilSupplyType = 'INTRB2B' | 'INTRAB2B' | 'INTRB2C' | 'INTRAB2C';

export type NilRow = {
  supplyType: NilSupplyType;
  nilRated: Money;
  exempt: Money;
  nonGst: Money;
};

/** Table 13: one row per numbering series of each document nature. */
export type DocIssueRow = {
  nature: 'invoice' | 'creditNote';
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
  totals: { taxableValue: Money; tax: Money; invoiceValue: Money; documents: number };
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
    const nature = d.kind === 'salesReturn' ? 'creditNote' : 'invoice';
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

function tableFor(doc: BusinessDocument, party: Party, placeOfSupply: string, interState: boolean, invoiceValue: Money): Gstr1Table {
  const registered = isRegistered(party);
  const exported = isExport(party, placeOfSupply);
  const large = interState && invoiceValue.minor > B2CL_THRESHOLD_MINOR;
  if (doc.kind === 'salesReturn') {
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

export function gstr1Summary(args: {
  company: Company;
  documents: BusinessDocument[];
  parties: Party[];
  items: Item[];
  baseCurrency: string;
  period: DateRange;
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
    (d) => (d.kind === 'invoice' || d.kind === 'salesReturn') && d.status !== 'draft' && inRange(d.date, period),
  );
  const reportable = issued.filter((d) => !isCancelled(d.status));

  reportable.forEach((doc) => {
    const party =
      parties.find((p) => p.id === doc.partyId) ?? walkInParty(doc.partyId, doc.placeOfSupplyStateCode ?? homeState);
    const sign = doc.kind === 'salesReturn' ? -1 : 1;
    const rate = doc.currency === baseCurrency ? 1 : doc.exchangeRate;

    const placeOfSupply =
      doc.placeOfSupplyStateCode ??
      party.shippingAddress?.stateCode ??
      party.billingAddress.stateCode ??
      homeState;
    const interState = !!homeState && placeOfSupply !== homeState;
    const invoiceValue = toBase(doc.totals.grandTotal, rate);
    const table = tableFor(doc, party, placeOfSupply, interState, invoiceValue);

    // One row per rate, as the return itself is laid out. The calculator
    // keeps no tax line for 0% lines, so their value is whatever the taxed
    // slabs leave of the document's taxable amount.
    const untaxed =
      doc.totals.taxableAmount.minor - doc.totals.taxLines.reduce((a, l) => a + l.taxableAmount.minor, 0);
    const slabs = [
      ...doc.totals.taxLines,
      ...(untaxed > 0 || !doc.totals.taxLines.length
        ? [{ rate: 0, taxableAmount: money(untaxed, doc.currency), components: [] }]
        : []),
    ];
    slabs.forEach((slab) => {
      if (slab.rate === 0 && doc.kind === 'invoice' && table !== 'exp') {
        const supplyType = `${interState ? 'INTR' : 'INTRA'}${isRegistered(party) ? 'B2B' : 'B2C'}` as NilSupplyType;
        const nil = nilMap.get(supplyType) ?? { supplyType, nilRated: zero(baseCurrency), exempt: zero(baseCurrency), nonGst: zero(baseCurrency) };
        nil.nilRated = money(nil.nilRated.minor + toBase(slab.taxableAmount, rate).minor, baseCurrency);
        nilMap.set(supplyType, nil);
        taxable += toBase(slab.taxableAmount, rate).minor;
        return;
      }
      const part = (type: string) =>
        toBase(money(slab.components.filter((c) => c.type === type).reduce((a, c) => a + c.amount.minor, 0), doc.currency), rate);
      const row: Gstr1Row = {
        documentId: doc.id,
        kind: doc.kind,
        table,
        gstin: isRegistered(party) ? party.taxId : undefined,
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
        invoiceValue,
        ...(isExport(party, placeOfSupply) && { exported: true }),
      };
      rows.push(row);
      taxable += sign * row.taxableValue.minor;
      tax += sign * (row.cgst.minor + row.sgst.minor + row.igst.minor);
    });
    value += sign * invoiceValue.minor;

    // HSN: each line's own taxable value (after its discount) and tax, split
    // the way this document was split.
    const igstDoc = doc.totals.taxLines.some((l) => l.components.some((c) => c.type === 'IGST'));
    doc.lines.forEach((line) => {
      const item = items.find((i) => i.id === line.itemId);
      const hsnCode = line.hsnCode ?? item?.hsnCode ?? 'Unclassified';
      const b = calculateLine(line, doc.currency, {
        regime: 'GST',
        registered: doc.totals.totalTax.minor > 0,
      });
      const lineTaxable = sign * toBase(b.taxable, rate).minor;
      const lineTax = sign * toBase(b.taxAmount, rate).minor;
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
        totalValue: zero(baseCurrency),
      };
      row.quantity += sign * line.quantity;
      row.taxableValue = money(row.taxableValue.minor + lineTaxable, baseCurrency);
      row.cgst = money(row.cgst.minor + cgst, baseCurrency);
      row.sgst = money(row.sgst.minor + sgst, baseCurrency);
      row.igst = money(row.igst.minor + igst, baseCurrency);
      row.totalValue = money(row.totalValue.minor + lineTaxable + lineTax, baseCurrency);
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
    totals: {
      taxableValue: money(taxable, baseCurrency),
      tax: money(tax, baseCurrency),
      invoiceValue: money(value, baseCurrency),
      documents: reportable.length,
    },
  };
}
