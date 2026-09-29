/**
 * GSTR-1 — the outward-supplies return.
 *
 * Every sale lands in exactly one table, chosen by who the buyer is and, for
 * unregistered buyers, whether the supply crossed a state line above the
 * B2CL limit. The HSN table is a separate roll-up over the same documents.
 *
 * Amounts are in the company's base currency, at each document's stored
 * rate. Credit notes count against the totals and the HSN summary.
 */

import { Money, money, zero } from '@/lib/money';
import { DateRange, inRange } from '@/lib/date';
import { BusinessDocument, Company, Item, Party } from '@/types';
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

export type Gstr1Summary = Record<Gstr1Table, Gstr1Row[]> & {
  hsn: HsnRow[];
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

function isRegistered(party: Party): boolean {
  if (party.gstRegistrationType === 'unregistered' || party.gstRegistrationType === 'overseas') return false;
  return !!party.taxId;
}

function tableFor(doc: BusinessDocument, party: Party, placeOfSupply: string, interState: boolean, invoiceValue: Money): Gstr1Table {
  const registered = isRegistered(party);
  if (doc.kind === 'salesReturn') return registered ? 'cdnr' : 'cdnur';
  if (placeOfSupply === EXPORT_STATE_CODE || party.gstRegistrationType === 'overseas') return 'exp';
  if (registered) return 'b2b';
  if (interState && invoiceValue.minor > B2CL_THRESHOLD_MINOR) return 'b2cl';
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
  let taxable = 0;
  let tax = 0;
  let value = 0;

  const reportable = documents.filter(
    (d) =>
      (d.kind === 'invoice' || d.kind === 'salesReturn') &&
      d.status !== 'draft' &&
      !isCancelled(d.status) &&
      inRange(d.date, period),
  );

  reportable.forEach((doc) => {
    const party = parties.find((p) => p.id === doc.partyId);
    if (!party) return;
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

    // One row per rate, as the return itself is laid out.
    const slabs = doc.totals.taxLines.length
      ? doc.totals.taxLines
      : [{ rate: 0, taxableAmount: doc.totals.taxableAmount, components: [] }];
    slabs.forEach((slab) => {
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
    totals: {
      taxableValue: money(taxable, baseCurrency),
      tax: money(tax, baseCurrency),
      invoiceValue: money(value, baseCurrency),
      documents: reportable.length,
    },
  };
}
