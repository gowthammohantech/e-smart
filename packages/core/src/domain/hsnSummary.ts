/**
 * The HSN/SAC-wise tax table printed under an invoice's items: one row per code and rate, with
 * its taxable value and its CGST, SGST or IGST and cess.
 *
 * The amounts are the document's own tax lines shared out (`lineTaxes`), not each line taxed again: a tax line
 * is the tax on a rate slab's whole taxable value, and taxing each line apart could land a paisa
 * away. Each slab's components are split over its rows by taxable value with the remainder going
 * to the largest share, so the table always adds up to the tax on the invoice.
 */
import type { BusinessDocument, TaxType } from '../types';
import { money, zero, type Money } from '../lib/money';
import { calculateLine, lineTreatment, linesWithCharges } from './lineCalc';

export type HsnSummaryRow = {
  /** Empty when the line has none. */
  hsnCode: string;
  rate: number;
  /** Tax the buyer pays under reverse charge, not on this invoice's total. */
  reverseCharge: boolean;
  taxable: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  cess: Money;
  totalTax: Money;
};

export type HsnSummary = {
  rows: HsnSummaryRow[];
  total: Omit<HsnSummaryRow, 'hsnCode' | 'rate' | 'reverseCharge'>;
  /** Whether the tax is IGST (inter-state) rather than CGST and SGST. */
  interState: boolean;
};

const COLUMN: Partial<Record<TaxType, 'cgst' | 'sgst' | 'igst' | 'cess'>> = { CGST: 'cgst', SGST: 'sgst', IGST: 'igst', CESS: 'cess' };

/** `total` shared over `weights` in whole paise, the remainder to the largest weights first. */
function share(total: number, weights: number[]): number[] {
  const all = weights.reduce((a, w) => a + w, 0);
  if (!all) return weights.map((_, i) => (i === 0 ? total : 0));
  const exact = weights.map((w) => (total * w) / all);
  const out = exact.map((x) => Math.trunc(x));
  let left = total - out.reduce((a, x) => a + x, 0);
  const order = exact.map((x, i) => [Math.abs(x - out[i]), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const step = Math.sign(left);
  for (let k = 0; left !== 0 && order.length; k = (k + 1) % order.length) {
    out[order[k][1]] += step;
    left -= step;
  }
  return out;
}

export type LineTax = {
  lineId: string;
  /** Quantity times rate, before the line's discount. */
  gross: Money;
  discount: Money;
  /** After the line's discount, with its share of charges taxed with the lines. */
  taxable: Money;
  rate: number;
  cessRate: number;
  reverseCharge: boolean;
  cgst: Money;
  sgst: Money;
  igst: Money;
  cess: Money;
  /** GST and cess on the line: its share of the document's tax. */
  tax: Money;
};

/**
 * Each line's taxable value and its share of the document's tax, in line order, reimbursements
 * left out. Every slab's tax lines are shared over its lines by taxable value, so the lines add
 * up to the tax on the invoice to the paisa.
 */
export function lineTaxes(doc: BusinessDocument): LineTax[] {
  const currency = doc.currency;
  const ctx = { regime: 'GST' as const, registered: doc.totals.taxLines.length > 0, reverseCharge: doc.reverseCharge };
  const entries = linesWithCharges(doc)
    .filter((line) => !line.gst?.reimbursement)
    .map((line) => {
      const b = calculateLine(line, currency, ctx);
      const { rate, cessRate, reverseCharge } = lineTreatment(line, ctx);
      const tax: LineTax = { lineId: line.id, gross: b.gross, discount: b.discount, taxable: b.taxable, rate, cessRate, reverseCharge, cgst: zero(currency), sgst: zero(currency), igst: zero(currency), cess: zero(currency), tax: zero(currency) };
      return { categoryId: line.taxCategoryId, tax };
    });

  // The calculator groups a slab by category, rate and reverse charge.
  doc.totals.taxLines.forEach((tl) => {
    const members = entries.filter((e) => e.categoryId === tl.categoryId && e.tax.rate === tl.rate && e.tax.reverseCharge === !!tl.reverseCharge);
    if (!members.length) return;
    tl.components.forEach((c) => {
      const col = COLUMN[c.type];
      if (!col) return;
      const weights = members.map((e) => e.tax.taxable.minor * (col === 'cess' ? e.tax.cessRate : 1));
      share(c.amount.minor, weights).forEach((amount, i) => {
        const t = members[i].tax;
        t[col] = money(t[col].minor + amount, currency);
      });
    });
  });
  return entries.map(({ tax: t }) => ({ ...t, tax: money(t.cgst.minor + t.sgst.minor + t.igst.minor + t.cess.minor, currency) }));
}

export function hsnSummary(doc: BusinessDocument, taxes: LineTax[] = lineTaxes(doc)): HsnSummary {
  const currency = doc.currency;
  const groups = new Map<string, HsnSummaryRow>();
  taxes.forEach((t) => {
    const hsnCode = doc.lines.find((l) => l.id === t.lineId)?.hsnCode?.trim() ?? '';
    const key = `${hsnCode}|${t.rate}|${t.cessRate}|${t.reverseCharge ? 'rcm' : ''}`;
    const r = groups.get(key) ?? { hsnCode, rate: t.rate, reverseCharge: t.reverseCharge, taxable: zero(currency), cgst: zero(currency), sgst: zero(currency), igst: zero(currency), cess: zero(currency), totalTax: zero(currency) };
    const plus = (a: Money, b: Money) => money(a.minor + b.minor, currency);
    groups.set(key, { ...r, taxable: plus(r.taxable, t.taxable), cgst: plus(r.cgst, t.cgst), sgst: plus(r.sgst, t.sgst), igst: plus(r.igst, t.igst), cess: plus(r.cess, t.cess), totalTax: plus(r.totalTax, t.tax) });
  });

  const rows = Array.from(groups.values()).sort(
    (a, b) => Number(a.reverseCharge) - Number(b.reverseCharge) || Number(!a.hsnCode) - Number(!b.hsnCode) || a.hsnCode.localeCompare(b.hsnCode) || a.rate - b.rate,
  );

  const add = (k: 'taxable' | 'cgst' | 'sgst' | 'igst' | 'cess' | 'totalTax') => money(rows.reduce((a, r) => a + r[k].minor, 0), currency);
  return {
    rows,
    total: { taxable: add('taxable'), cgst: add('cgst'), sgst: add('sgst'), igst: add('igst'), cess: add('cess'), totalTax: add('totalTax') },
    interState: rows.some((r) => r.igst.minor !== 0),
  };
}
