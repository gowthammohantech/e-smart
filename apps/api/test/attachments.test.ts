import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { MemoryStorage } from '../src/providers';
import { idem, ownerWithCompany, setupApi } from './helpers';

const t = setupApi();

const pathOf = (url: string) => {
  const u = new URL(url);
  return u.pathname + u.search;
};

/** PUTs bytes to a signed upload URL the way a client would. */
async function upload(url: string, headers: Record<string, string>, body: Buffer) {
  return t.app.inject({ method: 'PUT', url: pathOf(url), headers, payload: body });
}

describe('attachments', () => {
  it('reserves, uploads, completes, downloads and deletes', async () => {
    const { token, c } = await ownerWithCompany(t);
    const bytes = Buffer.from('%PDF-1.4 receipt');
    const reserved = await t.post(`${c}/attachments`, { name: 'receipt.pdf', mimeType: 'application/pdf', size: 999 }, { token, headers: idem() });
    expect(reserved.status).toBe(201);
    expect(reserved.body.attachment).toMatchObject({ name: 'receipt.pdf', status: 'pending', size: 999 });
    expect(reserved.body.attachment.uri).toBeUndefined();
    expect(reserved.body.uploadHeaders).toEqual({ 'content-type': 'application/pdf' });
    const id = reserved.body.attachment.id;

    const early = await t.post(`${c}/attachments/${id}/complete`, {}, { token });
    expect(early.status).toBe(422);
    expect(early.body.code).toBe('UPLOAD_MISSING');

    expect((await upload(reserved.body.uploadUrl, reserved.body.uploadHeaders, bytes)).statusCode).toBe(200);
    const done = await t.post(`${c}/attachments/${id}/complete`, {}, { token });
    expect(done.status).toBe(200);
    // The size is what actually arrived, not what the client announced.
    expect(done.body).toMatchObject({ status: 'ready', size: bytes.length });
    expect((await t.post(`${c}/attachments/${id}/complete`, {}, { token })).body.status).toBe('ready');

    const got = await t.get(`${c}/attachments/${id}`, { token });
    const file = await t.app.inject({ method: 'GET', url: pathOf(got.body.uri) });
    expect(file.body).toBe('%PDF-1.4 receipt');

    const list = await t.get(`${c}/attachments`, { token });
    expect(list.body.data.map((a: { id: string }) => a.id)).toEqual([id]);

    const storage = t.providers.storage as MemoryStorage;
    const [row] = await t.deps.db.select().from(schema.attachments).where(eq(schema.attachments.id, id));
    expect(storage.objects.has(row.storageKey)).toBe(true);
    expect((await t.del(`${c}/attachments/${id}`, { token })).status).toBe(204);
    expect(storage.objects.has(row.storageKey)).toBe(false);
    expect((await t.get(`${c}/attachments/${id}`, { token })).status).toBe(404);

    const trail = await t.deps.db.select().from(schema.changeLog).where(eq(schema.changeLog.entityId, id));
    expect(trail.map((r) => `${r.entityType}:${r.op}`)).toEqual(['attachment:upsert', 'attachment:upsert', 'attachment:delete']);
  });

  it('links to records in the company only and filters by entity', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const party = await t.post(`${c}/parties`, { kind: 'customer', name: 'Sunrise', currency: 'INR', billingAddress: { line1: 'x', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', postalCode: '400001', country: 'IN' }, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 30 }, { token });
    const other = await ownerWithCompany(t);

    const linked = await t.post(`${c}/attachments`, { name: 'kyc.png', mimeType: 'image/png', size: 10, entityType: 'party', entityId: party.body.id }, { token });
    expect(linked.status).toBe(201);
    await t.post(`${c}/attachments`, { name: 'logo.png', mimeType: 'image/png', size: 10, entityType: 'company', entityId: company.id }, { token });
    const foreign = await t.post(`${other.c}/attachments`, { name: 'x.png', mimeType: 'image/png', size: 10, entityType: 'party', entityId: party.body.id }, { token: other.token });
    expect(foreign.status).toBe(422);
    expect(foreign.body.issues[0].field).toBe('entityId');
    const half = await t.post(`${c}/attachments`, { name: 'x.png', mimeType: 'image/png', size: 10, entityType: 'party' }, { token });
    expect(half.status).toBe(422);

    const filtered = await t.get(`${c}/attachments`, { token, query: { entityType: 'party', entityId: party.body.id } });
    expect(filtered.body.data.map((a: { name: string }) => a.name)).toEqual(['kyc.png']);
    expect((await t.get(`${other.c}/attachments/${linked.body.attachment.id}`, { token: other.token })).status).toBe(404);
  });

  it('refuses oversize files and other types', async () => {
    const { token, c } = await ownerWithCompany(t);
    const big = await t.post(`${c}/attachments`, { name: 'huge.pdf', mimeType: 'application/pdf', size: 11 * 1024 * 1024 }, { token });
    expect(big.status).toBe(422);
    const exe = await t.post(`${c}/attachments`, { name: 'x.exe', mimeType: 'application/octet-stream', size: 10 }, { token });
    expect(exe.status).toBe(422);
  });

  it('clears an item image when its attachment is removed', async () => {
    const { token, c } = await ownerWithCompany(t);
    const [tax] = (await t.get(`${c}/tax-categories`, { token })).body.data;
    const item = await t.post(`${c}/items`, { sku: 'A', name: 'A', type: 'service', unit: 'NOS', salePrice: { minor: 1, currency: 'INR' }, purchasePrice: { minor: 1, currency: 'INR' }, taxCategoryId: tax.id }, { token });
    const reserved = await t.post(`${c}/attachments`, { name: 'a.png', mimeType: 'image/png', size: 4, entityType: 'item', entityId: item.body.id }, { token });
    const id = reserved.body.attachment.id;
    await t.deps.db.update(schema.items).set({ imageAttachmentId: id }).where(eq(schema.items.id, item.body.id));
    expect((await t.del(`${c}/attachments/${id}`, { token })).status).toBe(204);
    const [row] = await t.deps.db.select().from(schema.items).where(eq(schema.items.id, item.body.id));
    expect(row).toMatchObject({ imageAttachmentId: null, version: 2 });
  });

  it('lets sales upload but only accountants and up delete', async () => {
    const { token, c, user } = await ownerWithCompany(t);
    await t.deps.db.update(schema.users).set({ role: 'sales' }).where(eq(schema.users.id, user.id!));
    const reserved = await t.post(`${c}/attachments`, { name: 'a.pdf', mimeType: 'application/pdf', size: 4 }, { token });
    expect(reserved.status).toBe(201);
    const del = await t.del(`${c}/attachments/${reserved.body.attachment.id}`, { token });
    expect(del.status).toBe(403);
  });
});
