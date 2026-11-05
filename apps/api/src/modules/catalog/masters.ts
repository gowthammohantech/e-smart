import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, invalid, notFound, preconditionFailed } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { audit, firstUse } from '../settings/shared';
import { brandToWire, itemCategoryToWire } from './wire';

const C = schema.itemCategories;
const B = schema.brands;

const COLOR_RE = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;
const DEFAULT_COLOR = '#8E98AC';

async function findCategory(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(C).where(and(eq(C.companyId, companyId), eq(C.id, id)));
  if (!row) throw notFound('Item category');
  return row;
}

async function findBrand(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(B).where(and(eq(B.companyId, companyId), eq(B.id, id)));
  if (!row) throw notFound('Brand');
  return row;
}

function nameOf(body: { name: string }) {
  const name = body.name.trim();
  if (!name) throw invalid('name', 'Name is required');
  if (name.length > 100) throw invalid('name', 'Name is at most 100 characters');
  return name;
}

function categoryColumns(body: Schema<'ItemCategory'>, current?: { color: string }) {
  if (body.color && !COLOR_RE.test(body.color)) throw invalid('color', 'Colour must be a hex value like #4DA3FF');
  return { name: nameOf(body), color: body.color ?? current?.color ?? DEFAULT_COLOR };
}

/** Names are unique per company, whatever their case (`item_categories_company_id_name_idx`). */
async function assertCategoryNameFree(db: DbOrTx, companyId: string, name: string, exceptId?: string) {
  const filters = [eq(C.companyId, companyId), sql`lower(${C.name}) = lower(${name})`];
  if (exceptId) filters.push(ne(C.id, exceptId));
  const [dupe] = await db.select({ id: C.id }).from(C).where(and(...filters));
  if (dupe) throw invalid('name', `There is already a category called ${name}`, 'ITEM_CATEGORY_EXISTS');
}

async function assertBrandNameFree(db: DbOrTx, companyId: string, name: string, exceptId?: string) {
  const filters = [eq(B.companyId, companyId), sql`lower(${B.name}) = lower(${name})`];
  if (exceptId) filters.push(ne(B.id, exceptId));
  const [dupe] = await db.select({ id: B.id }).from(B).where(and(...filters));
  if (dupe) throw invalid('name', `There is already a brand called ${name}`, 'BRAND_EXISTS');
}

/**
 * Catalog masters: listItemCategories, createItemCategory, saveItemCategory, removeItemCategory,
 * listBrands, createBrand, saveBrand, removeBrand.
 */
export const catalogMasterHandlers = defineHandlers({
  async listItemCategories(ctx) {
    const rows = await ctx.db.select().from(C).where(eq(C.companyId, ctx.company.id)).orderBy(asc(C.name));
    return { data: rows.map(itemCategoryToWire) };
  },

  async createItemCategory(ctx) {
    const cols = categoryColumns(ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      await assertCategoryNameFree(tx, ctx.company.id, cols.name);
      const [created] = await tx.insert(C).values({ id: newId('icat'), companyId: ctx.company.id, ...cols }).returning();
      await audit(tx, ctx.user, ctx.company.id, 'item_category', 'created', created, created.name, { after: itemCategoryToWire(created) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return itemCategoryToWire(row);
  },

  async saveItemCategory(ctx) {
    const current = await findCategory(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const cols = categoryColumns(ctx.body, current);
    const row = await ctx.db.transaction(async (tx) => {
      await assertCategoryNameFree(tx, ctx.company.id, cols.name, current.id);
      const [updated] = await tx
        .update(C)
        .set({ ...cols, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(C.id, current.id), eq(C.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await audit(tx, ctx.user, ctx.company.id, 'item_category', 'updated', updated, updated.name, {
        before: itemCategoryToWire(current),
        after: itemCategoryToWire(updated),
      });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return itemCategoryToWire(row);
  },

  async removeItemCategory(ctx) {
    const current = await findCategory(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const used = await firstUse(ctx.db, [['items', sql`select 1 from items where category_id = ${current.id} limit 1`]]);
    if (used) throw conflict('ITEM_CATEGORY_IN_USE', 'Items are filed under this category');
    await ctx.db.transaction(async (tx) => {
      await tx.delete(C).where(eq(C.id, current.id));
      await audit(tx, ctx.user, ctx.company.id, 'item_category', 'deleted', current, current.name, { before: itemCategoryToWire(current) });
    });
    return undefined;
  },

  async listBrands(ctx) {
    const rows = await ctx.db.select().from(B).where(eq(B.companyId, ctx.company.id)).orderBy(asc(B.name));
    return { data: rows.map(brandToWire) };
  },

  async createBrand(ctx) {
    const name = nameOf(ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      await assertBrandNameFree(tx, ctx.company.id, name);
      const [created] = await tx.insert(B).values({ id: newId('brd'), companyId: ctx.company.id, name }).returning();
      await audit(tx, ctx.user, ctx.company.id, 'brand', 'created', created, created.name, { after: brandToWire(created) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return brandToWire(row);
  },

  async saveBrand(ctx) {
    const current = await findBrand(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const name = nameOf(ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      await assertBrandNameFree(tx, ctx.company.id, name, current.id);
      const [updated] = await tx
        .update(B)
        .set({ name, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(B.id, current.id), eq(B.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await audit(tx, ctx.user, ctx.company.id, 'brand', 'updated', updated, updated.name, { before: brandToWire(current), after: brandToWire(updated) });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return brandToWire(row);
  },

  async removeBrand(ctx) {
    const current = await findBrand(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const used = await firstUse(ctx.db, [['items', sql`select 1 from items where brand_id = ${current.id} limit 1`]]);
    if (used) throw conflict('BRAND_IN_USE', 'Items carry this brand');
    await ctx.db.transaction(async (tx) => {
      await tx.delete(B).where(eq(B.id, current.id));
      await audit(tx, ctx.user, ctx.company.id, 'brand', 'deleted', current, current.name, { before: brandToWire(current) });
    });
    return undefined;
  },
});
