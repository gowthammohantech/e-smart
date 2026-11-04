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
 * advance being adjusted, on that invoice's date. Amounts are base-currency paise.
 */
export type AdvanceEvent = {
  paymentId: string;
  /** Received: the advance's tax arises. Adjusted: an invoice was raised against it. */
  kind: 'received' | 'adjusted';
  date: string;
  /** The date the advance was received (on an adjustment, of the advance it adjusts). */
  receivedOn: string;
  documentId?: string;
  placeOfSupply: string;
  rate: number;
  interState: boolean;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
};

export function advanceTaxEvents(p: Payment, homeState: string | undefined, documentDate: (id: string) => string | undefined): AdvanceEvent[] {
  const at = p.advanceTax;
  if (!at || p.direction !== 'received' || !(at.rate > 0)) return [];
  const rate = p.exchangeRate || 1;
  const base = (minor: number) => Math.round(minor * rate);
  // Invoices raised on or before the receipt were settled, not paid in advance; an invoice the
  // app can't see is taken to be one of them, so tax is never charged on money it can't account for.
  const later = p.allocations.filter((a) => {
    const d = documentDate(a.documentId);
    return !!d && d > p.date;
  });
  const settled = p.allocations.filter((a) => !later.includes(a)).reduce((s, a) => s + a.amount.minor, 0);
  const gross = base(p.amount.minor - settled);
  if (gross <= 0) return [];
  const interState = !!homeState && homeState !== at.placeOfSupplyStateCode;
  const tax = inclusiveTax(money(gross, 'INR'), at.rate);
  // The tax shared out over each adjustment and what is still unadjusted, so the parts add up exactly.
  const adjustedGross = later.map((a) => base(a.amount.minor));
  const rest = Math.max(0, gross - adjustedGross.reduce((s, x) => s + x, 0));
  const taxParts = allocate(tax, [...adjustedGross, rest]);
  const event = (kind: AdvanceEvent['kind'], date: string, g: number, t: number, documentId?: string): AdvanceEvent => {
    const [c, s] = allocate(money(t, 'INR'), [1, 1]);
    return {
      paymentId: p.id,
      kind,
      date,
      receivedOn: p.date,
      documentId,
      placeOfSupply: at.placeOfSupplyStateCode,
      rate: at.rate,
      interState,
      taxable: g - t,
      igst: interState ? t : 0,
      cgst: interState ? 0 : c.minor,
      sgst: interState ? 0 : s.minor,
    };
  };
  return [
    event('received', p.date, gross, tax.minor),
    ...later.map((a, i) => event('adjusted', documentDate(a.documentId)!, adjustedGross[i], taxParts[i].minor, a.documentId)),
  ];
}

/** GSTR-1 table 11 rows: one per place of supply and rate. */
export type AdvanceRow = { placeOfSupply: string; rate: number; interState: boolean; taxable: number; igst: number; cgst: number; sgst: number; cess: number };

/**
 * Table 11 for a period. 11A: advances received in it, less what invoices in the same period already
 * adjusted (those are reported on the invoice alone). 11B: invoices in it raised against advances
 * received in an earlier period.
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
      rows.set(key, r);
    }
    return [...rows.values()].filter((r) => r.taxable || r.igst || r.cgst || r.sgst).sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.rate - b.rate);
  };
  const received = events.filter((e) => inPeriod(e.receivedOn));
  return {
    received: group([
      ...received.filter((e) => e.kind === 'received').map((e) => ({ e, sign: 1 })),
      ...received.filter((e) => e.kind === 'adjusted' && inPeriod(e.date)).map((e) => ({ e, sign: -1 })),
    ]),
    adjusted: group(events.filter((e) => e.kind === 'adjusted' && inPeriod(e.date) && e.receivedOn < from).map((e) => ({ e, sign: 1 }))),
  };
}
