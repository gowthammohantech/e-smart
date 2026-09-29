import type { Gstr1Row, Gstr1Summary } from '@esmart/core/domain/gstr1';
import { uqcFor } from '@esmart/core/domain/eInvoice';

/** The portal's amounts are rupees with two decimals. */
const r2 = (minor: number) => Math.round(minor) / 100;
/** The offline tool's dates are dd-mm-yyyy. */
const dmy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

type Itm = { num: number; itm_det: { txval: number; rt: number; iamt: number; camt: number; samt: number; csamt: number } };

/** One invoice's rate slabs, as `itms`. */
function itemsOf(rows: Gstr1Row[]): Itm[] {
  return rows.map((r, i) => ({
    num: i + 1,
    itm_det: { txval: r2(r.taxableValue.minor), rt: r.rate, iamt: r2(r.igst.minor), camt: r2(r.cgst.minor), samt: r2(r.sgst.minor), csamt: 0 },
  }));
}

/** Rows grouped by document, first-seen order kept. */
function byDocument(rows: Gstr1Row[]): Gstr1Row[][] {
  const groups = new Map<string, Gstr1Row[]>();
  for (const r of rows) groups.set(r.documentId, [...(groups.get(r.documentId) ?? []), r]);
  return [...groups.values()];
}

function byKey<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const t of items) out.set(key(t), [...(out.get(key(t)) ?? []), t]);
  return out;
}

/**
 * GSTR-1 in the JSON the GST portal's offline tool imports (`b2b`, `b2cl`,
 * `b2cs`, `exp`, `cdnr`, `cdnur`, `hsn`), from core's summary. B2CS is
 * consolidated by place of supply and rate, as the return requires.
 */
export function gstnJson(summary: Gstr1Summary, gstin: string, period: string) {
  const homeState = gstin.slice(0, 2);
  const invoice = (rows: Gstr1Row[]) => ({ inum: rows[0].number, idt: dmy(rows[0].date), val: r2(rows[0].invoiceValue.minor), pos: rows[0].placeOfSupply, rchrg: 'N', inv_typ: 'R', itms: itemsOf(rows) });
  const note = (rows: Gstr1Row[]) => ({ ntty: 'C', nt_num: rows[0].number, nt_dt: dmy(rows[0].date), val: r2(rows[0].invoiceValue.minor), pos: rows[0].placeOfSupply, rchrg: 'N', inv_typ: 'R', itms: itemsOf(rows) });

  const b2b = [...byKey(byDocument(summary.b2b), (d) => d[0].gstin ?? '').entries()].map(([ctin, docs]) => ({ ctin, inv: docs.map(invoice) }));
  const b2cl = [...byKey(byDocument(summary.b2cl), (d) => d[0].placeOfSupply).entries()].map(([pos, docs]) => ({
    pos,
    inv: docs.map((d) => ({ inum: d[0].number, idt: dmy(d[0].date), val: r2(d[0].invoiceValue.minor), itms: itemsOf(d) })),
  }));
  const b2cs = [...byKey(summary.b2cs, (r) => `${r.placeOfSupply}|${r.rate}`).values()].map((rows) => {
    const total = (pick: (r: Gstr1Row) => number) => r2(rows.reduce((a, r) => a + pick(r), 0));
    return {
      sply_ty: rows[0].placeOfSupply === homeState ? 'INTRA' : 'INTER',
      pos: rows[0].placeOfSupply,
      typ: 'OE',
      rt: rows[0].rate,
      txval: total((r) => r.taxableValue.minor),
      iamt: total((r) => r.igst.minor),
      camt: total((r) => r.cgst.minor),
      samt: total((r) => r.sgst.minor),
      csamt: 0,
    };
  });
  const exp = [...byKey(byDocument(summary.exp), (d) => (d.some((r) => r.igst.minor > 0) ? 'WPAY' : 'WOPAY')).entries()].map(([exp_typ, docs]) => ({
    exp_typ,
    inv: docs.map((d) => ({ inum: d[0].number, idt: dmy(d[0].date), val: r2(d[0].invoiceValue.minor), itms: itemsOf(d).map((i) => ({ txval: i.itm_det.txval, rt: i.itm_det.rt, iamt: i.itm_det.iamt, csamt: 0 })) })),
  }));
  const cdnr = [...byKey(byDocument(summary.cdnr), (d) => d[0].gstin ?? '').entries()].map(([ctin, docs]) => ({ ctin, nt: docs.map(note) }));
  const cdnur = byDocument(summary.cdnur).map((d) => ({ typ: 'B2CL', ...note(d) }));
  const hsn = {
    data: summary.hsn.map((h, i) => ({
      num: i + 1,
      hsn_sc: h.hsnCode,
      desc: h.description.slice(0, 30),
      uqc: uqcFor(h.unit),
      qty: h.quantity,
      txval: r2(h.taxableValue.minor),
      iamt: r2(h.igst.minor),
      camt: r2(h.cgst.minor),
      samt: r2(h.sgst.minor),
      csamt: 0,
    })),
  };
  return { gstin, fp: period, version: 'GST3.1.6', hash: 'hash', b2b, b2cl, b2cs, exp, cdnr, cdnur, hsn };
}
