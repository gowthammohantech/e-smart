import { and, asc, desc, eq, getTableColumns, gt, ilike, ne, not, or, sql, lte, type SQL } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers, type AuthUser, type Deps } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, invalid, notFound, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { storageKeyFor } from '../attachments/keys';
import { ensureHsn } from './hsn';
import { onHandSql, stockOnHand } from './stock';
import { itemColumns, itemToWire, itemWithStock } from './wire';

const I = schema.items;
const ATT = schema.attachments;
type ItemRow = typeof I.$inferSelect;

/** Images people can attach to an item. */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/webp'];

async function findItem(db: DbOrTx, companyId: string, id: string): Promise<ItemRow> {
  const [row] = await db.select().from(I).where(and(eq(I.companyId, companyId), eq(I.id, id)));
  if (!row) throw notFound('Item');
  return row;
}

async function imageUri(deps: Deps, db: DbOrTx, attachmentId: string | null): Promise<string | undefined> {
  if (!attachmentId) return undefined;
  const [a] = await db.select({ key: ATT.storageKey }).from(ATT).where(eq(ATT.id, attachmentId));
  return a ? (await deps.providers.storage.downloadUrl(a.key, { ttlSeconds: 3600 })).url : undefined;
}

/** Reference data the foreign keys need, and prices in the company's currency. */
async function validate(db: DbOrTx, companyId: string, baseCurrency: string, body: Schema<'Item'>) {
  const issues: Issue[] = [];
  const blocking = (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });
  if (!body.sku.trim()) blocking('sku', 'SKU is required');
  if (!body.name.trim()) blocking('name', 'Name is required');
  const unit = body.unit.trim().toUpperCase();
  const [u] = await db.select().from(schema.units).where(eq(schema.units.code, unit));
  if (!u) blocking('unit', `Unknown unit ${body.unit}`);
  const T = schema.taxCategories;
  const [tax] = await db.select({ id: T.id }).from(T).where(and(eq(T.companyId, companyId), eq(T.id, body.taxCategoryId)));
  if (!tax) blocking('taxCategoryId', 'No such tax category in this company');
  for (const f of ['salePrice', 'purchasePrice'] as const) {
    if (body[f].currency !== baseCurrency) blocking(`${f}.currency`, `Item prices are in the company's currency (${baseCurrency})`);
    if (body[f].minor < 0) blocking(`${f}.minor`, 'Prices cannot be negative');
  }
  if ((body.openingStock ?? 0) < 0) blocking('openingStock', 'Opening stock cannot be negative');
  if ((body.reorderLevel ?? 0) < 0) blocking('reorderLevel', 'Reorder level cannot be negative');
  if (issues.length) throw unprocessable(issues);
}

/** SKU and barcode are unique per company. */
async function assertUnique(db: DbOrTx, companyId: string, sku: string, barcode: string | null, exceptId?: string) {
  const others = exceptId ? [ne(I.id, exceptId)] : [];
  const [skuTaken] = await db.select({ id: I.id }).from(I).where(and(eq(I.companyId, companyId), sql`lower(${I.sku}) = lower(${sku})`, ...others));
  if (skuTaken) throw conflict('ITEM_SKU_TAKEN', `Another item already uses the SKU ${sku}`);
  if (barcode) {
    const [codeTaken] = await db.select({ id: I.id }).from(I).where(and(eq(I.companyId, companyId), eq(I.barcode, barcode), ...others));
    if (codeTaken) throw conflict('ITEM_BARCODE_TAKEN', `Another item already has the barcode ${barcode}`);
  }
}

async function primaryBranchId(db: DbOrTx, companyId: string): Promise<string> {
  const B = schema.branches;
  const [b] = await db.select({ id: B.id }).from(B).where(eq(B.companyId, companyId)).orderBy(desc(B.isPrimary), asc(B.createdAt)).limit(1);
  return b.id;
}

async function auditItem(tx: DbOrTx, user: AuthUser, action: 'created' | 'updated' | 'deleted', row: ItemRow, before?: ItemRow) {
  await recordChange(tx, user, {
    companyId: row.companyId,
    action,
    entityType: 'item',
    entityId: row.id,
    entityLabel: row.name,
    version: action === 'deleted' ? row.version + 1 : row.version,
    deleted: action === 'deleted',
    before: before ? itemToWire(before) : action === 'deleted' ? itemToWire(row) : undefined,
    after: action === 'deleted' ? undefined : itemToWire(row),
  });
}

