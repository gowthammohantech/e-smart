import { BusinessDocument, DocumentKind, Item, StockMovement, StockMovementType } from '../types';
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
  doc: Pick<BusinessDocument, 'kind' | 'branchId' | 'lines' | 'sourceDocumentId'>;
  items: Item[];
  movements: StockMovement[];
  allowNegativeStock?: boolean;
}): StockShortfall[] {
  const { doc, items, movements } = args;
  if (args.allowNegativeStock || !OUTBOUND_KINDS.includes(doc.kind)) return [];
  if (doc.sourceDocumentId && movements.some((m) => m.referenceId === doc.sourceDocumentId)) return [];
  const needed = new Map<string, number>();
  doc.lines.forEach((l) => {
    if (l.itemId) needed.set(l.itemId, (needed.get(l.itemId) ?? 0) + Math.abs(l.quantity));
  });
  const out: StockShortfall[] = [];
  needed.forEach((qty, itemId) => {
    const item = items.find((i) => i.id === itemId);
    if (!item || !item.trackInventory || item.type !== 'goods') return;
    const onHand = stockOnHand(itemId, movements, doc.branchId);
    if (onHand < qty) out.push({ itemId, name: item.name, unit: item.unit, onHand, needed: qty });
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
