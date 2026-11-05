import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { ownerWithCompany, setupApi } from './helpers';

const t = setupApi();

async function setup() {
  const o = await ownerWithCompany(t);
  const taxes = (await t.get(`${o.c}/tax-categories`, { token: o.token })).body.data;
  const gst18 = taxes.find((x: { rate: number }) => x.rate === 18);
  let n = 0;
  const item = (over: Record<string, unknown> = {}) => ({
    sku: `SKU-T${++n}`,
    name: `Item ${n}`,
    type: 'goods',
    unit: 'pcs',
    salePrice: { minor: 15000, currency: 'INR' },
    purchasePrice: { minor: 11800, currency: 'INR' },
    taxCategoryId: gst18.id,
    trackInventory: false,
    ...over,
  });
  return { ...o, item };
}

describe('item categories', () => {
  it('creates, refuses a duplicate name, saves with If-Match and deletes only unused ones', async () => {
    const { token, c, item } = await setup();
    const created = await t.post(`${c}/item-categories`, { name: 'Bearings' }, { token });
    expect(created.status).toBe(201);
    expect(created.headers.etag).toBe('"v1"');
    expect(created.body).toMatchObject({ name: 'Bearings', color: '#8E98AC', version: 1 });

    const dupe = await t.post(`${c}/item-categories`, { name: ' bearings ' }, { token });
    expect(dupe.status).toBe(422);
    expect(dupe.body.code).toBe('ITEM_CATEGORY_EXISTS');
    const badColor = await t.post(`${c}/item-categories`, { name: 'Belts', color: 'red' }, { token });
    expect(badColor.status).toBe(422);
    expect(badColor.body.issues[0].field).toBe('color');

    const url = `${c}/item-categories/${created.body.id}`;
    const saved = await t.put(url, { name: 'Ball bearings', color: '#112233' }, { token, headers: { 'if-match': '"v1"' } });
    expect(saved.status).toBe(200);
    expect(saved.headers.etag).toBe('"v2"');
    expect(saved.body).toMatchObject({ name: 'Ball bearings', color: '#112233', version: 2 });
    const stale = await t.put(url, { name: 'Lost' }, { token, headers: { 'if-match': '"v1"' } });
    expect(stale.status).toBe(412);

    const list = await t.get(`${c}/item-categories`, { token });
    expect(list.body.data.map((x: { name: string }) => x.name)).toEqual(['Ball bearings']);

    const it1 = await t.post(`${c}/items`, item({ categoryId: created.body.id }), { token });
    expect(it1.status).toBe(201);
    expect(it1.body.categoryId).toBe(created.body.id);
    const inUse = await t.del(url, { token });
    expect(inUse.status).toBe(409);
    expect(inUse.body.code).toBe('ITEM_CATEGORY_IN_USE');

    // Cleared from the item, the category can go.
    const { categoryId: _c, ...plain } = it1.body;
    void _c;
    const cleared = await t.put(`${c}/items/${it1.body.id}`, plain, { token, headers: { 'if-match': it1.headers.etag as string } });
    expect(cleared.status).toBe(200);
    expect(cleared.body.categoryId).toBeUndefined();
    expect((await t.del(url, { token })).status).toBe(204);
    const audit = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, created.body.id));
    expect(audit.map((a) => a.action).sort()).toEqual(['created', 'deleted', 'updated']);
  });

  it('is closed to viewers for writes', async () => {
    const { token, c, user } = await setup();
    await t.deps.db.update(schema.users).set({ role: 'viewer' }).where(eq(schema.users.id, user.id!));
    const res = await t.post(`${c}/item-categories`, { name: 'X' }, { token });
    expect(res.status).toBe(403);
  });
});

