import { money, type Money } from '../lib/money';
import type { DocumentLine, DocumentTotals } from '../types';
import { calculateLine } from './lineCalc';

/** One item's share of the compensation cess on a document. */
export type CessRow = {
  lineId: string;
  name: string;
  hsnCode?: string;
  /** The value the cess is charged on: the line after its discount, tax taken out of an inclusive price. */
  taxable: Money;
  cessRate: number;
  cess: Money;
  /** Cess the buyer pays under reverse charge: shown, but not in the document's total. */
  reverseCharge: boolean;
};

/**
 * The cess on a document, item by item. The document charges cess per rate group (category, GST
 * rate, cess rate), so each group's cess is shared across its lines in proportion to their taxable
 * values, the paise left over going to the lines with the largest remainders: the rows always add
 * up to the "Cess x%" lines in the totals. Empty when nothing on the document carries cess.
 *
 * `reverseCharge` is the document's own reverse-charge switch, which puts every line under it.
 */
export function cessBreakup(lines: DocumentLine[], totals: DocumentTotals, currency: string, reverseCharge?: boolean): CessRow[] {
  const ctx = { regime: 'GST' as const, registered: true, reverseCharge };
  const rows: CessRow[] = [];
  for (const tl of totals.taxLines) {
    const cess = tl.components.find((c) => c.type === 'CESS');
    if (!cess || cess.amount.minor === 0) continue;
    const rcm = !!tl.reverseCharge;
    const members = lines
      .map((line) => ({ line, b: calculateLine(line, currency, ctx) }))
      .filter(({ line, b }) => {
        if (line.gst?.reimbursement || (line.gst?.supplyType ?? 'taxable') !== 'taxable') return false;
        const lineRcm = !!reverseCharge || !!line.gst?.reverseCharge;
        return line.taxCategoryId === tl.categoryId && line.taxRate === tl.rate && (line.gst?.cessRate ?? 0) === cess.rate && lineRcm === rcm && b.taxable.minor > 0;
      });
    const base = members.reduce((s, m) => s + m.b.taxable.minor, 0);
    if (!base) continue;
    // Largest remainder: whole paise by proportion first, then one more to the biggest fractions.
    const exact = members.map((m) => (cess.amount.minor * m.b.taxable.minor) / base);
    const shares = exact.map((x) => Math.floor(x));
    let left = cess.amount.minor - shares.reduce((s, x) => s + x, 0);
    exact
      .map((x, i) => ({ i, frac: x - Math.floor(x) }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i)
      .forEach(({ i }) => {
        if (left > 0) {
          shares[i] += 1;
          left -= 1;
        }
      });
    members.forEach((m, i) =>
      rows.push({
        lineId: m.line.id,
        name: m.line.name,
        hsnCode: m.line.hsnCode,
        taxable: money(m.b.taxable.minor, currency),
        cessRate: cess.rate,
        cess: money(shares[i], currency),
        reverseCharge: rcm,
      }),
    );
  }
  // In the order the items sit on the document.
  const order = new Map(lines.map((l, i) => [l.id, i]));
  return rows.sort((a, b) => (order.get(a.lineId) ?? 0) - (order.get(b.lineId) ?? 0));
}
