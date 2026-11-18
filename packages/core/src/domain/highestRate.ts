/**
 * A service marked to follow the document's highest GST rate (installation, delivery, packing with
 * the goods they go with: the composite-supply idea, where the supporting service takes the principal
 * supply's rate). Its line in a document takes the highest rate among all the lines, its own included,
 * and can't be changed by hand. Only the GST rate follows: its SAC and cess stay its own, and the item
 * itself keeps its rate. A following line counts with its own rate (the item's), not the one it took,
 * so the rate also comes back down when the line that raised it goes.
 */

type Line = { id: string; taxCategoryId: string; taxRate?: number; gst?: { followsHighestRate?: boolean; supplyType?: string; reimbursement?: boolean } };

/** Whether a document line follows the highest rate (and so its rate is not edited by hand). */
export const followsHighestRate = (line: Pick<Line, 'gst'>) => !!line.gst?.followsHighestRate;

/**
 * The lines with every following line set to the highest rate, and those that moved. `ownCategoryOf`
 * is a following line's own tax category (its item's); `rateOf` a category's rate. Lines not
 * following are left as they are; a following line that is not taxable (exempt, a reimbursement)
 * keeps its 0% rate but takes the category.
 */
export function applyHighestRate<L extends Line>(
  lines: L[],
  ownCategoryOf: (line: L) => string,
  rateOf: (categoryId: string) => number,
): { lines: L[]; changed: L[] } {
  if (!lines.some(followsHighestRate)) return { lines, changed: [] };
  let best: { categoryId: string; rate: number } | undefined;
  for (const l of lines) {
    const categoryId = followsHighestRate(l) ? ownCategoryOf(l) : l.taxCategoryId;
    const rate = rateOf(categoryId);
    if (!best || rate > best.rate) best = { categoryId, rate };
  }
  if (!best) return { lines, changed: [] };
  const changed: L[] = [];
  const out = lines.map((l) => {
    if (!followsHighestRate(l) || l.taxCategoryId === best!.categoryId) return l;
    const taxable = !l.gst?.reimbursement && (l.gst?.supplyType ?? 'taxable') === 'taxable';
    const next = { ...l, taxCategoryId: best!.categoryId, taxRate: taxable ? best!.rate : 0 };
    changed.push(next);
    return next;
  });
  return { lines: changed.length ? out : lines, changed };
}