describe('brands', () => {
  it('creates, refuses a duplicate name, saves with If-Match and deletes only unused ones', async () => {
    const { token, c, item } = await setup();
    const created = await t.post(`${c}/brands`, { name: 'SKF' }, { token });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'SKF', version: 1 });
    const dupe = await t.post(`${c}/brands`, { name: 'skf' }, { token });
    expect(dupe.status).toBe(422);
    expect(dupe.body.code).toBe('BRAND_EXISTS');
    const blank = await t.post(`${c}/brands`, { name: '  ' }, { token });
    expect(blank.status).toBe(422);

    const url = `${c}/brands/${created.body.id}`;
    const saved = await t.put(url, { name: 'SKF India' }, { token, headers: { 'if-match': '"v1"' } });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ name: 'SKF India', version: 2 });
    expect((await t.put(url, { name: 'Lost' }, { token, headers: { 'if-match': '"v1"' } })).status).toBe(412);

    const used = await t.post(`${c}/items`, item({ brandId: created.body.id }), { token });
    expect(used.status).toBe(201);
    expect(used.body.brandId).toBe(created.body.id);
    const inUse = await t.del(url, { token });
    expect(inUse.status).toBe(409);
    expect(inUse.body.code).toBe('BRAND_IN_USE');

    const spare = await t.post(`${c}/brands`, { name: 'NBC' }, { token });
    expect((await t.del(`${c}/brands/${spare.body.id}`, { token })).status).toBe(204);
  });
});

describe('items by category and brand', () => {
  it('filters the list by categoryId and brandId', async () => {
    const { token, c, item } = await setup();
    const tools = (await t.post(`${c}/item-categories`, { name: 'Tools' }, { token })).body;
    const parts = (await t.post(`${c}/item-categories`, { name: 'Parts' }, { token })).body;
    const bosch = (await t.post(`${c}/brands`, { name: 'Bosch' }, { token })).body;
    const a = (await t.post(`${c}/items`, item({ name: 'Drill', categoryId: tools.id, brandId: bosch.id }), { token })).body;
    const b = (await t.post(`${c}/items`, item({ name: 'Spanner', categoryId: tools.id }), { token })).body;
    const d = (await t.post(`${c}/items`, item({ name: 'Bolt', categoryId: parts.id, brandId: bosch.id }), { token })).body;
    await t.post(`${c}/items`, item({ name: 'Loose' }), { token });

    const ids = async (query: Record<string, string>) => (await t.get(`${c}/items`, { token, query })).body.data.map((x: { id: string }) => x.id).sort();
    expect(await ids({ categoryId: tools.id })).toEqual([a.id, b.id].sort());
    expect(await ids({ brandId: bosch.id })).toEqual([a.id, d.id].sort());
    expect(await ids({ categoryId: tools.id, brandId: bosch.id })).toEqual([a.id]);
    expect((await t.get(`${c}/items`, { token })).body.data).toHaveLength(4);
  });

  it("refuses another company's category or brand on an item", async () => {
    const { token, c, item } = await setup();
    const other = await ownerWithCompany(t);
    const theirs = (await t.post(`${other.c}/item-categories`, { name: 'Theirs' }, { token: other.token })).body;
    const theirBrand = (await t.post(`${other.c}/brands`, { name: 'Theirs' }, { token: other.token })).body;

    const res = await t.post(`${c}/items`, item({ categoryId: theirs.id }), { token });
    expect(res.status).toBe(422);
    expect(res.body.issues.map((i: { field: string }) => i.field)).toContain('categoryId');
    const res2 = await t.post(`${c}/items`, item({ brandId: theirBrand.id }), { token });
    expect(res2.status).toBe(422);
    expect(res2.body.issues.map((i: { field: string }) => i.field)).toContain('brandId');

    const mine = (await t.post(`${c}/items`, item(), { token })).body;
    const save = await t.put(`${c}/items/${mine.id}`, { ...item(), categoryId: theirs.id }, { token, headers: { 'if-match': '"v1"' } });
    expect(save.status).toBe(422);
    // And the other company's category can't be read or removed from here.
    expect((await t.del(`${c}/item-categories/${theirs.id}`, { token })).status).toBe(404);
  });
});
