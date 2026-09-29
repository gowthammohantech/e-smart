import { and, asc, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import { isLowStock, stockValue } from '@esmart/core/domain/stockLedger';
import { schema } from '@esmart/db';
import { defineHandlers, type Ctx } from '../../context';
import { invalid, unprocessable, type Issue } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { notify } from '../../lib/notify';
import { stockOnHand } from '../catalog/stock';
import { coreMovements, levelAt, movementToWire, toCoreItem, type ItemRow, type MovementRow } from './ledger';

const M = schema.stockMovements;
const I = schema.items;
const B = schema.branches;
type WriteCtx = Pick<Ctx<'adjustStock'>, 'company' | 'user' | 'db' | 'now' | 'deps'>;

/** Branches the caller may see: all of the company's, or the ones they are limited to. */
async function visibleBranches(ctx: Pick<WriteCtx, 'company' | 'user' | 'db'>) {
  const rows = await ctx.db.select().from(B).where(eq(B.companyId, ctx.company.id)).orderBy(asc(B.createdAt), asc(B.id));
  return ctx.user.branchIds.length ? rows.filter((b) => ctx.user.branchIds.includes(b.id)) : rows;
}

async function branchOrFail(ctx: WriteCtx, db: DbOrTx, id: string, field: string) {
  const [b] = await db.select().from(B).where(and(eq(B.companyId, ctx.company.id), eq(B.id, id)));
  if (!b || (ctx.user.branchIds.length && !ctx.user.branchIds.includes(b.id))) throw invalid(field, 'No such branch in this company');
  return b;
}

/**
 * The tracked items being moved, locked `FOR UPDATE` in id order, so two
 * adjustments of one item serialise and the stock check below cannot race.
 */
async function lockItems(tx: DbOrTx, companyId: string, ids: string[]): Promise<Map<string, ItemRow>> {
  const rows = await tx
    .select()
    .from(I)
    .where(and(eq(I.companyId, companyId), inArray(I.id, [...new Set(ids)])))
    .orderBy(I.id)
    .for('update');
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * After a write, tells the company about each item whose stock at `branch`
 * just fell to its reorder level or under it (core `isLowStock`). Only the
 * crossing notifies, so an item that is already low does not nag on every
 * movement.
 */
async function notifyLow(tx: DbOrTx, ctx: WriteCtx, branch: { id: string; name: string }, items: ItemRow[], before: Map<string, number>) {
  const after = await stockOnHand(tx, ctx.company.id, items.map((i) => i.id), branch.id);
  for (const item of items) {
    const core = toCoreItem(item);
    const was = before.get(item.id) ?? 0;
    const now = after.get(item.id) ?? 0;
    if (isLowStock(core, now) && !isLowStock(core, was)) {
      await notify(tx, ctx.deps, {
        companyId: ctx.company.id,
        kind: 'lowStock',
        title: `Low stock: ${item.name}`,
        body: `${item.name} is down to ${now} ${item.unit} at ${branch.name} (reorder level ${core.reorderLevel}).`,
        entityType: 'item',
        entityId: item.id,
      });
    }
  }
}

/** Movements change what an item's GET returns (its stock), so the audit and sync record is the item's. */
async function auditMovements(tx: DbOrTx, ctx: WriteCtx, action: string, items: ItemRow[], rows: MovementRow[]) {
  for (const item of items) {
    await recordChange(tx, ctx.user, {
      companyId: ctx.company.id,
      action,
      entityType: 'item',
      entityId: item.id,
      entityLabel: item.name,
      version: item.version,
      after: rows.filter((r) => r.itemId === item.id).map(movementToWire),
    });
  }
}

const insufficient = (issues: Issue[]) => unprocessable(issues, 'INSUFFICIENT_STOCK');

/** Inventory: getStockLevels, listStockMovements, adjustStock, transferStock. */
export const inventoryHandlers = defineHandlers({
  /**
   * One row per tracked item per branch (the caller's branches, or the one
   * asked for), including branches where it has never moved.
   */
  async getStockLevels(ctx) {
    const q = ctx.query;
    const base = ctx.company.baseCurrency.trim();
    let branches = await visibleBranches(ctx);
    if (q.branchId) branches = branches.filter((b) => b.id === q.branchId);
    const filters: SQL[] = [eq(I.companyId, ctx.company.id), eq(I.trackInventory, true), eq(I.type, 'goods')];
    if (q.itemId) filters.push(eq(I.id, q.itemId));
    const items = (await ctx.db.select().from(I).where(and(...filters)).orderBy(I.name, I.id)).map(toCoreItem);
    if (!items.length || !branches.length) return { data: [] };
    const movements = await coreMovements(ctx.db, ctx.company.id, { itemIds: items.map((i) => i.id), branchIds: branches.map((b) => b.id) });
    const data = items.flatMap((item) => branches.map((b) => levelAt(item, b.id, movements, base)));
    return { data: q.lowStock === undefined ? data : data.filter((l) => l.low === q.lowStock) };
  },

  async listStockMovements(ctx) {
    const q = ctx.query;
    const filters: (SQL | undefined)[] = [eq(M.companyId, ctx.company.id)];
    if (q.itemId) filters.push(eq(M.itemId, q.itemId));
    if (q.type) filters.push(eq(M.type, q.type));
    if (q.referenceId) filters.push(eq(M.referenceId, q.referenceId));
    if (q.branchId) filters.push(eq(M.branchId, q.branchId));
    if (ctx.user.branchIds.length) filters.push(inArray(M.branchId, ctx.user.branchIds));
    if (q.from) filters.push(gte(M.date, q.from));
    if (q.to) filters.push(lte(M.date, q.to));
    const k = keyset({ cursor: q.cursor, limit: q.limit, sort: M.date, id: M.id, order: 'desc' });
    const rows = await ctx.db
      .select()
      .from(M)
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    return k.page(rows.slice(0, k.take - 1).map(movementToWire), rows);
  },

  /**
   * Adjustments carry their own sign; opening stock only adds. Neither may
   * take a tracked item below zero at the branch (core has no negative-stock
   * allowance), which is 422 INSUFFICIENT_STOCK.
   */
  async adjustStock(ctx) {
    const body = ctx.body;
    const type = body.type ?? 'adjustment';
    const base = ctx.company.baseCurrency.trim();
    const branch = await branchOrFail(ctx, ctx.db, body.branchId, 'branchId');

    const rows = await ctx.db.transaction(async (tx) => {
      const items = await lockItems(tx, ctx.company.id, body.lines.map((l) => l.itemId));
      const issues: Issue[] = [];
      const blocking = (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });
      body.lines.forEach((l, i) => {
        const item = items.get(l.itemId);
        if (!item) return blocking(`lines[${i}].itemId`, 'No such item in this company');
        if (!item.trackInventory || item.type !== 'goods') blocking(`lines[${i}].itemId`, `${item.name} does not track stock`);
        if (!Number.isFinite(l.quantity) || l.quantity === 0) blocking(`lines[${i}].quantity`, 'Must not be zero');
        else if (type === 'opening' && l.quantity < 0) blocking(`lines[${i}].quantity`, 'Opening stock cannot be negative');
        if (Math.round(l.quantity * 1000) !== l.quantity * 1000) blocking(`lines[${i}].quantity`, 'At most three decimals');
        if (l.unitCost && l.unitCost.currency !== base) blocking(`lines[${i}].unitCost.currency`, `Must be in the base currency (${base})`);
        if (l.unitCost && l.unitCost.minor < 0) blocking(`lines[${i}].unitCost.minor`, 'Cannot be negative');
      });
      if (issues.length) throw unprocessable(issues);

      const touched = [...new Set(body.lines.map((l) => l.itemId))].map((id) => items.get(id)!);
      const before = await stockOnHand(tx, ctx.company.id, touched.map((i) => i.id), branch.id);
      const delta = new Map<string, number>();
      for (const l of body.lines) delta.set(l.itemId, (delta.get(l.itemId) ?? 0) + l.quantity);
      const short = touched.filter((i) => (before.get(i.id) ?? 0) + (delta.get(i.id) ?? 0) < 0);
      if (short.length) {
        throw insufficient(
          short.map((i) => ({
            field: `lines[${body.lines.findIndex((l) => l.itemId === i.id)}].quantity`,
            message: `${i.name} has ${before.get(i.id) ?? 0} ${i.unit} at ${branch.name}; this would take it to ${(before.get(i.id) ?? 0) + (delta.get(i.id) ?? 0)}`,
            severity: 'blocking' as const,
          })),
        );
      }

      const written = await tx
        .insert(M)
        .values(
          body.lines.map((l) => {
            const item = items.get(l.itemId)!;
            return {
              id: newId('stm'),
              companyId: ctx.company.id,
              branchId: branch.id,
              itemId: item.id,
              type,
              quantity: String(l.quantity),
              currency: base,
              unitCostMinor: l.unitCost?.minor ?? item.purchasePriceMinor,
              date: body.date,
              referenceType: 'adjustment',
              adjustReason: type === 'adjustment' ? (body.reason ?? 'other') : null,
              notes: body.notes ?? null,
              createdBy: ctx.user.id,
              createdAt: ctx.now,
            };
          }),
        )
        .returning();
      await auditMovements(tx, ctx, type === 'opening' ? 'opening stock' : `stock adjusted (${body.reason ?? 'other'})`, touched, written);
      await notifyLow(tx, ctx, branch, touched, before);
      return written;
    });
    return { data: rows.map(movementToWire) };
  },

  /**
   * A paired transferOut and transferIn sharing a transfer group (which is
   * also their referenceId), written in one transaction. The stock moves at
   * the sending branch's weighted-average cost (core `stockValue`), so value
   * travels with it.
   */
  async transferStock(ctx) {
    const body = ctx.body;
    const base = ctx.company.baseCurrency.trim();
    if (body.fromBranchId === body.toBranchId) throw invalid('toBranchId', 'Pick a different branch to transfer to');
    const from = await branchOrFail(ctx, ctx.db, body.fromBranchId, 'fromBranchId');
    const to = await branchOrFail(ctx, ctx.db, body.toBranchId, 'toBranchId');
    if (Math.round(body.quantity * 1000) !== body.quantity * 1000) throw invalid('quantity', 'At most three decimals');

    const rows = await ctx.db.transaction(async (tx) => {
      const item = (await lockItems(tx, ctx.company.id, [body.itemId])).get(body.itemId);
      if (!item) throw invalid('itemId', 'No such item in this company');
      if (!item.trackInventory || item.type !== 'goods') throw invalid('itemId', `${item.name} does not track stock`);
      const before = await stockOnHand(tx, ctx.company.id, [item.id], from.id);
      const available = before.get(item.id) ?? 0;
      if (available < body.quantity) {
        throw insufficient([{ field: 'quantity', message: `${item.name} has ${available} ${item.unit} at ${from.name}`, severity: 'blocking' }]);
      }
      const atSource = await coreMovements(tx, ctx.company.id, { itemIds: [item.id], branchIds: [from.id] });
      const unitCostMinor = Math.round(stockValue(toCoreItem(item), atSource, base).minor / available);

      const group = newId('trf');
      const common = {
        companyId: ctx.company.id,
        itemId: item.id,
        currency: base,
        unitCostMinor,
        date: body.date,
        referenceType: 'transfer',
        referenceId: group,
        transferGroupId: group,
        notes: body.notes ?? null,
        createdBy: ctx.user.id,
        createdAt: ctx.now,
      };
      const written = await tx
        .insert(M)
        .values([
          { ...common, id: newId('stm'), branchId: from.id, type: 'transferOut' as const, quantity: String(-body.quantity), referenceNumber: `${from.code}→${to.code}` },
          { ...common, id: newId('stm'), branchId: to.id, type: 'transferIn' as const, quantity: String(body.quantity), referenceNumber: `${from.code}→${to.code}` },
        ])
        .returning();
      await auditMovements(tx, ctx, `stock transferred ${from.code} → ${to.code}`, [item], written);
      await notifyLow(tx, ctx, from, [item], before);
      return written.sort((a, b) => (a.type === 'transferOut' ? -1 : b.type === 'transferOut' ? 1 : 0));
    });
    return { data: rows.map(movementToWire) };
  },
});

