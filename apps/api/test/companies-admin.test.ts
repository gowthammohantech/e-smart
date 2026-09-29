import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { BENGALURU, MUMBAI, ownerWithCompany, setupApi } from './helpers';
import { joinTeam } from './team-helpers';

const t = setupApi();

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a1c4d6e30000000049454e44ae426082', 'hex');

function multipart(name: string, filename: string, type: string, bytes: Buffer) {
  const boundary = '----esmart-test-boundary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const branch = (over: Record<string, unknown> = {}) => ({ name: 'Bengaluru', code: 'blr', address: BENGALURU, ...over });

describe('company profile', () => {
  it('saves with If-Match, ignores plan, and keeps the primary branch address in step', async () => {
    const { token, company, c } = await ownerWithCompany(t);
    const next = { ...company, name: 'Vertex Traders LLP', plan: 'business', address: { ...MUMBAI, line1: '99 New Road' } };
    const saved = await t.put(c, next, { token, headers: { 'if-match': '"v1"' } });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ name: 'Vertex Traders LLP', plan: 'free', version: 2 });
    const [primary] = await t.deps.db.select().from(schema.branches).where(eq(schema.branches.companyId, company.id!));
    expect(primary.addressLine1).toBe('99 New Road');

    const stale = await t.put(c, { ...next, name: 'Lost' }, { token, headers: { 'if-match': '"v1"' } });
    expect(stale.status).toBe(412);

    const badGstin = await t.put(c, { ...next, taxRegistration: { ...company.taxRegistration, identifier: '27AAPFU0939F1ZX' } }, { token });
    expect(badGstin.status).toBe(422);
  });

  it('freezes the tax identity once entries are posted', async () => {
    const { token, company, c, user } = await ownerWithCompany(t);
    const party = await t.post(`${c}/parties`, { kind: 'customer', name: 'Sunrise', currency: 'INR', billingAddress: MUMBAI, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 0 }, { token });
    const [b] = await t.deps.db.select().from(schema.branches).where(eq(schema.branches.companyId, company.id!));
    await t.deps.db.insert(schema.documents).values({
      id: 'doc_posted', companyId: company.id!, branchId: b.id, kind: 'invoice', number: 'INV/26-27/0001', status: 'issued', partyId: party.body.id,
      date: '2026-09-01', currency: 'INR', createdBy: user.id!,
    });
    const res = await t.put(c, { ...company, legalName: 'Changed Pvt Ltd', fiscalYearStartMonth: 1, taxRegistration: { ...company.taxRegistration, identifier: '29AABCG4321K1ZM' } }, { token });
    expect(res.status).toBe(200);
    expect(res.body.taxRegistration.identifier).toBe('27AAPFU0939F1ZV');
    expect(res.body.fiscalYearStartMonth).toBe(4);
    expect(res.body.legalName).toBeUndefined();
  });

  it('uploads, replaces and removes the logo', async () => {
    const { token, company, c } = await ownerWithCompany(t);
    const up = multipart('file', 'logo.png', 'image/png', PNG);
    const res = await t.put(`${c}/logo`, up.body, { token, headers: up.headers });
    expect(res.status).toBe(200);
    expect(res.body.logoUri).toMatch(/_storage/);
    expect(res.body.version).toBe(2);
    const [att] = await t.deps.db.select().from(schema.attachments).where(eq(schema.attachments.companyId, company.id!));
    expect(att).toMatchObject({ entityType: 'company', entityId: company.id, status: 'ready', mimeType: 'image/png', sizeBytes: PNG.length });
    const storage = t.providers.storage as unknown as { objects: Map<string, unknown> };
    expect(storage.objects.has(att.storageKey)).toBe(true);

    // Replacing drops the old file.
    await t.put(`${c}/logo`, up.body, { token, headers: up.headers });
    const atts = await t.deps.db.select().from(schema.attachments).where(eq(schema.attachments.companyId, company.id!));
    expect(atts).toHaveLength(1);
    expect(storage.objects.has(att.storageKey)).toBe(false);

    const notImage = multipart('file', 'logo.png', 'image/png', Buffer.from('hello'));
    expect((await t.put(`${c}/logo`, notImage.body, { token, headers: notImage.headers })).status).toBe(415);

    expect((await t.del(`${c}/logo`, { token })).status).toBe(204);
    const got = await t.get(c, { token });
    expect(got.body.logoUri).toBeUndefined();
    expect(await t.deps.db.select().from(schema.attachments).where(eq(schema.attachments.companyId, company.id!))).toHaveLength(0);
  });
});

