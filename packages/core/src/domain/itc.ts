import { BusinessDocument, Expense } from '../types';
import { calculateLine, lineTreatment, linesWithCharges } from './lineCalc';
import { CREDIT_KINDS } from './documentStates';

/** GST split the way the returns report it, in base-currency paise. */
export type TaxSplit = { igst: number; cgst: number; sgst: number; cess: number };

const empty = (): TaxSplit => ({ igst: 0, cgst: 0, sgst: 0, cess: 0 });
const addTo = (a: TaxSplit, b: TaxSplit, sign = 1) => {
  a.igst += sign * b.igst;
  a.cgst += sign * b.cgst;
  a.sgst += sign * b.sgst;
  a.cess += sign * b.cess;
};
export const splitTotal = (t: TaxSplit) => t.igst + t.cgst + t.sgst + t.cess;

/**
 * Input tax credit on a purchase, in the buckets GSTR-3B table 4 needs:
 * - `eligible`: ordinary credit (4A(5)),
 * - `capitalGoods`: credit on assets, part of 4A(5) but reported apart in the books,
 * - `reverseCharge`: tax the business self-assessed and may claim (4A(3)),
 * - `blocked`: s.17(5) credit (4D(1)), `ineligible`: other credit that can't be claimed (4D(2)).
 */
export type ItcBuckets = { eligible: TaxSplit; capitalGoods: TaxSplit; reverseCharge: TaxSplit; blocked: TaxSplit; ineligible: TaxSplit };

export function emptyItc(): ItcBuckets {
  return { eligible: empty(), capitalGoods: empty(), reverseCharge: empty(), blocked: empty(), ineligible: empty() };
}

/**
 * What one purchase bill, supplier note or purchase return carries, line by line. A supplier
 * credit note or return gives credit back, so it counts negative.
 */
export function itcOfDocument(doc: BusinessDocument, baseCurrency: string): ItcBuckets {
  const out = emptyItc();
  const rate = doc.currency === baseCurrency ? 1 : doc.exchangeRate || 1;
  const sign = CREDIT_KINDS.includes(doc.kind) ? -1 : 1;
  const inter = doc.totals.taxLines.some((l) => l.components.some((c) => c.type === 'IGST'));
  // The tax context the document was calculated in, as far as lines need it: whether any tax was charged or self-assessed.
  const taxed = doc.totals.totalTax.minor + (doc.totals.reverseChargeTax?.minor ?? 0) > 0;
  const ctx = { regime: 'GST' as const, registered: taxed, reverseCharge: doc.reverseCharge };
  // Charges taxed with the lines carry their credit with them (RULES 1.10).
  for (const line of linesWithCharges(doc)) {
    const t = lineTreatment(line, ctx);
    if (t.rate + t.cessRate <= 0) continue;
    const b = calculateLine(line, doc.currency, ctx);
    const all = Math.round(b.taxAmount.minor * rate);
    const cess = Math.round((all * t.cessRate) / (t.rate + t.cessRate));
    const gst = all - cess;
    const split: TaxSplit = inter ? { igst: gst, cgst: 0, sgst: 0, cess } : { igst: 0, cgst: Math.ceil(gst / 2), sgst: Math.floor(gst / 2), cess };
    const eligibility = line.gst?.itcEligibility ?? 'eligible';
    const bucket =
      eligibility === 'blocked' ? out.blocked : eligibility === 'ineligible' ? out.ineligible : t.reverseCharge ? out.reverseCharge : line.gst?.capitalGoods ? out.capitalGoods : out.eligible;
    addTo(bucket, split, sign);
  }
  return out;
}

/** An expense's credit, split as it was charged (see expenseTaxComponents). */
export function itcOfExpense(e: Expense, split: TaxSplit): ItcBuckets {
  const out = emptyItc();
  const eligibility = e.itcEligibility ?? 'eligible';
  const bucket = eligibility === 'blocked' ? out.blocked : eligibility === 'ineligible' ? out.ineligible : e.reverseCharge ? out.reverseCharge : out.eligible;
  addTo(bucket, split);
  return out;
}

/** Adds `b` into `a`, bucket by bucket. */
export function addItc(a: ItcBuckets, b: ItcBuckets, sign = 1): ItcBuckets {
  (Object.keys(a) as (keyof ItcBuckets)[]).forEach((k) => addTo(a[k], b[k], sign));
  return a;
}