/** Document lines or stock movements that point at the item. */
async function usage(db: DbOrTx, companyId: string, itemId: string): Promise<string | null> {
  const checks: [string, SQL][] = [
    ['documents', sql`select 1 from document_lines where item_id = ${itemId} limit 1`],
    ['stock movements', sql`select 1 from stock_movements where company_id = ${companyId} and item_id = ${itemId} limit 1`],
  ];
  for (const [what, q] of checks) if ((await db.execute(q)).rows.length) return what;
  return null;
}

/**
 * Catalog: listItems, createItem, getItem, saveItem, removeItem, uploadItemImage.
 */
export const catalogHandlers = defineHandlers({
  async listItems(ctx) {
    const { type, status, barcode, lowStock, branchId, q, limit, cursor } = ctx.query;
    const onHand = onHandSql(ctx.company.id, I.id, branchId);
    const k = keyset({ cursor, limit, sort: I.name, id: I.id, order: 'asc' });
    const filters = [eq(I.companyId, ctx.company.id)];
    if (type) filters.push(eq(I.type, type));
    if (status) filters.push(eq(I.status, status));
    if (barcode) filters.push(eq(I.barcode, barcode));
    if (lowStock !== undefined) {
      const low = and(eq(I.trackInventory, true), gt(I.reorderLevel, '0'), lte(onHand, I.reorderLevel))!;
      filters.push(lowStock ? low : not(low));
    }
    if (q) {
      const like = `%${q.trim()}%`;
      filters.push(or(ilike(I.name, like), ilike(I.sku, like), ilike(I.barcode, like), ilike(I.hsnCode, like), ilike(I.description, like))!);
    }
    const rows = await ctx.db
      .select({ ...getTableColumns(I), onHand, imageKey: ATT.storageKey })
      .from(I)
      .leftJoin(ATT, eq(ATT.id, I.imageAttachmentId))
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    const page = rows.slice(0, k.take - 1);
    const storage = ctx.deps.providers.storage;
    const data = await Promise.all(
      page.map(async ({ onHand: qty, imageKey, ...row }) =>
        itemWithStock(row, Number(qty), imageKey ? (await storage.downloadUrl(imageKey, { ttlSeconds: 3600 })).url : undefined),
      ),
    );
    return k.page(data, rows);
  },

  /** A tracked item with opening stock also gets its `opening` movement, at the primary branch. */
  async createItem(ctx) {
    const base = ctx.company.baseCurrency.trim();
    await validate(ctx.db, ctx.company.id, base, ctx.body);
    const cols = itemColumns(ctx.body, base);
    const openingStock = ctx.body.openingStock ?? 0;
    const row = await ctx.db.transaction(async (tx) => {
      await assertUnique(tx, ctx.company.id, cols.sku, cols.barcode);
      const hsnCode = ctx.body.hsnCode ? await ensureHsn(tx, ctx.body.hsnCode) : null;
      const [created] = await tx
        .insert(I)
        .values({ id: newId('itm'), companyId: ctx.company.id, ...cols, hsnCode, openingStock: String(openingStock) })
        .returning();
      if (created.trackInventory && openingStock > 0) {
        await tx.insert(schema.stockMovements).values({
          id: newId('stm'),
          companyId: ctx.company.id,
          branchId: await primaryBranchId(tx, ctx.company.id),
          itemId: created.id,
          type: 'opening',
          quantity: String(openingStock),
          currency: base,
          unitCostMinor: created.purchasePriceMinor,
          date: ctx.now.toISOString().slice(0, 10),
          notes: 'Opening stock',
          createdBy: ctx.user.id,
        });
      }
      await auditItem(tx, ctx.user, 'created', created);
      return created;
    });
    setEtag(ctx.reply, row.version);
    return itemToWire(row);
  },

  async getItem(ctx) {
    const row = await findItem(ctx.db, ctx.company.id, ctx.params.id);
    const stock = await stockOnHand(ctx.db, ctx.company.id, [row.id]);
    setEtag(ctx.reply, row.version);
    return itemWithStock(row, stock.get(row.id) ?? 0, await imageUri(ctx.deps, ctx.db, row.imageAttachmentId));
  },

  async saveItem(ctx) {
    const current = await findItem(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const base = current.currency.trim();
    await validate(ctx.db, ctx.company.id, base, ctx.body);
    const cols = itemColumns(ctx.body, base);
    const row = await ctx.db.transaction(async (tx) => {
      await assertUnique(tx, ctx.company.id, cols.sku, cols.barcode, current.id);
      const hsnCode = ctx.body.hsnCode ? await ensureHsn(tx, ctx.body.hsnCode) : null;
      const [updated] = await tx
        .update(I)
        .set({ ...cols, hsnCode, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(I.id, current.id), eq(I.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await auditItem(tx, ctx.user, 'updated', updated, current);
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return itemToWire(row, await imageUri(ctx.deps, ctx.db, row.imageAttachmentId));
  },

  async removeItem(ctx) {
    const current = await findItem(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const used = await usage(ctx.db, ctx.company.id, current.id);
    if (used) throw conflict('ITEM_IN_USE', `This item appears in ${used}; mark it inactive instead`);
    const image = await ctx.db.transaction(async (tx) => {
      // OCR matches are suggestions; they don't keep an item alive.
      await tx.update(schema.ocrLines).set({ matchedItemId: null }).where(eq(schema.ocrLines.matchedItemId, current.id));
      await tx.delete(I).where(eq(I.id, current.id));
      let key: string | null = null;
      if (current.imageAttachmentId) {
        const [att] = await tx.delete(ATT).where(eq(ATT.id, current.imageAttachmentId)).returning();
        key = att?.storageKey ?? null;
      }
      await auditItem(tx, ctx.user, 'deleted', current);
      return key;
    });
    if (image) await ctx.deps.providers.storage.delete(image);
    return undefined;
  },

  /** Multipart upload: the image is stored as a ready attachment and replaces any previous one. */
  async uploadItemImage(ctx) {
    const current = await findItem(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const file = await ctx.req.file();
    if (!file) throw invalid('file', 'Send the image as the multipart field `file`');
    if (!IMAGE_TYPES.includes(file.mimetype)) throw invalid('file', `Images only (${IMAGE_TYPES.join(', ')})`, 'UNSUPPORTED_FILE_TYPE');
    const body = await file.toBuffer();
    if (!body.length) throw invalid('file', 'The file is empty');

    const storage = ctx.deps.providers.storage;
    const attachmentId = newId('att');
    const name = (file.filename || 'image').replace(/[^\w.-]+/g, '_').slice(0, 120);
    const key = storageKeyFor(ctx.company.id, attachmentId);
    await storage.put(key, body, file.mimetype);

    const { row, oldKey } = await ctx.db.transaction(async (tx) => {
      const [att] = await tx
        .insert(ATT)
        .values({ id: attachmentId, companyId: ctx.company.id, name, mimeType: file.mimetype, sizeBytes: body.length, storageKey: key, status: 'ready', entityType: 'item', entityId: current.id, uploadedBy: ctx.user.id, uploadedAt: ctx.now })
        .returning();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'attachment', entityId: att.id, entityLabel: att.name, version: 1 });
      const [updated] = await tx
        .update(I)
        .set({ imageAttachmentId: attachmentId, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(I.id, current.id), eq(I.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      let previous: string | null = null;
      if (current.imageAttachmentId) {
        const [old] = await tx.delete(ATT).where(eq(ATT.id, current.imageAttachmentId)).returning();
        if (old) {
          previous = old.storageKey;
          await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'deleted', entityType: 'attachment', entityId: old.id, entityLabel: old.name, version: 2, deleted: true });
        }
      }
      await auditItem(tx, ctx.user, 'updated', updated, current);
      return { row: updated, oldKey: previous };
    }).catch(async (err: unknown) => {
      await storage.delete(key);
      throw err;
    });
    if (oldKey) await storage.delete(oldKey);
    setEtag(ctx.reply, row.version);
    return itemToWire(row, (await storage.downloadUrl(key, { ttlSeconds: 3600 })).url);
  },
});
