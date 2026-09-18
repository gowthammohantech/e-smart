/**
 * GSTR-1 — the outward-supplies return.
 *
 * Every sale lands in exactly one table, chosen by who the buyer is and, for
 * unregistered buyers, whether the supply crossed a state line above the
 * ₹2.5 lakh line. The HSN table is a separate roll-up over the same documents.
 */

import { Money, money, sum, zero } from '@/lib/money';
import { BusinessDocument, Company, Item, Party } from '@/types';
import { isCancelled } from '@/domain/documentStates';
import { placeOfSupplyFor, sellerStateCode } from './supplyType';
import { stateNameOf } from './stateCodes';

/** Inter-state B2C supplies above ₹2.5 lakh are reported invoice by invoice. */
export const B2CL_THRESHOLD_MINOR = 2_50_000_00;

export type Gstr1Table = 'b2b' | 'b2cl' | 'b2cs' | 'cdnr' | 'cdnur';

export type Gstr1Row = {
  documentId: string;
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

export type Gstr1Summary = {
  b2b: Gstr1Row[];
  b2cl: Gstr1Row[];
  b2cs: Gstr1Row[];
  cdnr: Gstr1Row[];
  cdnur: Gstr1Row[];
  hsn: HsnRow[];
  totals: { taxableValue: Money; tax: Money; invoiceValue: Money; documents: number };
};

function tableFor(args: {
  doc: BusinessDocument;
  party: Party;
  interState: boolean;
}): Gstr1Table {
  const { doc, party, interState } = args;
  const registered = !!party.taxId;
  if (doc.kind === 'salesReturn') return registered ? 'cdnr' : 'cdnur';
  if (registered) return 'b2b';
  if (interState && doc.totals.grandTotal.minor > B2CL_THRESHOLD_MINOR) return 'b2cl';
  return 'b2cs';
}

export function gstr1Summary(args: {
  company: Company;
  documents: BusinessDocument[];
  parties: Party[];
  items: Item[];
  currency: string;
}): Gstr1Summary {
  const { company, documents, parties, items, currency } = args;
  const homeState = sellerStateCode(company);

  const rows: Gstr1Row[] = [];
  const hsnMap = new Map<string, HsnRow>();

  const reportable = documents.filter(
    (d) => (d.kind === 'invoice' || d.kind === 'salesReturn') && !isCancelled(d.status) && d.status !== 'draft',
  );

  reportable.forEach((doc) => {
    const party = parties.find((p) => p.id === doc.partyId);
    if (!party) return;

    const placeOfSupply =
      placeOfSupplyFor({ explicit: doc.placeOfSupplyStateCode, party, company }) ?? homeState ?? '';
    const interState = !!homeState && placeOfSupply !== homeState;
    const table = tableFor({ doc, party, interState });

    // One row per rate, as the return itself is laid out.
    doc.totals.taxLines.forEach((taxLine) => {
      const amountOf = (type: string) =>
        money(
          taxLine.components.filter((c) => c.type === type).reduce((acc, c) => acc + c.amount.minor, 0),
          currency,
        );
      rows.push({
        documentId: doc.id,
        table,
        gstin: party.taxId,
        partyName: party.name,
        number: doc.number,
        date: doc.date,
        placeOfSupply,
        placeOfSupplyName: stateNameOf(placeOfSupply),
        rate: taxLine.rate,
        taxableValue: taxLine.taxableAmount,
        cgst: amountOf('CGST'),
        sgst: amountOf('SGST'),
        igst: amountOf('IGST'),
        invoiceValue: doc.totals.grandTotal,
      });
    });

    doc.lines.forEach((line) => {
      const item = items.find((i) => i.id === line.itemId);
      const hsnCode = line.hsnCode ?? item?.hsnCode ?? 'Unclassified';
      const share = doc.totals.taxLines.find((t) => t.rate === line.taxRate);
      const existing = hsnMap.get(hsnCode) ?? {
        hsnCode,
        description: item?.name ?? line.name,
        unit: line.unit,
        quantity: 0,
        taxableValue: zero(currency),
        cgst: zero(currency),
        sgst: zero(currency),
        igst: zero(currency),
        totalValue: zero(currency),
      };
      const componentOf = (type: string) =>
        (share?.components ?? []).filter((c) => c.type === type).reduce((acc, c) => acc + c.amount.minor, 0);

      const lineTaxable = money(
        Math.round(line.unitPrice.minor * line.quantity),
        currency,
      );
      existing.quantity += line.quantity;
      existing.taxableValue = money(existing.taxableValue.minor + lineTaxable.minor, currency);
      existing.cgst = money(existing.cgst.minor + componentOf('CGST'), currency);
      existing.sgst = money(existing.sgst.minor + componentOf('SGST'), currency);
      existing.igst = money(existing.igst.minor + componentOf('IGST'), currency);
      existing.totalValue = money(
        existing.taxableValue.minor + existing.cgst.minor + existing.sgst.minor + existing.igst.minor,
        currency,
      );
      hsnMap.set(hsnCode, existing);
    });
  });

  const taxableValue = sum(rows.map((r) => r.taxableValue), currency);
  const tax = sum(
    rows.map((r) => money(r.cgst.minor + r.sgst.minor + r.igst.minor, currency)),
    currency,
  );

  return {
    b2b: rows.filter((r) => r.table === 'b2b'),
    b2cl: rows.filter((r) => r.table === 'b2cl'),
    b2cs: rows.filter((r) => r.table === 'b2cs'),
    cdnr: rows.filter((r) => r.table === 'cdnr'),
    cdnur: rows.filter((r) => r.table === 'cdnur'),
    hsn: Array.from(hsnMap.values()).sort((a, b) => a.hsnCode.localeCompare(b.hsnCode)),
    totals: {
      taxableValue,
      tax,
      invoiceValue: money(taxableValue.minor + tax.minor, currency),
      documents: reportable.length,
    },
  };
}

export const GSTR1_TABLE_LABELS: Record<Gstr1Table, string> = {
  b2b: 'B2B — registered buyers',
  b2cl: 'B2CL — large inter-state B2C',
  b2cs: 'B2CS — small B2C, consolidated',
  cdnr: 'CDNR — credit notes to registered buyers',
  cdnur: 'CDNUR — credit notes to unregistered buyers',
};
