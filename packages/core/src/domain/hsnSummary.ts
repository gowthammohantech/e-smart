/**
 * The HSN/SAC-wise tax table printed under an invoice's items: one row per code and rate, with
 * its taxable value and its CGST, SGST or IGST and cess.
 *
 * The amounts are the document's own tax lines shared out, not each line taxed again: a tax line
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

export function hsnSummary(doc: BusinessDocument): HsnSummary {
  const currency = doc.currency;
  const taxed = doc.totals.taxLines.length > 0;
  const ctx = { regime: 'GST' as const, registered: taxed, reverseCharge: doc.reverseCharge };

  type Group = { row: HsnSummaryRow; categoryId: string; cessRate: number };
  const groups = new Map<string, Group>();
  linesWithCharges(doc).forEach((line) => {
    if (line.gst?.reimbursement) return;
    const b = calculateLine(line, currency, ctx);
    const { rate, cessRate, reverseCharge } = lineTreatment(line, ctx);
    const hsnCode = line.hsnCode?.trim() ?? '';
    const key = `${hsnCode}|${line.taxCategoryId}|${rate}|${cessRate}|${reverseCharge ? 'rcm' : ''}`;
    const g = groups.get(key) ?? {
      categoryId: line.taxCategoryId,
      cessRate,
      row: { hsnCode, rate, reverseCharge, taxable: zero(currency), cgst: zero(currency), sgst: zero(currency), igst: zero(currency), cess: zero(currency), totalTax: zero(currency) },
    };
    g.row.taxable = money(g.row.taxable.minor + b.taxable.minor, currency);
    groups.set(key, g);
  });
  const list = Array.from(groups.values());

  // Each slab's tax, shared over the rows in it (the calculator groups by category, rate and reverse charge).
  doc.totals.taxLines.forEach((tl) => {
    const members = list.filter((g) => g.categoryId === tl.categoryId && g.row.rate === tl.rate && g.row.reverseCharge === !!tl.reverseCharge);
    if (!members.length) return;
    tl.components.forEach((c) => {
      const col = COLUMN[c.type];
      if (!col) return;
      const weights = members.map((g) => g.row.taxable.minor * (col === 'cess' ? g.cessRate : 1));
      share(c.amount.minor, weights).forEach((amount, i) => {
        const r = members[i].row;
        r[col] = money(r[col].minor + amount, currency);
      });
    });
  });

  const rows = list
    .map(({ row }) => ({ ...row, totalTax: money(row.cgst.minor + row.sgst.minor + row.igst.minor + row.cess.minor, currency) }))
    .sort((a, b) => Number(a.reverseCharge) - Number(b.reverseCharge) || Number(!a.hsnCode) - Number(!b.hsnCode) || a.hsnCode.localeCompare(b.hsnCode) || a.rate - b.rate);

  const add = (k: 'taxable' | 'cgst' | 'sgst' | 'igst' | 'cess' | 'totalTax') => money(rows.reduce((a, r) => a + r[k].minor, 0), currency);
  return {
    rows,
    total: { taxable: add('taxable'), cgst: add('cgst'), sgst: add('sgst'), igst: add('igst'), cess: add('cess'), totalTax: add('totalTax') },
    interState: rows.some((r) => r.igst.minor !== 0),
  };
}
