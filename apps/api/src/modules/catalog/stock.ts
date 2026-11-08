import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { MOVEMENT_SIGN } from '@esmart/core/domain/stockLedger';
import type { StockMovementType } from '@esmart/core/types';
import { schema } from '@esmart/db';
import type { DbOrTx } from '../../lib/audit';

const M = schema.stockMovements;

const OUTBOUND = (Object.entries(MOVEMENT_SIGN) as [StockMovementType, number][]).filter(([, s]) => s < 0).map(([t]) => t);

/**
 * core's `signedQuantity` in SQL: adjustments carry their own sign, every
 * other type takes the direction MOVEMENT_SIGN gives it, whatever sign the
 * row was written with.
 */
export const signedQuantitySql = sql`case when ${M.type} = 'adjustment' then ${M.quantity}
  when ${M.type} in (${sql.join(OUTBOUND.map((t) => sql`${t}`), sql`, `)}) then -abs(${M.quantity})
  else abs(${M.quantity}) end`;

/** Stock on hand for the item in `itemId` (a column, for a correlated subquery), optionally at one branch or some. */
export function onHandSql(companyId: string, itemId: PgColumn, branchId?: string | string[]): SQL<string> {
  const ids = branchId === undefined ? [] : Array.isArray(branchId) ? branchId : [branchId];
  const branch = ids.length ? sql` and ${M.branchId} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})` : sql``;
  return sql<string>`coalesce((select sum(${signedQuantitySql}) from ${M} where ${M.companyId} = ${companyId} and ${M.itemId} = ${itemId}${branch}), 0)`;
}

/** Stock on hand per item id. Items without movements are 0. */
export async function stockOnHand(db: DbOrTx, companyId: string, itemIds: string[], branchId?: string | string[]): Promise<Map<string, number>> {
  const out = new Map(itemIds.map((id) => [id, 0]));
  if (!itemIds.length) return out;
  const filters = [eq(M.companyId, companyId), inArray(M.itemId, itemIds)];
  if (typeof branchId === 'string') filters.push(eq(M.branchId, branchId));
  else if (branchId?.length) filters.push(inArray(M.branchId, branchId));
  const rows = await db
    .select({ itemId: M.itemId, qty: sql<string>`sum(${signedQuantitySql})` })
    .from(M)
    .where(and(...filters))
    .groupBy(M.itemId);
  for (const r of rows) out.set(r.itemId, Number(r.qty));
  return out;
}
