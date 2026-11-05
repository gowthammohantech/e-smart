import { BusinessDocument, DocumentKind, DocumentLine, Item, StockMovement, StockMovementType } from '../types';
import { Money, money, multiply, sum, zero } from '../lib/money';

/** Direction each movement type applies to on-hand quantity (FRD 13). */
export const MOVEMENT_SIGN: Record<StockMovementType, 1 | -1> = {
  opening: 1,
  purchaseReceipt: 1,
  salesIssue: -1,
  salesReturn: 1,
  purchaseReturn: -1,
  transferIn: 1,
  transferOut: -1,
  adjustment: 1, // quantity itself carries the sign
};

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  opening: 'Opening stock',
  purchaseReceipt: 'Purchase receipt',
  salesIssue: 'Sales issue',
  salesReturn: 'Sales return',
  purchaseReturn: 'Purchase return',
  transferIn: 'Transfer in',
  transferOut: 'Transfer out',
  adjustment: 'Adjustment',
};

export function signedQuantity(m: StockMovement): number {
  return m.type === 'adjustment' ? m.quantity : MOVEMENT_SIGN[m.type] * Math.abs(m.quantity);
}

/** Current stock is always derived from the immutable movement list. */
export function stockOnHand(itemId: string, movements: StockMovement[], branchId?: string): number {
  return movements
    .filter((m) => m.itemId === itemId && (!branchId || m.branchId === branchId))
    .reduce((acc, m) => acc + signedQuantity(m), 0);
}

/** Kinds whose finalising takes stock out of the branch. */
export const OUTBOUND_KINDS: DocumentKind[] = ['invoice', 'delivery', 'purchaseReturn'];

export type StockShortfall = { itemId: string; name: string; unit: string; onHand: number; needed: number };

/**
 * Tracked goods a document would take below zero at its branch if it were
 * finalised now. Empty when the company allows negative stock, when the kind
 * does not take stock out, or when the stock already left with the document
 * it came from (an invoice made from a delivery).
 */
export function stockShortfalls(args: {
  doc: Pick<BusinessDocument, 'kind' | 'branchId' | 'lines' | 'sourceDocumentId'> & { date?: string };
  items: Item[];
  movements: StockMovement[];
  allowNegativeStock?: boolean;
}): StockShortfall[] {
  const { doc, items, movements } = args;
  if (args.allowNegativeStock || !OUTBOUND_KINDS.includes(doc.kind)) return [];
  if (doc.sourceDocumentId && movements.some((m) => m.referenceId === doc.sourceDocumentId)) return [];
  // Dated, a document can only use stock that was there on its date.
  const available = doc.date ? stockMapOn(movements, doc.date, doc.branchId) : stockMap(movements, doc.branchId);
  return shortfallsAgainst(available, doc.lines, items);
}

/**
 * The lines' tracked goods that need more than `available` holds (item id to
 * quantity, e.g. the server's stock on the document's date). Items not in
 * `items` count as tracked goods when `available` names them, and take their
 * name and unit from the line.
 */
export function shortfallsAgainst(
  available: Record<string, number>,
  lines: Pick<DocumentLine, 'itemId' | 'quantity' | 'name' | 'unit'>[],
  items: Pick<Item, 'id' | 'name' | 'unit' | 'trackInventory' | 'type'>[],
): StockShortfall[] {
  const needed = new Map<string, { qty: number; line: (typeof lines)[number] }>();
  lines.forEach((l) => {
    if (l.itemId) needed.set(l.itemId, { qty: (needed.get(l.itemId)?.qty ?? 0) + Math.abs(l.quantity), line: l });
  });
  const out: StockShortfall[] = [];
  needed.forEach(({ qty, line }, itemId) => {
    const item = items.find((i) => i.id === itemId);
    if (item ? !item.trackInventory || item.type !== 'goods' : !(itemId in available)) return;
    const onHand = available[itemId] ?? 0;
    if (onHand < qty) out.push({ itemId, name: item?.name ?? line.name, unit: item?.unit ?? line.unit, onHand, needed: qty });
  });
  return out;
}

export function stockMap(movements: StockMovement[], branchId?: string): Record<string, number> {
  const out: Record<string, number> = {};
  movements.forEach((m) => {
    if (branchId && m.branchId !== branchId) return;
    out[m.itemId] = (out[m.itemId] ?? 0) + signedQuantity(m);
  });
  return out;
}

/**
 * Stock of each item that a document dated `date` (yyyy-MM-dd) can take out:
 * what was there by the end of that day, but never more than the lowest the
 * stock gets on any later day. Stock bought the day after can't be sold the
 * day before, and a back-dated sale can't take stock a later sale already used.
 */
