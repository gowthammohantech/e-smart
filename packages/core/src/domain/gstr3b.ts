import { AdvanceEvent, advancesForPeriod } from './advanceTax';
import { BusinessDocument, Company, Expense, Party } from '../types';
import { CREDIT_KINDS } from './documentStates';
import { calculateLine, lineTreatment } from './lineCalc';
import { ItcBuckets, TaxSplit, itcOfDocument } from './itc';

/**
 * GSTR-3B, the monthly (or quarterly) return where tax is paid: what was supplied, what credit is
 * claimed, and how the tax is paid from credit and cash. Built from the books; amounts in paise.
 * The layout is the 2022 one (table 4 with 4A all credit, 4B reversals, 4C net, 4D for information).
 */

export type Amounts = { taxable: number; igst: number; cgst: number; sgst: number; cess: number };
const zero = (): Amounts => ({ taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
const add = (a: Amounts, b: Partial<Amounts>, sign = 1) => {
  a.taxable += sign * (b.taxable ?? 0);
  a.igst += sign * (b.igst ?? 0);
  a.cgst += sign * (b.cgst ?? 0);
  a.sgst += sign * (b.sgst ?? 0);
  a.cess += sign * (b.cess ?? 0);
};
export const taxOf = (a: Pick<Amounts, 'igst' | 'cgst' | 'sgst' | 'cess'>) => a.igst + a.cgst + a.sgst + a.cess;
const fromSplit = (s: TaxSplit): Amounts => ({ taxable: 0, ...s });

export type Gstr3b = {
  period: string;
  /** 3.1 outward supplies, and inward supplies under reverse charge. */
  outward: { taxable: Amounts; zeroRated: Amounts; nilExempt: Amounts; reverseCharge: Amounts; nonGst: Amounts };
  /** 3.2 inter-state supplies to unregistered persons, by place of supply. */
  interStateUnregistered: { placeOfSupply: string; taxable: number; igst: number }[];
  /** 4 eligible credit. */
  itc: {
    importOfGoods: Amounts;
    importOfServices: Amounts;
    reverseCharge: Amounts;
    isd: Amounts;
    allOther: Amounts;
    /** 4B(1): blocked (s.17(5)) and rules 38, 42, 43. 4B(2): other reversals (180 days unpaid). */
    reversedRules: Amounts;
    reversedOther: Amounts;
    net: Amounts;
    /** 4D(1): credit reversed earlier under 4B(2), reclaimed now (already inside 4A). */
    reclaimed: Amounts;
  };
  /** 5 exempt, nil and non-GST supplies received. */
  inwardExempt: { interState: number; intraState: number };
  /** 5.1 interest and late fee, in cash. */
  interest: Amounts;
  lateFee: { cgst: number; sgst: number };
};

type Input = {
  period: string;
  company: Company;
  /** The GSTIN this return is for: its state decides inter- or intra-state. */
  gstin: string;
  baseCurrency: string;
  documents: BusinessDocument[];
  expenses: Expense[];
  parties: Pick<Party, 'id' | 'gstRegistrationType' | 'taxId'>[];
  /** The split of each expense's GST (expenseTaxComponents), by expense id. */
  expenseSplit: Map<string, TaxSplit>;
  /** Tax on advances for services (advanceTaxEvents) of the GSTIN's receipts. */
  advances?: AdvanceEvent[];
};

const SALES = ['invoice', 'debitNote', 'salesReturn', 'creditNote'];
const PURCHASES = ['purchaseBill', 'supplierDebitNote', 'purchaseReturn', 'supplierCreditNote'];
const OFF = ['draft', 'requested', 'cancelled', 'rejected'];

const inPeriod = (date: string, period: string) => date.slice(5, 7) === period.slice(0, 2) && date.slice(0, 4) === period.slice(2);

/**
 * The 3B for one GSTIN and period. Outward supplies are the period's sales and notes. Credit is what
 * 2B matched and the business claimed for this period (`itcClaimPeriod`), self-assessed reverse
 * charge on the period's bills, and the period's expenses carrying credit. 180-day reversals and
 * reclaims come from the bills' `itcReversedOn` and `itcReclaimedOn`.
 */
export function gstr3b(input: Input): Gstr3b {
  const { period, documents, baseCurrency } = input;
  const home = input.gstin.slice(0, 2);
  const out: Gstr3b = {
    period,
    outward: { taxable: zero(), zeroRated: zero(), nilExempt: zero(), reverseCharge: zero(), nonGst: zero() },
    interStateUnregistered: [],
    itc: { importOfGoods: zero(), importOfServices: zero(), reverseCharge: zero(), isd: zero(), allOther: zero(), reversedRules: zero(), reversedOther: zero(), net: zero(), reclaimed: zero() },
    inwardExempt: { interState: 0, intraState: 0 },
    interest: zero(),
    lateFee: { cgst: 0, sgst: 0 },
  };
  const unreg = new Map<string, { taxable: number; igst: number }>();

  for (const doc of documents) {
    if (OFF.includes(doc.status)) continue;
    const rate = doc.currency === baseCurrency ? 1 : doc.exchangeRate || 1;
    const b = (m: number) => Math.round(m * rate);
    const sign = CREDIT_KINDS.includes(doc.kind) ? -1 : 1;
    const party = input.parties.find((p) => p.id === doc.partyId);

    if (SALES.includes(doc.kind) && inPeriod(doc.date, period)) {
      const ctx = { regime: 'GST' as const, registered: doc.totals.totalTax.minor + (doc.totals.reverseChargeTax?.minor ?? 0) > 0, reverseCharge: doc.reverseCharge };
      const exported = party?.gstRegistrationType === 'overseas' || party?.gstRegistrationType === 'sez' || doc.placeOfSupplyStateCode === '96';
      for (const line of doc.lines) {
        if (line.gst?.reimbursement) continue;
        const t = lineTreatment(line, ctx);
        const c = calculateLine(line, doc.currency, ctx);
        const taxable = b(c.taxable.minor);
        const supply = line.gst?.supplyType ?? 'taxable';
        if (supply === 'nonGst') add(out.outward.nonGst, { taxable }, sign);
        else if (supply !== 'taxable' || (!exported && t.rate + t.cessRate === 0)) add(out.outward.nilExempt, { taxable }, sign);
        else if (exported) add(out.outward.zeroRated, { taxable }, sign);
        else if (!t.reverseCharge) add(out.outward.taxable, { taxable }, sign);
      }
      // Tax from the document's own components, so it ties to the invoices to the paisa.
      for (const tl of doc.totals.taxLines) {
        if (tl.reverseCharge) continue;
        const split = { igst: 0, cgst: 0, sgst: 0, cess: 0 };
        for (const comp of tl.components) {
          const k = comp.type.toLowerCase() as keyof typeof split;
          if (k in split) split[k] += b(comp.amount.minor);
        }
        add(exported ? out.outward.zeroRated : out.outward.taxable, split, sign);
      }
      // 3.2: inter-state supplies to unregistered buyers.
      const registered = !!(doc.partyGstin ?? party?.taxId) && party?.gstRegistrationType !== 'unregistered';
      const pos = doc.placeOfSupplyStateCode;
      if (!registered && !exported && pos && pos !== home) {
        const igst = doc.totals.taxLines.flatMap((l) => l.components).filter((c) => c.type === 'IGST').reduce((a, c) => a + b(c.amount.minor), 0);
        const row = unreg.get(pos) ?? { taxable: 0, igst: 0 };
        row.taxable += sign * b(doc.totals.taxableAmount.minor);
        row.igst += sign * igst;
        unreg.set(pos, row);
      }
    }

    if (PURCHASES.includes(doc.kind)) {
      const itc: ItcBuckets = itcOfDocument(doc, baseCurrency);
      // 3.1(d): reverse-charge tax the business owes, on the period's bills.
      if (inPeriod(doc.date, period)) {
        const rcm = doc.totals.taxLines.filter((l) => l.reverseCharge);
        if (rcm.length) {
          const taxable = rcm.reduce((a, l) => a + b(l.taxableAmount.minor), 0);
          const split = { igst: 0, cgst: 0, sgst: 0, cess: 0 };
          for (const comp of rcm.flatMap((l) => l.components)) {
            const k = comp.type.toLowerCase() as keyof typeof split;
            if (k in split) split[k] += b(comp.amount.minor);
          }
          add(out.outward.reverseCharge, { taxable, ...split }, sign);
          // Self-assessed credit is claimed with it: imports of services apart (4A(2)).
          const imported = party?.gstRegistrationType === 'overseas';
          add(imported ? out.itc.importOfServices : out.itc.reverseCharge, fromSplit(itc.reverseCharge));
        }
        // 5: exempt, nil and non-GST supplies received.
        const inter = (doc.partyGstin ?? party?.taxId)?.slice(0, 2) !== home;
        for (const line of doc.lines) {
          const supply = line.gst?.supplyType ?? 'taxable';
          if (supply === 'taxable') continue;
          const v = sign * b(calculateLine(line, doc.currency, { regime: 'GST', registered: false }).taxable.minor);
          if (inter) out.inwardExempt.interState += v;
          else out.inwardExempt.intraState += v;
        }
      }
      // 4A(5): credit on bills 2B matched and the business claimed for this period.
      if (doc.itcClaimPeriod === period) {
        // All of it, as 2B shows it; what the law blocks comes back out in 4B(1). Reverse charge is 4A(3), above.
        add(out.itc.allOther, fromSplit(sumSplits(itc.eligible, itc.capitalGoods, itc.blocked, itc.ineligible)));
        add(out.itc.reversedRules, fromSplit(sumSplits(itc.blocked, itc.ineligible)));
      }
      // 4B(2) and 4D(1): 180 days unpaid, reversed; paid since, claimed again.
      const claimable = sumSplits(itc.eligible, itc.capitalGoods);
      if (doc.itcReversedOn && inPeriod(doc.itcReversedOn, period)) add(out.itc.reversedOther, fromSplit(claimable));
      if (doc.itcReclaimedOn && inPeriod(doc.itcReclaimedOn, period)) {
        add(out.itc.allOther, fromSplit(claimable));
        add(out.itc.reclaimed, fromSplit(claimable));
      }
    }
  }

  // Expenses with credit, claimed in the month they're dated.
  for (const e of input.expenses) {
    if (!inPeriod(e.date, period)) continue;
    const split = input.expenseSplit.get(e.id);
    if (!split) continue;
    if (e.reverseCharge) {
      add(out.outward.reverseCharge, { taxable: Math.round(e.amount.minor * (e.exchangeRate || 1)), ...split });
      if ((e.itcEligibility ?? 'eligible') === 'eligible') add(out.itc.reverseCharge, fromSplit(split));
      continue;
    }
    add(out.itc.allOther, fromSplit(split));
    if ((e.itcEligibility ?? 'eligible') !== 'eligible') add(out.itc.reversedRules, fromSplit(split));
  }

  // Advances for services: tax on those received less those adjusted, in 3.1(a) (GSTR-1 table 11).
  if (input.advances?.length) {
    const from = `${period.slice(2)}-${period.slice(0, 2)}-01`;
    const to = new Date(Date.UTC(Number(period.slice(2)), Number(period.slice(0, 2)), 0)).toISOString().slice(0, 10);
    const t11 = advancesForPeriod(input.advances, from, to);
    for (const [rows, sign] of [[t11.received, 1], [t11.adjusted, -1]] as const) {
      for (const r of rows) add(out.outward.taxable, { taxable: sign * r.taxable, igst: sign * r.igst, cgst: sign * r.cgst, sgst: sign * r.sgst, cess: 0 });
    }
  }

  out.interStateUnregistered = [...unreg.entries()].filter(([, v]) => v.taxable || v.igst).map(([placeOfSupply, v]) => ({ placeOfSupply, ...v }));
  const i = out.itc;
  for (const k of ['igst', 'cgst', 'sgst', 'cess'] as const) {
    i.net[k] = i.importOfGoods[k] + i.importOfServices[k] + i.reverseCharge[k] + i.isd[k] + i.allOther[k] - i.reversedRules[k] - i.reversedOther[k];
  }
  return out;
}

const sumSplits = (...s: TaxSplit[]): TaxSplit => s.reduce((a, b) => ({ igst: a.igst + b.igst, cgst: a.cgst + b.cgst, sgst: a.sgst + b.sgst, cess: a.cess + b.cess }), { igst: 0, cgst: 0, sgst: 0, cess: 0 });

export type TaxKind = 'igst' | 'cgst' | 'sgst' | 'cess';
export type Utilization = {
  /** Tax payable: 3.1(a), (b) and (d), by kind. */
  liability: Record<TaxKind, number>;
  /** What each credit paid: credit[from][to]. */
  credit: Record<TaxKind, Record<TaxKind, number>>;
  /** Paid in cash, by kind: reverse charge always, and whatever credit didn't cover. */
  cash: Record<TaxKind, number>;
  /** Credit left to carry forward. */
  carriedForward: Record<TaxKind, number>;
};

const kinds = (): Record<TaxKind, number> => ({ igst: 0, cgst: 0, sgst: 0, cess: 0 });

/**
 * Pays the month's tax from credit in the order the law sets (CGST s.49, rule 88A), then cash.
 * IGST credit goes first: to IGST, then to CGST and SGST, split so their own credit can cover the
 * rest. CGST credit then pays CGST and IGST; SGST credit SGST and IGST; never CGST for SGST or the
 * other way. Cess credit pays only cess. Reverse-charge tax is paid in cash whatever credit there is.
 */
export function utilizeItc(liability: Record<TaxKind, number>, reverseCharge: Record<TaxKind, number>, available: Record<TaxKind, number>): Utilization {
  const owed = { igst: Math.max(liability.igst, 0), cgst: Math.max(liability.cgst, 0), sgst: Math.max(liability.sgst, 0), cess: Math.max(liability.cess, 0) };
  const left = { igst: Math.max(available.igst, 0), cgst: Math.max(available.cgst, 0), sgst: Math.max(available.sgst, 0), cess: Math.max(available.cess, 0) };
  const used: Utilization['credit'] = { igst: kinds(), cgst: kinds(), sgst: kinds(), cess: kinds() };
  const pay = (from: TaxKind, to: TaxKind, max = Infinity) => {
    const x = Math.min(left[from], owed[to], max);
    if (x <= 0) return;
    left[from] -= x;
    owed[to] -= x;
    used[from][to] += x;
  };
  pay('igst', 'igst');
  // IGST credit left must go to CGST and SGST before their own credit; aim it at what their own
  // credit can't cover, so nothing is paid in cash that credit could have paid.
  const shortC = Math.max(owed.cgst - left.cgst, 0);
  const shortS = Math.max(owed.sgst - left.sgst, 0);
  const towardShort = Math.min(left.igst, shortC + shortS);
  const toC = shortC + shortS > 0 ? Math.round((towardShort * shortC) / (shortC + shortS)) : 0;
  pay('igst', 'cgst', toC);
  pay('igst', 'sgst', towardShort - toC);
  pay('igst', 'cgst');
  pay('igst', 'sgst');
  pay('cgst', 'cgst');
  pay('cgst', 'igst');
  pay('sgst', 'sgst');
  pay('sgst', 'igst');
  pay('cess', 'cess');
  const cash = { igst: owed.igst + reverseCharge.igst, cgst: owed.cgst + reverseCharge.cgst, sgst: owed.sgst + reverseCharge.sgst, cess: owed.cess + reverseCharge.cess };
  return { liability: { igst: liability.igst + reverseCharge.igst, cgst: liability.cgst + reverseCharge.cgst, sgst: liability.sgst + reverseCharge.sgst, cess: liability.cess + reverseCharge.cess }, credit: used, cash, carriedForward: left };
}

/** The tax 3B says is payable, split into what credit may pay and what reverse charge needs in cash. */
export function liabilityOf(r: Gstr3b): { forward: Record<TaxKind, number>; reverseCharge: Record<TaxKind, number> } {
  const o = r.outward;
  return {
    forward: { igst: o.taxable.igst + o.zeroRated.igst, cgst: o.taxable.cgst, sgst: o.taxable.sgst, cess: o.taxable.cess + o.zeroRated.cess },
    reverseCharge: { igst: o.reverseCharge.igst, cgst: o.reverseCharge.cgst, sgst: o.reverseCharge.sgst, cess: o.reverseCharge.cess },
  };
}

/**
 * The 20th of the month after a monthly period; the 22nd or 24th after a QRMP quarter depending on
 * the state. Used for the late fee and interest the return shows.
 */
export function dueDate(period: string, frequency: 'monthly' | 'qrmp', stateCode: string): string {
  const m = Number(period.slice(0, 2));
  const y = Number(period.slice(2));
  const next = new Date(Date.UTC(y, m, 1));
  // QRMP: the western and southern states and their union territories file on the 22nd, the rest on the 24th (Notification 76/2020).
  const day = frequency === 'monthly' ? 20 : QRMP_22.includes(stateCode) ? 22 : 24;
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${day}`;
}
const QRMP_22 = ['22', '23', '24', '25', '26', '27', '29', '30', '31', '32', '33', '34', '35', '36', '37', '97'];

/**
 * Late fee for filing on `filedOn`: ₹50 a day (₹25 CGST + ₹25 SGST), ₹20 for a nil return, capped
 * at ₹10,000 (₹500 for nil). Interest at 18% a year on tax paid in cash after the due date.
 */
export function lateFeeAndInterest(r: Gstr3b, cash: Record<TaxKind, number>, due: string, filedOn: string): { lateFee: { cgst: number; sgst: number }; interest: Record<TaxKind, number> } {
  const days = Math.max(0, Math.round((Date.parse(filedOn) - Date.parse(due)) / 86_400_000));
  const nil = taxOf(r.outward.taxable) + taxOf(r.outward.zeroRated) + taxOf(r.outward.reverseCharge) === 0;
  const perDay = nil ? 1000 : 2500;
  const cap = nil ? 25_000 : 5_00_000;
  const half = Math.min(days * perDay, cap);
  const interest = kinds();
  for (const k of ['igst', 'cgst', 'sgst', 'cess'] as const) interest[k] = Math.round((cash[k] * 18 * days) / (100 * 365));
  return { lateFee: { cgst: half, sgst: half }, interest };
}

/** GSTR-3B as GSTN takes it (rupees, two decimals). */
export function gstr3bJson(r: Gstr3b, gstin: string, u: Utilization) {
  const v = (minor: number) => Math.round(minor) / 100;
  const row = (a: Amounts) => ({ txval: v(a.taxable), iamt: v(a.igst), camt: v(a.cgst), samt: v(a.sgst), csamt: v(a.cess) });
  const tax = (a: Amounts) => ({ iamt: v(a.igst), camt: v(a.cgst), samt: v(a.sgst), csamt: v(a.cess) });
  return {
    gstin,
    ret_period: r.period,
    sup_details: {
      osup_det: row(r.outward.taxable),
      osup_zero: { txval: v(r.outward.zeroRated.taxable), iamt: v(r.outward.zeroRated.igst), csamt: v(r.outward.zeroRated.cess) },
      osup_nil_exmp: { txval: v(r.outward.nilExempt.taxable) },
      isup_rev: row(r.outward.reverseCharge),
      osup_nongst: { txval: v(r.outward.nonGst.taxable) },
    },
    inter_sup: { unreg_details: r.interStateUnregistered.map((x) => ({ pos: x.placeOfSupply, txval: v(x.taxable), iamt: v(x.igst) })), comp_details: [], uin_details: [] },
    itc_elg: {
      itc_avl: [
        { ty: 'IMPG', ...tax(r.itc.importOfGoods) },
        { ty: 'IMPS', ...tax(r.itc.importOfServices) },
        { ty: 'ISRC', ...tax(r.itc.reverseCharge) },
        { ty: 'ISD', ...tax(r.itc.isd) },
        { ty: 'OTH', ...tax(r.itc.allOther) },
      ],
      itc_rev: [
        { ty: 'RUL', ...tax(r.itc.reversedRules) },
        { ty: 'OTH', ...tax(r.itc.reversedOther) },
      ],
      itc_net: tax(r.itc.net),
      itc_inelg: [
        { ty: 'RUL', ...tax(r.itc.reclaimed) },
        { ty: 'OTH', iamt: 0, camt: 0, samt: 0, csamt: 0 },
      ],
    },
    inward_sup: { isup_details: [{ ty: 'GST', inter: v(r.inwardExempt.interState), intra: v(r.inwardExempt.intraState) }, { ty: 'NONGST', inter: 0, intra: 0 }] },
    intr_ltfee: { intr_details: tax(r.interest), ltfee_details: { iamt: 0, camt: v(r.lateFee.cgst), samt: v(r.lateFee.sgst), csamt: 0 } },
    // Our totals, for comparing with the portal's summary before filing.
    totals: { taxableMinor: r.outward.taxable.taxable + r.outward.zeroRated.taxable, taxMinor: taxOf(r.outward.taxable) + taxOf(r.outward.zeroRated) + taxOf(r.outward.reverseCharge), cashMinor: u.cash.igst + u.cash.cgst + u.cash.sgst + u.cash.cess },
  };
}
