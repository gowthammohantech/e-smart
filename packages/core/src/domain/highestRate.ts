/**
 * A service marked to follow the document's highest GST rate (installation, delivery, packing with
 * the goods they go with: the composite-supply idea, where the supporting service takes the principal
 * supply's rate). Its line takes the highest rate among the lines that don't follow (goods, and
 * services without the switch); following lines don't count, their own rates included. When every
 * line follows, each keeps its own rate. The rate is set for it, not locked: it can be changed by hand
 * on the document, and is set again only when what it follows changes. Only the GST rate follows:
 * its SAC and cess stay its own, and the item itself keeps its rate.
 */

type Line = { id: string; taxCategoryId: string; taxRate?: number; gst?: { followsHighestRate?: boolean; supplyType?: string; reimbursement?: boolean } };

/** Whether a document line follows the highest rate. */
export const followsHighestRate = (line: Pick<Line, 'gst'>) => !!line.gst?.followsHighestRate;

/** The highest-rated tax category among the lines that don't follow, or undefined when every line follows. */
export function highestCategoryOf<L extends Line>(lines: L[], rateOf: (categoryId: string) => number): { categoryId: string; rate: number } | undefined {
  let best: { categoryId: string; rate: number } | undefined;
  for (const l of lines) {
    if (followsHighestRate(l)) continue;
    const rate = rateOf(l.taxCategoryId);
    if (!best || rate > best.rate) best = { categoryId: l.taxCategoryId, rate };
  }
  return best;
}

/**
 * The lines with the following ones set to the highest rate (`only`: just those lines), and those that
 * moved. With no line to follow, a following line goes back to its own rate. `ownCategoryOf` is a
 * following line's own tax category (its item's); `rateOf` a category's rate. A following line that is
 * not taxable (exempt, a reimbursement) keeps its 0% rate but takes the category.
 */
export function applyHighestRate<L extends Line>(
  lines: L[],
  ownCategoryOf: (line: L) => string,
  rateOf: (categoryId: string) => number,
  only?: ReadonlySet<string>,
): { lines: L[]; changed: L[] } {
  if (!lines.some(followsHighestRate)) return { lines, changed: [] };
  const best = highestCategoryOf(lines, rateOf);
  const changed: L[] = [];
  const out = lines.map((l) => {
    if (!followsHighestRate(l) || (only && !only.has(l.id))) return l;
    const categoryId = best?.categoryId ?? ownCategoryOf(l);
    if (l.taxCategoryId === categoryId) return l;
    const taxable = !l.gst?.reimbursement && (l.gst?.supplyType ?? 'taxable') === 'taxable';
    const next = { ...l, taxCategoryId: categoryId, taxRate: taxable ? (best?.rate ?? rateOf(categoryId)) : 0 };
    changed.push(next);
    return next;
  });
  return { lines: changed.length ? out : lines, changed };
}