export function stockMapOn(movements: StockMovement[], date: string, branchId?: string): Record<string, number> {
  const byItem = new Map<string, StockMovement[]>();
  movements.forEach((m) => {
    if (branchId && m.branchId !== branchId) return;
    const list = byItem.get(m.itemId);
    if (list) list.push(m);
    else byItem.set(m.itemId, [m]);
  });
  const out: Record<string, number> = {};
  byItem.forEach((list, itemId) => {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    let i = 0;
    for (; i < sorted.length && sorted[i].date <= date; i++) balance += signedQuantity(sorted[i]);
    let lowest = balance;
    // The balance at the end of each later day.
    for (; i < sorted.length; i++) {
      balance += signedQuantity(sorted[i]);
      if (i === sorted.length - 1 || sorted[i + 1].date !== sorted[i].date) lowest = Math.min(lowest, balance);
    }
    out[itemId] = lowest;
  });
  return out;
}

export type StockLedgerRow = {
  movement: StockMovement;
  delta: number;
  balance: number;
};

export function ledgerFor(itemId: string, movements: StockMovement[], branchId?: string): StockLedgerRow[] {
  const rows = movements
    .filter((m) => m.itemId === itemId && (!branchId || m.branchId === branchId))
    .slice()
    .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));

  let balance = 0;
  return rows.map((movement) => {
    const delta = signedQuantity(movement);
    balance += delta;
    return { movement, delta, balance };
  });
}

/** Weighted-average valuation of current stock, in the company base currency. */
export function stockValue(item: Item, movements: StockMovement[], baseCurrency: string): Money {
  const qty = stockOnHand(item.id, movements);
  if (qty <= 0) return zero(baseCurrency);
  const inbound = movements.filter(
    (m) => m.itemId === item.id && signedQuantity(m) > 0 && m.unitCost.minor > 0,
  );
  if (inbound.length === 0) return multiply(money(item.purchasePrice.minor, baseCurrency), qty);
  const totalQty = inbound.reduce((a, m) => a + signedQuantity(m), 0);
  const totalCost = sum(
    inbound.map((m) => multiply(money(m.unitCost.minor, baseCurrency), signedQuantity(m))),
    baseCurrency,
  );
  const avg = totalQty > 0 ? totalCost.minor / totalQty : item.purchasePrice.minor;
  return money(Math.round(avg * qty), baseCurrency);
}

export function isLowStock(item: Item, onHand: number): boolean {
  return item.trackInventory && item.reorderLevel > 0 && onHand <= item.reorderLevel;
}

export function isOutOfStock(item: Item, onHand: number): boolean {
  return item.trackInventory && onHand <= 0;
}

/** A movement with what it moved in value: base-currency paise, positive in, negative out. */
export type CostedMovement = StockMovement & { cost: number };

/**
 * Values every movement at a moving weighted average, item by item across the company (RULES 6.2).
 *
 * - Stock in at a price (opening, purchase receipt, a count found more with a cost) adds at that
 *   price and moves the average.
 * - Stock out (a sale, a count found less, a transfer) leaves at the average on its day.
 * - A sales return comes back at what its invoice's goods left at, and a purchase return goes back
 *   at what its bill's goods came in at, when `sourceOf` names the document returned against;
 *   otherwise at the average.
 * - A document cancelled since, whose movements net to nothing, moves no value.
 * - Stock that has never come in at a price is valued at the item's purchase price.
 * - Transfers between branches net to nothing for the company.
 *
 * Movements are taken in date order, then in the order they were recorded; they come back in the
 * order given.
 */