describe('branches', () => {
  it('needs the branches module to add one', async () => {
    const free = await ownerWithCompany(t);
    const res = await t.post(`${free.c}/branches`, branch(), { token: free.token });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_UPGRADE_REQUIRED');
  });

  it('keeps exactly one primary branch', async () => {
    const { token, c } = await ownerWithCompany(t, { plan: 'pro' });
    const created = await t.post(`${c}/branches`, branch(), { token });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ code: 'BLR', isPrimary: false, version: 1 });
    expect((await t.post(`${c}/branches`, branch({ name: 'Other' }), { token })).body.code).toBe('BRANCH_CODE_TAKEN');

    const promoted = await t.put(`${c}/branches/${created.body.id}`, { ...created.body, isPrimary: true }, { token, headers: { 'if-match': '"v1"' } });
    expect(promoted.body.isPrimary).toBe(true);
    const list = await t.get(`${c}/branches`, { token });
    expect(list.body.data.filter((b: { isPrimary: boolean }) => b.isPrimary).map((b: { id: string }) => b.id)).toEqual([created.body.id]);

    const unset = await t.put(`${c}/branches/${created.body.id}`, { ...promoted.body, isPrimary: false }, { token });
    expect(unset.status).toBe(409);
    expect(unset.body.code).toBe('PRIMARY_BRANCH_REQUIRED');

    const stale = await t.put(`${c}/branches/${created.body.id}`, { ...promoted.body, name: 'X' }, { token, headers: { 'if-match': '"v1"' } });
    expect(stale.status).toBe(412);
  });

  it('refuses to delete the primary branch or one in use, and 404s other companies', async () => {
    const { token, c, company, user } = await ownerWithCompany(t, { plan: 'pro' });
    const other = await ownerWithCompany(t, { plan: 'pro' });
    const list = await t.get(`${c}/branches`, { token });
    const primary = list.body.data[0];
    expect((await t.del(`${c}/branches/${primary.id}`, { token })).body.code).toBe('BRANCH_IN_USE');

    const spare = await t.post(`${c}/branches`, branch(), { token });
    const used = await t.post(`${c}/branches`, branch({ code: 'PUN', name: 'Pune' }), { token });
    const [account] = await t.deps.db.select().from(schema.paymentAccounts).where(eq(schema.paymentAccounts.companyId, company.id!));
    const party = await t.post(`${c}/parties`, { kind: 'customer', name: 'Sunrise', currency: 'INR', billingAddress: MUMBAI, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 0 }, { token });
    await t.deps.db.insert(schema.payments).values({
      id: 'pay_b', companyId: company.id!, branchId: used.body.id, number: 'PAY-1', direction: 'received', partyId: party.body.id,
      date: '2026-09-01', amountMinor: 100, currency: 'INR', method: 'cash', accountId: account.id, unallocatedMinor: 100, createdBy: user.id!,
    });
    const inUse = await t.del(`${c}/branches/${used.body.id}`, { token });
    expect(inUse.status).toBe(409);
    expect(inUse.body.code).toBe('BRANCH_IN_USE');

    expect((await t.del(`${other.c}/branches/${spare.body.id}`, { token: other.token })).status).toBe(404);
    expect((await t.del(`${c}/branches/${spare.body.id}`, { token })).status).toBe(204);
    const left = await t.deps.db.select().from(schema.branches).where(and(eq(schema.branches.companyId, company.id!), eq(schema.branches.id, spare.body.id)));
    expect(left).toHaveLength(0);
    const audit = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, spare.body.id));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['created', 'deleted']));
  });

  it('shows a branch-limited user only their branches', async () => {
    const { token, c, company } = await ownerWithCompany(t, { plan: 'pro' });
    const blr = await t.post(`${c}/branches`, branch(), { token });
    const member = await joinTeam(t, token, { role: 'sales', companyIds: [company.id!], branchIds: [blr.body.id] });
    const list = await t.get(`${c}/branches`, { token: member.token });
    expect(list.body.data.map((b: { id: string }) => b.id)).toEqual([blr.body.id]);
    const denied = await t.post(`${c}/branches`, branch({ code: 'X1' }), { token: member.token });
    expect(denied.status).toBe(403);
  });
});
