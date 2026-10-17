import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { ownerWithCompany, setupApi } from './helpers';

const t = setupApi();

async function setup(plan: 'free' | 'pro' = 'pro') {
  const o = await ownerWithCompany(t, { plan });
  const taxes = (await t.get(`${o.c}/tax-categories`, { token: o.token })).body.data;
  const gst18 = taxes.find((x: { rate: number }) => x.rate === 18);
  const item = (over: Record<string, unknown> = {}) => ({
    sku: 'BRG-6203',
    name: 'Steel Ball Bearing 6203',
    type: 'goods',
    unit: 'pcs',
    salePrice: { minor: 15000, currency: 'INR' },
    purchasePrice: { minor: 11800, currency: 'INR' },
    taxCategoryId: gst18.id,
    hsnCode: '84821011',
    trackInventory: true,
    openingStock: 10,
    reorderLevel: 5,
    ...over,
  });
  return { ...o, item };
}

/** A multipart/form-data body with one `file` field. */
function multipart(filename: string, type: string, content: Buffer) {
  const boundary = `----esmart${randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('catalog', () => {
  it('creates an item with opening stock, adding an unknown HSN code to the master', async () => {
    const { token, c, item, company } = await setup();
    const created = await t.post(`${c}/items`, item({ hsnCode: '84821099' }), { token });
    expect(created.status).toBe(201);
    expect(created.headers.etag).toBe('"v1"');
    expect(created.body).toMatchObject({ unit: 'PCS', hsnCode: '84821099', openingStock: 10, trackInventory: true, version: 1 });
    const [hsn] = await t.deps.db.select().from(schema.hsnCodes).where(eq(schema.hsnCodes.code, '84821099'));
    expect(hsn).toMatchObject({ description: 'Added from catalog', isService: false });

    const moves = await t.deps.db.select().from(schema.stockMovements).where(eq(schema.stockMovements.companyId, company.id!));
    expect(moves.map((m) => [m.type, Number(m.quantity), m.unitCostMinor])).toEqual([['opening', 10, 11800]]);

    const got = await t.get(`${c}/items/${created.body.id}`, { token });
    expect(got.body).toMatchObject({ stockOnHand: 10, low: false });
  });

  it('derives stock from the movement ledger, per branch, and flags low stock', async () => {
    const { token, c, item, company, user } = await setup();
    const created = await t.post(`${c}/items`, item(), { token });
    const other = await t.post(`${c}/items`, item({ sku: 'SVC-1', name: 'Installation', type: 'service', unit: 'NOS', trackInventory: false, openingStock: 0, hsnCode: '995461' }), { token });
    const db = t.deps.db;
    const [branch] = await db.select().from(schema.branches).where(eq(schema.branches.companyId, company.id!));
    const [second] = await db
      .insert(schema.branches)
      .values({ id: 'brn_pun', companyId: company.id!, name: 'Pune', code: 'PUN', addressLine1: 'x', addressCity: 'Pune', addressState: 'Maharashtra', addressPostalCode: '411026', addressCountry: 'IN' })
      .returning();
    const move = { companyId: company.id!, itemId: created.body.id, currency: 'INR', date: '2026-09-02', createdBy: user.id! };
    await db.insert(schema.stockMovements).values([
      // Written with a positive quantity; the type decides the direction, as in core.
      { ...move, id: 'stm_1', branchId: branch.id, type: 'salesIssue', quantity: '3' },
      { ...move, id: 'stm_2', branchId: branch.id, type: 'adjustment', quantity: '-2' },
      { ...move, id: 'stm_3', branchId: second.id, type: 'transferIn', quantity: '4' },
    ]);
    expect((await t.get(`${c}/items/${created.body.id}`, { token })).body).toMatchObject({ stockOnHand: 9, low: false });

    const atHead = await t.get(`${c}/items`, { token, query: { branchId: branch.id } });
    const bearing = atHead.body.data.find((i: { id: string }) => i.id === created.body.id);
    expect(bearing).toMatchObject({ stockOnHand: 5, low: true });

    const low = await t.get(`${c}/items`, { token, query: { lowStock: true, branchId: branch.id } });
    expect(low.body.data.map((i: { id: string }) => i.id)).toEqual([created.body.id]);
    const notLow = await t.get(`${c}/items`, { token, query: { lowStock: false } });
    expect(notLow.body.data.map((i: { id: string }) => i.id)).toEqual([other.body.id, created.body.id]);
  });

  it('filters, searches and pages', async () => {
    const { token, c, item } = await setup();
    for (const [i, name] of ['Anchor bolt', 'Bearing', 'Cable', 'Drill bit'].entries()) {
      await t.post(`${c}/items`, item({ sku: `SKU-${i}`, name, barcode: `890100000000${i}`, openingStock: 0 }), { token });
    }
    const scan = await t.get(`${c}/items`, { token, query: { barcode: '8901000000002' } });
    expect(scan.body.data.map((i: { name: string }) => i.name)).toEqual(['Cable']);
    const q = await t.get(`${c}/items`, { token, query: { q: 'sku-3' } });
    expect(q.body.data.map((i: { name: string }) => i.name)).toEqual(['Drill bit']);
    const first = await t.get(`${c}/items`, { token, query: { limit: 3 } });
    expect(first.body.data).toHaveLength(3);
    const second = await t.get(`${c}/items`, { token, query: { limit: 3, cursor: first.body.nextCursor } });
    expect(second.body.data.map((i: { name: string }) => i.name)).toEqual(['Drill bit']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('refuses duplicate SKUs and barcodes, unknown units, bad HSN and foreign prices', async () => {
    const { token, c, item } = await setup();
    await t.post(`${c}/items`, item({ barcode: '8901234567890' }), { token });
    const sku = await t.post(`${c}/items`, item({ sku: 'brg-6203' }), { token });
    expect(sku.status).toBe(409);
    expect(sku.body.code).toBe('ITEM_SKU_TAKEN');
    const code = await t.post(`${c}/items`, item({ sku: 'X', barcode: '8901234567890' }), { token });
    expect(code.body.code).toBe('ITEM_BARCODE_TAKEN');

    const unit = await t.post(`${c}/items`, item({ sku: 'U', unit: 'crate' }), { token });
    expect(unit.status).toBe(422);
    expect(unit.body.issues[0].field).toBe('unit');
    const hsn = await t.post(`${c}/items`, item({ sku: 'H', hsnCode: '84821' }), { token });
    expect(hsn.status).toBe(422);
    expect(hsn.body.issues[0].field).toBe('hsnCode');
    const usd = await t.post(`${c}/items`, item({ sku: 'D', salePrice: { minor: 100, currency: 'USD' } }), { token });
    expect(usd.body.issues[0].field).toBe('salePrice.currency');
  });

  it('saves with If-Match and keeps opening stock from create', async () => {
    const { token, c, item } = await setup();
    const created = await t.post(`${c}/items`, item(), { token });
    const url = `${c}/items/${created.body.id}`;
    const saved = await t.put(url, item({ name: 'Bearing 6203-2RS', openingStock: 99 }), { token, headers: { 'if-match': '"v1"' } });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ name: 'Bearing 6203-2RS', openingStock: 10, version: 2 });
    const stale = await t.put(url, item({ name: 'Lost' }), { token, headers: { 'if-match': '"v1"' } });
    expect(stale.status).toBe(412);
  });

  it('deletes only unused items and hides other companies’ items', async () => {
    const { token, c, item } = await setup();
    const stocked = await t.post(`${c}/items`, item(), { token });
    const plain = await t.post(`${c}/items`, item({ sku: 'P-1', openingStock: 0 }), { token });
    const other = await setup();
    expect((await t.get(`${other.c}/items/${plain.body.id}`, { token: other.token })).status).toBe(404);
    expect((await t.del(`${other.c}/items/${plain.body.id}`, { token: other.token })).status).toBe(404);

    const inUse = await t.del(`${c}/items/${stocked.body.id}`, { token });
    expect(inUse.status).toBe(409);
    expect(inUse.body.code).toBe('ITEM_IN_USE');
    expect((await t.del(`${c}/items/${plain.body.id}`, { token })).status).toBe(204);
    expect((await t.get(`${c}/items/${plain.body.id}`, { token })).status).toBe(404);
    const audit = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, plain.body.id));
    expect(audit.map((a) => `${a.entityType}:${a.action}`)).toEqual(['item:created', 'item:deleted']);
  });

  it('stores an uploaded image and replaces it on the next upload', async () => {
    const { token, c, item } = await setup();
    const created = await t.post(`${c}/items`, item(), { token });
    const url = `${c}/items/${created.body.id}/image`;
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const first = multipart('photo 1.png', 'image/png', png);
    const up = await t.put(url, first.body, { token, headers: first.headers });
    expect(up.status).toBe(200);
    expect(up.body.version).toBe(2);
    const download = await t.app.inject({ method: 'GET', url: new URL(up.body.imageUri).pathname + new URL(up.body.imageUri).search });
    expect(download.statusCode).toBe(200);
    expect(Buffer.compare(download.rawPayload, png)).toBe(0);

    const second = multipart('photo-2.jpg', 'image/jpeg', Buffer.from('ffd8ffe0', 'hex'));
    await t.put(url, second.body, { token, headers: second.headers });
    const atts = await t.deps.db.select().from(schema.attachments).where(eq(schema.attachments.entityId, created.body.id));
    expect(atts.map((a) => [a.name, a.status, a.mimeType])).toEqual([['photo-2.jpg', 'ready', 'image/jpeg']]);
    expect((await t.get(`${c}/items/${created.body.id}`, { token })).body.imageUri).toContain('/v1/_storage/');

    const pdf = multipart('spec.pdf', 'application/pdf', Buffer.from('%PDF-1.4'));
    const refused = await t.put(url, pdf.body, { token, headers: pdf.headers });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('keeps viewers and sales out of item edits', async () => {
    const { token, c, item, user } = await setup();
    await t.deps.db.update(schema.users).set({ role: 'sales' }).where(eq(schema.users.id, user.id!));
    const res = await t.post(`${c}/items`, item(), { token });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_FORBIDDEN');
  });
});