export function costMovements(
  items: Pick<Item, 'id' | 'purchasePrice'>[],
  movements: StockMovement[],
  opts: {
    sourceOf?: (documentId: string) => string | undefined;
    /** Stock already there before the first movement, by item: its quantity and value. */
    seed?: Map<string, { qty: number; value: number }>;
  } = {},
): CostedMovement[] {
  const price = new Map(items.map((i) => [i.id, i.purchasePrice.minor]));
  // A document cancelled since: its movements and their reversal net to nothing, item by item.
  const net = new Map<string, number>();
  for (const m of movements) if (m.referenceId) net.set(`${m.referenceId}|${m.itemId}`, (net.get(`${m.referenceId}|${m.itemId}`) ?? 0) + signedQuantity(m));
  const voided = (m: StockMovement) => !!m.referenceId && Math.abs(net.get(`${m.referenceId}|${m.itemId}`) ?? 0) < 1e-9;

  const sorted = [...movements].sort((a, b) => (a.date === b.date ? (a.createdAt ?? '').localeCompare(b.createdAt ?? '') : a.date.localeCompare(b.date)));
  const state = new Map<string, { qty: number; value: number }>();
  // What each document's goods moved at, per unit, by item: for the returns against it.
  const unitCostOf = new Map<string, number>();
  const costOf = new Map<StockMovement, number>();

  for (const m of sorted) {
    const s = state.get(m.itemId) ?? { ...(opts.seed?.get(m.itemId) ?? { qty: 0, value: 0 }) };
    state.set(m.itemId, s);
    const q = signedQuantity(m);
    if (!q || voided(m)) {
      costOf.set(m, 0);
      continue;
    }
    const average = s.qty > 0 ? s.value / s.qty : (price.get(m.itemId) ?? 0);
    const source = m.referenceId && opts.sourceOf?.(m.referenceId);
    const sourceUnit = source ? unitCostOf.get(`${source}|${m.itemId}`) : undefined;
    let unit: number;
    if (q > 0) {
      const priced = m.type === 'opening' || m.type === 'purchaseReceipt' || (m.type === 'adjustment' && m.unitCost.minor > 0);
      unit = m.type === 'salesReturn' && sourceUnit !== undefined ? sourceUnit : priced && m.unitCost.minor > 0 ? m.unitCost.minor : average;
    } else {
      unit = m.type === 'purchaseReturn' && sourceUnit !== undefined ? sourceUnit : average;
    }
    let cost = unit * q;
    // Issued at the average, the last of the stock takes whatever value is left, so stock
    // run down to nothing is worth nothing; anything beyond (negative stock) goes at the average.
    if (q < 0 && unit === average && s.qty > 0 && s.qty + q <= 1e-9) cost = -s.value + average * (s.qty + q);
    s.qty += q;
    s.value += cost;
    if (m.referenceId) unitCostOf.set(`${m.referenceId}|${m.itemId}`, unit);
    costOf.set(m, cost);
  }
  // In the order given.
  return movements.map((m) => ({ ...m, cost: costOf.get(m) ?? 0 }));
}

/** The value of stock on hand at the end of `date` (or of everything), from costed movements. */
export function costedStockValue(costed: CostedMovement[], date?: string): number {
  return costed.reduce((a, m) => (date && m.date > date ? a : a + m.cost), 0);
}

/** Perpetual stock from a day: the movements from then on at cost, and what was there the day before. */
export type PerpetualStock = {
  from: string;
  costed: CostedMovement[];
  /** Stock in hand at the end of the day before `from`, valued as the periodic books valued it. */
  broughtForward: number;
};

/**
 * The stock side of perpetual books from `from` (RULES 6.2). Up to the day before, stock is valued as
 * the periodic books did, so the years before keep their closing stock; from that value on, every
 * movement is costed at the moving average (costMovements). Opening stock counts from the start.
 */
export function perpetualStock(
  items: Item[],
  movements: StockMovement[],
  from: string,
  baseCurrency: string,
  sourceOf?: (documentId: string) => string | undefined,
): PerpetualStock {
  const before = movements.filter((m) => m.type === 'opening' || m.date < from);
  const seed = new Map<string, { qty: number; value: number }>();
  let broughtForward = 0;
  for (const item of items) {
    if (!item.trackInventory) continue;
    const qty = stockOnHand(item.id, before);
    const value = stockValue(item, before, baseCurrency).minor;
    if (qty || value) seed.set(item.id, { qty, value });
    broughtForward += value;
  }
  const after = movements.filter((m) => m.type !== 'opening' && m.date >= from);
  return { from, costed: costMovements(items, after, { sourceOf, seed }), broughtForward };
}

/**
 * What each sale's goods cost under perpetual stock, by document: positive for what an invoice (or the
 * delivery it was made from) took out, negative for what a return brought back. It is the same figure
 * Cost of goods sold posts, so the profit report and the books agree.
 */
export function goodsCostByDocument(stock: PerpetualStock, documents: Pick<BusinessDocument, 'id' | 'sourceDocumentId'>[]): Map<string, number> {
  const byRef = new Map<string, number>();
  for (const m of stock.costed) {
    if ((m.type !== 'salesIssue' && m.type !== 'salesReturn') || !m.referenceId) continue;
    byRef.set(m.referenceId, (byRef.get(m.referenceId) ?? 0) - m.cost);
  }
  const out = new Map<string, number>();
  for (const d of documents) {
    // An invoice made from a delivery challan: the goods left with the challan.
    const cost = byRef.get(d.id) ?? (d.sourceDocumentId ? byRef.get(d.sourceDocumentId) : undefined);
    if (cost !== undefined) out.set(d.id, cost);
  }
  return out;
}
