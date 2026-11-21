import { allocate, inclusiveTax, money } from '../lib/money';
import { Payment } from '../types';

/**
 * GST on advances received for services (s.13(2)): the tax falls due when the money arrives, so it is
 * paid on the advance in the month received (GSTR-1 table 11A) and taken back in the month the invoice
 * is raised against it (table 11B), the invoice then carrying the tax in full. Advances for goods carry
 * no tax (notification 66/2017).
 *
 * The receipt's allocations say how it was applied. Money applied to an invoice dated on or before the
 * receipt settled that invoice and was never an advance; money applied to a later invoice is the
 * advance being adjusted, on that invoice's date. Money paid back out of it (a refund voucher, Rule 51)
 * takes its share of the tax back on the day it is refunded, as an adjustment does. Amounts are
 * base-currency paise.
 *
 * The amount received includes the tax (and any cess on the service). TDS the customer deducted from
 * the advance is part of what they paid for the service, so it counts with the money. A place of
 * supply the business doesn't know is taken as another state (IGST), and a rate it doesn't know as
 * 18% (DEFAULT_ADVANCE_RATE, applied where the advance is entered). RULES 8.12, pending CA sign-off.
 */
export const DEFAULT_ADVANCE_RATE = 18;

export type AdvanceEvent = {
  paymentId: string;
  /** Received: the advance's tax arises. Adjusted: an invoice was raised against it. Refunded: paid back. */
  kind: 'received' | 'adjusted' | 'refunded';
  date: string;
  /** The date the advance was received (on an adjustment, of the advance it adjusts). */
  receivedOn: string;
  documentId?: string;
  /** On a refund: the payment that paid it back. */
  refundId?: string;
  placeOfSupply: string;
  rate: number;
  interState: boolean;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  /** Cess on the advance (0 when none). */
  cess: number;
  /** The advance's SAC, when given. */
  hsn?: string;
};

/** The tax inside an amount received for a service, split by kind. */
export function advanceTaxSplit(grossMinor: number, rate: number, cessRate: number, interState: boolean): { taxable: number; igst: number; cgst: number; sgst: number; cess: number } {
  const total = inclusiveTax(money(grossMinor, 'INR'), rate + cessRate);
  const [gst, cess] = allocate(total, [rate, cessRate]);
  const [c, s] = allocate(gst, [1, 1]);
  return { taxable: grossMinor - total.minor, igst: interState ? gst.minor : 0, cgst: interState ? 0 : c.minor, sgst: interState ? 0 : s.minor, cess: cess.minor };
}

/** Inter-state unless both the business's state and the place of supply are known and the same. */
export const advanceInterState = (homeState: string | undefined, placeOfSupply: string | undefined) => !placeOfSupply || !homeState || homeState !== placeOfSupply;

export function advanceTaxEvents(p: Payment, homeState: string | undefined, documentDate: (id: string) => string | undefined): AdvanceEvent[] {
  const at = p.advanceTax;
  // On reverse charge the recipient pays the GST, on the advance too: the business owes none, posts none
  // and reports none in table 11; the invoice later raised against it charges none either.
  if (!at || at.reverseCharge || p.direction !== 'received' || !(at.rate > 0)) return [];
  const rate = p.exchangeRate || 1;
  const base = (minor: number) => Math.round(minor * rate);
  // Invoices raised on or before the receipt were settled, not paid in advance; an invoice the
  // app can't see is taken to be one of them, so tax is never charged on money it can't account for.
  const later = p.allocations.filter((a) => {
    const d = documentDate(a.documentId);
    return !!d && d > p.date;
  });
  const settled = p.allocations.filter((a) => !later.includes(a)).reduce((s, a) => s + a.amount.minor, 0);
  const gross = base(p.amount.minor + (p.advanceTds?.minor ?? 0) - settled);
  if (gross <= 0) return [];
  const interState = advanceInterState(homeState, at.placeOfSupplyStateCode);
  const cessRate = at.cessRate ?? 0;
  const tax = inclusiveTax(money(gross, 'INR'), at.rate + cessRate);
  // The tax shared out over each adjustment, each refund and what is still unadjusted, so the parts add up exactly.
  const adjustedGross = later.map((a) => base(a.amount.minor));
  const refunds = (p.refunds ?? []).filter((r) => r.date >= p.date);
  const refundedGross = refunds.map((r) => base(r.amount.minor));
  const rest = Math.max(0, gross - [...adjustedGross, ...refundedGross].reduce((s, x) => s + x, 0));
  const taxParts = allocate(tax, [...adjustedGross, ...refundedGross, rest]);
  const event = (kind: AdvanceEvent['kind'], date: string, g: number, t: number, documentId?: string, refundId?: string): AdvanceEvent => {
    const [gst, cess] = allocate(money(t, 'INR'), [at.rate, cessRate]);
    const [c, s] = allocate(gst, [1, 1]);
    return {
      paymentId: p.id,
      kind,
      date,
      receivedOn: p.date,
      documentId,
      refundId,
      placeOfSupply: at.placeOfSupplyStateCode,
      rate: at.rate,
      interState,
      taxable: g - t,
      igst: interState ? gst.minor : 0,
      cgst: interState ? 0 : c.minor,
      sgst: interState ? 0 : s.minor,
      cess: cess.minor,
      ...(at.hsn && { hsn: at.hsn }),
    };
  };
  return [
    event('received', p.date, gross, tax.minor),
    ...later.map((a, i) => event('adjusted', documentDate(a.documentId)!, adjustedGross[i], taxParts[i].minor, a.documentId)),
    ...refunds.map((r, i) => event('refunded', r.date, refundedGross[i], taxParts[later.length + i].minor, undefined, r.paymentId)),
  ];
}

/** GSTR-1 table 11 rows: one per place of supply and rate. */
export type AdvanceRow = { placeOfSupply: string; rate: number; interState: boolean; taxable: number; igst: number; cgst: number; sgst: number; cess: number };

/**
 * Table 11 for a period. 11A: advances received in it, less what invoices (or refunds) in the same
 * period already adjusted (those are reported on the invoice alone). 11B: invoices in it raised against
 * advances received in an earlier period, and refund vouchers issued in it for them.
 */
export function advancesForPeriod(events: AdvanceEvent[], from: string, to: string): { received: AdvanceRow[]; adjusted: AdvanceRow[] } {
  const inPeriod = (d: string) => d >= from && d <= to;
  const group = (list: { e: AdvanceEvent; sign: number }[]) => {
    const rows = new Map<string, AdvanceRow>();
    for (const { e, sign } of list) {
      const key = `${e.placeOfSupply}|${e.rate}`;
      const r = rows.get(key) ?? { placeOfSupply: e.placeOfSupply, rate: e.rate, interState: e.interState, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
      r.taxable += sign * e.taxable;
      r.igst += sign * e.igst;
      r.cgst += sign * e.cgst;
      r.sgst += sign * e.sgst;
      r.cess += sign * (e.cess ?? 0);
      rows.set(key, r);
    }
    return [...rows.values()].filter((r) => r.taxable || r.igst || r.cgst || r.sgst || r.cess).sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.rate - b.rate);
  };
  const received = events.filter((e) => inPeriod(e.receivedOn));
  return {
    received: group([
      ...received.filter((e) => e.kind === 'received').map((e) => ({ e, sign: 1 })),
      ...received.filter((e) => e.kind !== 'received' && inPeriod(e.date)).map((e) => ({ e, sign: -1 })),
    ]),
    adjusted: group(events.filter((e) => e.kind !== 'received' && inPeriod(e.date) && e.receivedOn < from).map((e) => ({ e, sign: 1 }))),
  };
}
