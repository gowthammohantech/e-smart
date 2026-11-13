import { assertOpeningOpen } from '../books/usage';
import { businessDate } from '@esmart/core/lib/date';
import { checkCustomValues, type CustomValues } from '@esmart/core/domain/customFields';
import { cleanCustomValues, loadCustomFields } from '../settings/customFields';
import { and, asc, desc, eq, getTableColumns, gt, ilike, ne, not, or, sql, lte, type SQL } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers, type AuthUser, type Deps } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { ApiError, conflict, forbidden, invalid, notFound, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { storageKeyFor } from '../attachments/keys';
import { ensureHsn, isValidHsn } from './hsn';
import { catalogMasterHandlers } from './masters';
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
async function validate(db: DbOrTx, companyId: string, baseCurrency: string, body: Schema<'Item'>, today: string, creating = false) {
  const issues: Issue[] = [];
  const blocking = (field: string, message: string) => issues.push({ field, message, severity: 'blocking' });
  // A new item may leave it blank for the next number.
  if (!body.sku.trim() && !creating) blocking('sku', 'SKU is required');
  if (!body.name.trim()) blocking('name', 'Name is required');
  const unit = body.unit.trim().toUpperCase();
  const [u] = await db.select().from(schema.units).where(eq(schema.units.code, unit));
  if (!u) blocking('unit', `Unknown unit ${body.unit}`);
  const T = schema.taxCategories;
  const [tax] = await db.select({ id: T.id }).from(T).where(and(eq(T.companyId, companyId), eq(T.id, body.taxCategoryId)));
  if (!tax) blocking('taxCategoryId', 'No such tax category in this company');
  if (body.categoryId) {
    const C = schema.itemCategories;
    const [cat] = await db.select({ id: C.id }).from(C).where(and(eq(C.companyId, companyId), eq(C.id, body.categoryId)));
    if (!cat) blocking('categoryId', 'No such item category in this company');
  }
  if (body.brandId) {
    const B = schema.brands;
    const [brand] = await db.select({ id: B.id }).from(B).where(and(eq(B.companyId, companyId), eq(B.id, body.brandId)));
    if (!brand) blocking('brandId', 'No such brand in this company');
  }
  for (const f of ['salePrice', 'purchasePrice'] as const) {
    if (body[f].currency !== baseCurrency) blocking(`${f}.currency`, `Item prices are in the company's currency (${baseCurrency})`);
    if (body[f].minor < 0) blocking(`${f}.minor`, 'Prices cannot be negative');
  }
  if ((body.openingStock ?? 0) < 0) blocking('openingStock', 'Opening stock cannot be negative');
  // A service carries no stock, as adjusting stock refuses it.
  else if ((body.openingStock ?? 0) > 0 && body.type !== 'goods') blocking('openingStock', 'A service has no stock');
  // Checked here, so an import's dry run marks the row rather than the import failing on it.
  if (body.hsnCode && !isValidHsn(body.hsnCode.replace(/\s/g, ''))) blocking('hsnCode', 'An HSN or SAC code has 4, 6 or 8 digits');
  if (body.openingStockDate && body.openingStockDate > today) blocking('openingStockDate', 'Opening stock date cannot be in the future');
  if ((body.reorderLevel ?? 0) < 0) blocking('reorderLevel', 'Reorder level cannot be negative');
  if (issues.length) throw unprocessable(issues);
}

/** SKU and barcode are unique per company. */
async function nextSku(db: DbOrTx, companyId: string): Promise<string> {
  const [row] = await db
    .select({ max: sql<number | null>`max(nullif(regexp_replace(${I.sku}, '\\D', '', 'g'), '')::int)` })
    .from(I)
    .where(and(eq(I.companyId, companyId), ilike(I.sku, 'SKU-%')));
  return `SKU-${String((row?.max ?? 0) + 1).padStart(4, '0')}`;
}

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

async function hasMovements(db: DbOrTx, companyId: string, itemId: string): Promise<boolean> {
  return (await db.execute(sql`select 1 from stock_movements where company_id = ${companyId} and item_id = ${itemId} limit 1`)).rows.length > 0;
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
 * Catalog: listItems, createItem, getItem, saveItem, removeItem, uploadItemImage, and the item
 * category and brand masters (./masters).
 */
export const catalogHandlers = defineHandlers({
  ...catalogMasterHandlers,

  async listItems(ctx) {
    const { type, status, barcode, lowStock, stock, branchId, categoryId, brandId, q, limit, cursor } = ctx.query;
    // Someone limited to branches sees the stock at theirs.
    const limited = ctx.user.branchIds;
    if (branchId && limited.length && !limited.includes(branchId)) throw forbidden('BRANCH_NOT_ALLOWED', 'You do not work in this branch');
    const onHand = onHandSql(ctx.company.id, I.id, branchId ?? (limited.length ? limited : undefined));
    const k = keyset({ cursor, limit, sort: I.name, id: I.id, order: 'asc' });
    const filters = [eq(I.companyId, ctx.company.id)];
    if (type) filters.push(eq(I.type, type));
    if (status) filters.push(eq(I.status, status));
    if (barcode) filters.push(eq(I.barcode, barcode));
    if (categoryId) filters.push(eq(I.categoryId, categoryId));
    if (brandId) filters.push(eq(I.brandId, brandId));
    if (lowStock !== undefined) {
      const low = and(eq(I.trackInventory, true), gt(I.reorderLevel, '0'), lte(onHand, I.reorderLevel))!;
      filters.push(lowStock ? low : not(low));
    }
    // As the inventory tab's filters read: low is still in stock, out has none.
    if (stock === 'low') filters.push(and(eq(I.trackInventory, true), gt(I.reorderLevel, '0'), lte(onHand, I.reorderLevel), gt(onHand, '0'))!);
    if (stock === 'out') filters.push(and(eq(I.trackInventory, true), lte(onHand, '0'))!);
    if (stock === 'tracked') filters.push(eq(I.trackInventory, true));
    if (stock === 'untracked') filters.push(eq(I.trackInventory, false));
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
    const today = businessDate(ctx.now);
    await validate(ctx.db, ctx.company.id, base, ctx.body, today, true);
    const cols = itemColumns(ctx.body, base);
    const customFields = await cleanCustomValues(ctx.db, ctx.company.id, 'item', ctx.body.customFields as CustomValues | undefined);
    const openingStock = ctx.body.openingStock ?? 0;
    // The day the stock was counted; only a tracked item has stock to date.
    const openingStockDate = cols.trackInventory ? (ctx.body.openingStockDate ?? today) : null;
    const row = await ctx.db.transaction(async (tx) => {
      // Left blank, a new item takes the next SKU-0001 style number.
      if (!cols.sku) cols.sku = await nextSku(tx, ctx.company.id);
      await assertUnique(tx, ctx.company.id, cols.sku, cols.barcode);
      const hsnCode = ctx.body.hsnCode ? await ensureHsn(tx, ctx.body.hsnCode) : null;
      const [created] = await tx
        .insert(I)
        .values({ id: newId('itm'), companyId: ctx.company.id, ...cols, customFields, hsnCode, openingStock: String(openingStock), openingStockDate })
        .returning();
      // Opening stock sits at the start of the books: not inside closed ones (an adjustment, dated today, instead).
      if (created.trackInventory && openingStock > 0) assertOpeningOpen(ctx.company, undefined);
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
          date: openingStockDate ?? today,
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

  async importItems(ctx) {
    const { rows, dryRun, customFieldColumns } = ctx.body;
    const base = ctx.company.baseCurrency.trim();
    const today = businessDate(ctx.now);
    // A required field is enforced only when the sheet has its column; one without a column can't
    // stop every row, so it is created empty and the dry run says so.
    const columns = new Set(customFieldColumns ?? []);
    const itemFields = (await loadCustomFields(ctx.db, ctx.company.id, 'item')).filter((f) => (f.status ?? 'active') === 'active');
    const checked = itemFields.map((f) => (columns.has(f.id) ? f : { ...f, required: false }));
    const warnings = itemFields.filter((f) => f.required && f.kind !== 'checkbox' && !columns.has(f.id)).map((f) => `${f.label} is required but the sheet has no column for it: these items are created without it`);
    // What is already there, to tell duplicates by SKU, barcode or name in any case.
    const existing = await ctx.db.select({ sku: I.sku, barcode: I.barcode, name: I.name }).from(I).where(eq(I.companyId, ctx.company.id));
    const skus = new Set(existing.map((e) => e.sku.toLowerCase()));
    const barcodes = new Set(existing.map((e) => e.barcode).filter(Boolean) as string[]);
    const names = new Set(existing.map((e) => e.name.trim().toLowerCase()));
    type Result = { index: number; status: 'created' | 'duplicate' | 'invalid'; id?: string; issues?: Issue[] };
    const results: Result[] = [];
    const good: { index: number; body: Schema<'Item'>; customFields: CustomValues }[] = [];
    for (const [index, body] of rows.entries()) {
      let customFields: CustomValues = {};
      try {
        await validate(ctx.db, ctx.company.id, base, body, today, true);
        // Values the sheet carries are checked as a new item's are.
        if (checked.length) {
          const { values, problems } = checkCustomValues(checked, 'item', (body.customFields ?? {}) as CustomValues);
          if (problems.length) throw unprocessable(problems.map((p) => ({ field: `customFields.${p.fieldId}`, message: p.message, severity: 'blocking' as const })));
          customFields = values;
        }
      } catch (err) {
        const issues = err instanceof ApiError ? ((err.extra.issues as Issue[] | undefined) ?? [{ field: '', message: err.message, severity: 'blocking' as const }]) : [{ field: '', message: String(err), severity: 'blocking' as const }];
        results.push({ index, status: 'invalid', issues });
        continue;
      }
      const sku = body.sku.trim().toLowerCase();
      const barcode = body.barcode?.trim();
      const name = body.name.trim().toLowerCase();
      if ((sku && skus.has(sku)) || (barcode && barcodes.has(barcode)) || names.has(name)) {
        results.push({ index, status: 'duplicate' });
        continue;
      }
      if (sku) skus.add(sku);
      if (barcode) barcodes.add(barcode);
      names.add(name);
      good.push({ index, body, customFields });
    }
    if (!dryRun && good.length) {
      await ctx.db.transaction(async (tx) => {
        const branchId = await primaryBranchId(tx, ctx.company.id);
        // Blank SKUs follow the SKU-0001 series, counted on within the batch.
        let nextNumber = Number((await nextSku(tx, ctx.company.id)).replace(/\D/g, ''));
        for (const { index, body, customFields } of good) {
          const cols = itemColumns(body, base);
          if (!cols.sku) {
            // Past any number a row of this sheet (or an item) already took.
            while (skus.has(`sku-${String(nextNumber).padStart(4, '0')}`)) nextNumber++;
            cols.sku = `SKU-${String(nextNumber++).padStart(4, '0')}`;
            skus.add(cols.sku.toLowerCase());
          }
          const openingStock = body.openingStock ?? 0;
          const openingStockDate = cols.trackInventory ? (body.openingStockDate ?? today) : null;
          const hsnCode = body.hsnCode ? await ensureHsn(tx, body.hsnCode) : null;
          const [created] = await tx
            .insert(I)
            .values({ id: newId('itm'), companyId: ctx.company.id, ...cols, customFields, hsnCode, openingStock: String(openingStock), openingStockDate })
            .returning();
          if (created.trackInventory && openingStock > 0) assertOpeningOpen(ctx.company, undefined);
          if (created.trackInventory && openingStock > 0) {
            await tx.insert(schema.stockMovements).values({
              id: newId('stm'),
              companyId: ctx.company.id,
              branchId,
              itemId: created.id,
              type: 'opening',
              quantity: String(openingStock),
              currency: base,
              unitCostMinor: created.purchasePriceMinor,
              date: openingStockDate ?? today,
              notes: 'Opening stock',
              createdBy: ctx.user.id,
            });
          }
          await auditItem(tx, ctx.user, 'created', created);
          results.push({ index, status: 'created', id: created.id });
        }
      });
    } else for (const { index } of good) results.push({ index, status: 'created' });
    results.sort((a, b) => a.index - b.index);
    const count = (st: Result['status']) => results.filter((r) => r.status === st).length;
    return { created: count('created'), skipped: count('duplicate'), invalid: count('invalid'), ...(warnings.length && { warnings }), results };
  },

  async getItem(ctx) {
    const row = await findItem(ctx.db, ctx.company.id, ctx.params.id);
    const stock = await stockOnHand(ctx.db, ctx.company.id, [row.id], ctx.user.branchIds.length ? ctx.user.branchIds : undefined);
    setEtag(ctx.reply, row.version);
    return itemWithStock(row, stock.get(row.id) ?? 0, await imageUri(ctx.deps, ctx.db, row.imageAttachmentId));
  },

  async saveItem(ctx) {
    const current = await findItem(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const base = current.currency.trim();
    await validate(ctx.db, ctx.company.id, base, ctx.body, businessDate(ctx.now));
    const cols = itemColumns(ctx.body, base);
    // Stock already moved in this unit, as tracked goods: changing that would strand it.
    if ((cols.trackInventory !== current.trackInventory || cols.type !== current.type || cols.unit !== current.unit.trim().toUpperCase()) && (await hasMovements(ctx.db, ctx.company.id, current.id))) {
      throw conflict('ITEM_HAS_STOCK', 'This item has stock movements, so its type, unit and stock tracking cannot change; make a new item instead');
    }
    const row = await ctx.db.transaction(async (tx) => {
      await assertUnique(tx, ctx.company.id, cols.sku, cols.barcode, current.id);
      const hsnCode = ctx.body.hsnCode ? await ensureHsn(tx, ctx.body.hsnCode) : null;
      const [updated] = await tx
        .update(I)
        .set({ ...cols, hsnCode, customFields: await cleanCustomValues(tx, ctx.company.id, 'item', ctx.body.customFields as CustomValues | undefined, current.customFields), version: current.version + 1, updatedAt: ctx.now })
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
