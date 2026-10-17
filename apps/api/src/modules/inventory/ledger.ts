import { and, eq, inArray, lte, type SQL } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { isLowStock, stockOnHand, stockValue } from '@esmart/core/domain/stockLedger';
import type { Item, StockMovement } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { DbOrTx } from '../../lib/audit';
import { compact, iso, money } from '../../lib/wire';
import { itemToWire } from '../catalog/wire';

const M = schema.stockMovements;
export type MovementRow = typeof M.$inferSelect;
export type ItemRow = typeof schema.items.$inferSelect;

export function movementToWire(r: MovementRow): Schema<'StockMovement'> {
  return compact({
    id: r.id,
    companyId: r.companyId,
    branchId: r.branchId,
    itemId: r.itemId,
    type: r.type,
    quantity: Number(r.quantity),
    unitCost: money(r.unitCostMinor, r.currency.trim()),
    date: r.date,
    referenceId: r.referenceId,
    referenceNumber: r.referenceNumber,
    notes: r.notes,
    createdBy: r.createdBy,
    createdAt: iso(r.createdAt),
  });
}

/** A movement as `@esmart/core` stockLedger sees it. */
export function toCoreMovement(r: MovementRow): StockMovement {
  return {
    id: r.id,
    companyId: r.companyId,
    branchId: r.branchId,
    itemId: r.itemId,
    type: r.type,
    quantity: Number(r.quantity),
    unitCost: money(r.unitCostMinor, r.currency.trim()),
    date: r.date,
    referenceId: r.referenceId ?? undefined,
    referenceNumber: r.referenceNumber ?? undefined,
    notes: r.notes ?? undefined,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  };
}

/** An item as `@esmart/core` sees it; the wire Item is its structural twin. */
export function toCoreItem(row: ItemRow): Item {
  const w = itemToWire(row);
  return { ...(w as unknown as Item), createdAt: w.createdAt ?? '' };
}

/** The company's movements (optionally for some items, at one branch, up to a date), for core. */
export async function coreMovements(db: DbOrTx, companyId: string, opts: { itemIds?: string[]; branchIds?: string[]; to?: string } = {}): Promise<StockMovement[]> {
  const filters: SQL[] = [eq(M.companyId, companyId)];
  if (opts.itemIds) {
    if (!opts.itemIds.length) return [];
    filters.push(inArray(M.itemId, opts.itemIds));
  }
  if (opts.branchIds?.length) filters.push(inArray(M.branchId, opts.branchIds));
  if (opts.to) filters.push(lte(M.date, opts.to));
  const rows = await db.select().from(M).where(and(...filters)).orderBy(M.date, M.createdAt);
  return rows.map(toCoreMovement);
}

export type Level = { itemId: string; branchId: string; onHand: number; reorderLevel: number; low: boolean; value: Schema<'Money'> };

/**
 * On hand, low flag and value of an item at one branch, all from core's
 * stockLedger over that branch's movements: `stockOnHand`, `isLowStock`
 * against the item's reorder level, and `stockValue` (weighted average of
 * what came in there).
 */
export function levelAt(item: Item, branchId: string, movements: StockMovement[], baseCurrency: string): Level {
  const here = movements.filter((m) => m.itemId === item.id && m.branchId === branchId);
  const onHand = stockOnHand(item.id, here, branchId);
  return {
    itemId: item.id,
    branchId,
    onHand,
    reorderLevel: item.reorderLevel,
    low: isLowStock(item, onHand),
    value: stockValue(item, here, baseCurrency),
  };
}
