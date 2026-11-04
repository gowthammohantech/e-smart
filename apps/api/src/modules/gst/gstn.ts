import { consolidateB2cs, type Gstr1Row, type Gstr1Summary } from '@esmart/core/domain/gstr1';
import type { AmendedRow } from '@esmart/core/domain/gstr1Amend';
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
    itm_det: { txval: r2(r.taxableValue.minor), rt: r.rate, iamt: r2(r.igst.minor), camt: r2(r.cgst.minor), samt: r2(r.sgst.minor), csamt: r2(r.cess.minor) },
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
 * `b2cs`, `exp`, `cdnr`, `cdnur`, `nil`, `hsn`, `doc_issue`, and the amendment
 * tables `b2ba`, `b2cla`, `b2csa`, `expa`, `cdnra`, `cdnura`), from core's
 * summary. B2CS is consolidated by place of supply and rate (`consolidateB2cs`).
 */
export function gstnJson(summary: Gstr1Summary, gstin: string, period: string) {
  const homeState = gstin.slice(0, 2);
  const rchrg = (rows: Gstr1Row[]) => (rows.some((r) => r.reverseCharge) ? 'Y' : 'N');
  const invoice = (rows: Gstr1Row[]) => ({ inum: rows[0].number, idt: dmy(rows[0].date), val: r2(rows[0].invoiceValue.minor), pos: rows[0].placeOfSupply, rchrg: rchrg(rows), inv_typ: 'R', itms: itemsOf(rows) });
  const note = (rows: Gstr1Row[]) => ({ ntty: rows[0].noteType ?? 'C', nt_num: rows[0].number, nt_dt: dmy(rows[0].date), val: r2(rows[0].invoiceValue.minor), pos: rows[0].placeOfSupply, rchrg: rchrg(rows), inv_typ: 'R', itms: itemsOf(rows) });

  const b2b = [...byKey(byDocument(summary.b2b), (d) => d[0].gstin ?? '').entries()].map(([ctin, docs]) => ({ ctin, inv: docs.map(invoice) }));
  const b2cl = [...byKey(byDocument(summary.b2cl), (d) => d[0].placeOfSupply).entries()].map(([pos, docs]) => ({
    pos,
    inv: docs.map((d) => ({ inum: d[0].number, idt: dmy(d[0].date), val: r2(d[0].invoiceValue.minor), itms: itemsOf(d) })),
  }));
  const b2cs = consolidateB2cs(summary.b2cs, homeState, 'INR').map((l) => ({
    sply_ty: l.supplyType,
    pos: l.placeOfSupply,
    typ: 'OE',
    rt: l.rate,
    txval: r2(l.taxableValue.minor),
    iamt: r2(l.igst.minor),
    camt: r2(l.cgst.minor),
    samt: r2(l.sgst.minor),
    csamt: r2(l.cess.minor),
  }));
  const exp = [...byKey(byDocument(summary.exp), (d) => (d.some((r) => r.igst.minor > 0) ? 'WPAY' : 'WOPAY')).entries()].map(([exp_typ, docs]) => ({
    exp_typ,
    inv: docs.map((d) => ({ inum: d[0].number, idt: dmy(d[0].date), val: r2(d[0].invoiceValue.minor), itms: itemsOf(d).map((i) => ({ txval: i.itm_det.txval, rt: i.itm_det.rt, iamt: i.itm_det.iamt, csamt: i.itm_det.csamt })) })),
  }));
  const cdnr = [...byKey(byDocument(summary.cdnr), (d) => d[0].gstin ?? '').entries()].map(([ctin, docs]) => ({ ctin, nt: docs.map(note) }));
  const cdnur = byDocument(summary.cdnur).map((d) => {
    const exported = !!d[0].exported;
    const typ = exported ? (d.some((r) => r.igst.minor > 0) ? 'EXPWP' : 'EXPWOP') : 'B2CL';
    // The offline tool rejects `pos` on export notes.
    const { pos, ...rest } = note(d);
    return exported ? { typ, ...rest } : { typ, ...rest, pos };
  });
  const nil = {
    inv: summary.nil.map((n) => ({ sply_ty: n.supplyType, nil_amt: r2(n.nilRated.minor), expt_amt: r2(n.exempt.minor), ngsup_amt: r2(n.nonGst.minor) })),
  };
  const docNatures = [
    { nature: 'invoice' as const, doc_num: 1, doc_typ: 'Invoices for outward supply' },
    { nature: 'debitNote' as const, doc_num: 4, doc_typ: 'Debit Note' },
    { nature: 'creditNote' as const, doc_num: 5, doc_typ: 'Credit Note' },
  ];
  const doc_issue = {
    doc_det: docNatures
      .map(({ nature, doc_num, doc_typ }) => ({
        doc_num,
        doc_typ,
        docs: summary.docs
          .filter((d) => d.nature === nature)
          .map((d, i) => ({ num: i + 1, from: d.from, to: d.to, totnum: d.total, cancel: d.cancelled, net_issue: d.total - d.cancelled })),
      }))
      .filter((n) => n.docs.length),
  };
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
      csamt: r2(h.cess.minor),
    })),
  };
  // Table 11: advances for services, by place of supply, one item per rate (ad_amt is the advance less its tax).
  const advanceTable = (rows: Gstr1Summary['advances']['received']) =>
    [...new Set(rows.map((r) => r.placeOfSupply))].map((pos) => ({
      pos,
      sply_ty: rows.find((r) => r.placeOfSupply === pos)!.interState ? 'INTER' : 'INTRA',
      itms: rows.filter((r) => r.placeOfSupply === pos).map((r) => ({ rt: r.rate, ad_amt: r2(r.taxable), iamt: r2(r.igst), camt: r2(r.cgst), samt: r2(r.sgst), csamt: r2(r.cess) })),
    }));
  const at = advanceTable(summary.advances.received);
  const txpd = advanceTable(summary.advances.adjusted);

  // Amendments: each changed document with its original number and date, as now revised.
  const a = summary.amendments;
  const orig = (d: Gstr1Row[]) => d[0] as AmendedRow;
  const b2ba = a ? [...byKey(byDocument(a.b2ba), (d) => d[0].gstin ?? '').entries()].map(([ctin, docs]) => ({ ctin, inv: docs.map((d) => ({ oinum: orig(d).originalNumber, oidt: dmy(orig(d).originalDate), ...invoice(d) })) })) : [];
  const b2cla = a
    ? [...byKey(byDocument(a.b2cla), (d) => d[0].placeOfSupply).entries()].map(([pos, docs]) => ({
        pos,
        inv: docs.map((d) => ({ oinum: orig(d).originalNumber, oidt: dmy(orig(d).originalDate), inum: d[0].number, idt: dmy(d[0].date), val: r2(d[0].invoiceValue.minor), itms: itemsOf(d) })),
      }))
    : [];
  const expa = a
    ? [...byKey(byDocument(a.expa), (d) => (d.some((r) => r.igst.minor > 0) ? 'WPAY' : 'WOPAY')).entries()].map(([exp_typ, docs]) => ({
        exp_typ,
        inv: docs.map((d) => ({ oinum: orig(d).originalNumber, oidt: dmy(orig(d).originalDate), inum: d[0].number, idt: dmy(d[0].date), val: r2(d[0].invoiceValue.minor), itms: itemsOf(d).map((i) => ({ txval: i.itm_det.txval, rt: i.itm_det.rt, iamt: i.itm_det.iamt, csamt: i.itm_det.csamt })) })),
      }))
    : [];
  const cdnra = a ? [...byKey(byDocument(a.cdnra), (d) => d[0].gstin ?? '').entries()].map(([ctin, docs]) => ({ ctin, nt: docs.map((d) => ({ ont_num: orig(d).originalNumber, ont_dt: dmy(orig(d).originalDate), ...note(d) })) })) : [];
  const cdnura = a
    ? byDocument(a.cdnura).map((d) => {
        const exported = !!d[0].exported;
        const typ = exported ? (d.some((r) => r.igst.minor > 0) ? 'EXPWP' : 'EXPWOP') : 'B2CL';
        const { pos, ...rest } = note(d);
        return { ont_num: orig(d).originalNumber, ont_dt: dmy(orig(d).originalDate), typ, ...rest, ...(exported ? {} : { pos }) };
      })
    : [];
  // B2CSA restates each original month's consumer supplies by place of supply and rate.
  const b2csa = (a?.b2csa ?? []).flatMap((m) =>
    consolidateB2cs(m.rows, homeState, 'INR').map((l) => ({
      omon: m.originalPeriod,
      sply_ty: l.supplyType,
      pos: l.placeOfSupply,
      typ: 'OE',
      itms: [{ rt: l.rate, txval: r2(l.taxableValue.minor), iamt: r2(l.igst.minor), camt: r2(l.cgst.minor), samt: r2(l.sgst.minor), csamt: r2(l.cess.minor) }],
    })),
  );
  const amended = { ...(b2ba.length && { b2ba }), ...(b2cla.length && { b2cla }), ...(b2csa.length && { b2csa }), ...(expa.length && { expa }), ...(cdnra.length && { cdnra }), ...(cdnura.length && { cdnura }) };
  return { gstin, fp: period, version: 'GST3.1.6', hash: 'hash', b2b, b2cl, b2cs, exp, cdnr, cdnur, nil, hsn, doc_issue, ...(at.length && { at }), ...(txpd.length && { txpd }), ...amended };
}
