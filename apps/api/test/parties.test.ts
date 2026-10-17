import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { eq } from 'drizzle-orm';
import { MUMBAI, BENGALURU, ownerWithCompany, setupApi } from './helpers';

const t = setupApi();

const customer = (over: Record<string, unknown> = {}) => ({
  kind: 'customer',
  name: 'Sunrise Retail',
  currency: 'INR',
  billingAddress: MUMBAI,
  openingBalance: { minor: 0, currency: 'INR' },
  paymentTermsDays: 30,
  ...over,
});

describe('parties', () => {
  it('creates customers with sequential codes and lists them with balances', async () => {
    const { token, c } = await ownerWithCompany(t);
    const a = await t.post(`${c}/parties`, customer({ name: 'Sunrise Retail' }), { token });
    const b = await t.post(`${c}/parties`, customer({ name: 'Anand Enterprises', taxId: '29AABCG4321K1ZM', billingAddress: BENGALURU }), { token });
    expect(a.status).toBe(201);
    expect([a.body.code, b.body.code]).toEqual(['C-001', 'C-002']);
    expect(b.body.gstRegistrationType).toBe('regular');

    const list = await t.get(`${c}/parties`, { token, query: { kind: 'customer' } });
    expect(list.body.data.map((p: { name: string }) => p.name)).toEqual(['Anand Enterprises', 'Sunrise Retail']);
    expect(list.body.data[0].outstanding).toEqual({ minor: 0, currency: 'INR' });

    const search = await t.get(`${c}/parties`, { token, query: { q: '29AABCG' } });
    expect(search.body.data).toHaveLength(1);
  });

  it('pages with a cursor', async () => {
    const { token, c } = await ownerWithCompany(t);
    for (const name of ['A', 'B', 'C', 'D', 'E']) await t.post(`${c}/parties`, customer({ name }), { token });
    const first = await t.get(`${c}/parties`, { token, query: { limit: 2 } });
    expect(first.body.data.map((p: { name: string }) => p.name)).toEqual(['A', 'B']);
    const second = await t.get(`${c}/parties`, { token, query: { limit: 2, cursor: first.body.nextCursor } });
    expect(second.body.data.map((p: { name: string }) => p.name)).toEqual(['C', 'D']);
    const third = await t.get(`${c}/parties`, { token, query: { limit: 2, cursor: second.body.nextCursor } });
    expect(third.body.data.map((p: { name: string }) => p.name)).toEqual(['E']);
    expect(third.body.nextCursor).toBeNull();
  });

  it('needs the full plan for suppliers', async () => {
    const free = await ownerWithCompany(t);
    const res = await t.post(`${free.c}/parties`, customer({ kind: 'supplier' }), { token: free.token });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: 'pro' });

    const pro = await ownerWithCompany(t, { plan: 'pro' });
    const ok = await t.post(`${pro.c}/parties`, customer({ kind: 'supplier', name: 'Konkan Steel' }), { token: pro.token });
    expect(ok.body.code).toBe('S-001');
  });

  it('validates the GSTIN against its check digit and state', async () => {
    const { token, c } = await ownerWithCompany(t);
    const bad = await t.post(`${c}/parties`, customer({ taxId: '29AABCG4321K1ZX', billingAddress: BENGALURU }), { token });
    expect(bad.status).toBe(422);
    expect(bad.body.issues[0].field).toBe('taxId');
    const wrongState = await t.post(`${c}/parties`, customer({ taxId: '29AABCG4321K1ZM', billingAddress: MUMBAI }), { token });
    expect(wrongState.body.issues[0].field).toBe('billingAddress.stateCode');
  });

  it('saves with If-Match and refuses a stale version', async () => {
    const { token, c } = await ownerWithCompany(t);
    const created = await t.post(`${c}/parties`, customer(), { token });
    const url = `${c}/parties/${created.body.id}`;
    const got = await t.get(url, { token });
    expect(got.headers.etag).toBe('"v1"');

    const saved = await t.put(url, { ...customer(), name: 'Sunrise Retail LLP' }, { token, headers: { 'if-match': '"v1"' } });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ name: 'Sunrise Retail LLP', version: 2, code: 'C-001' });

    const stale = await t.put(url, { ...customer(), name: 'Lost update' }, { token, headers: { 'if-match': '"v1"' } });
    expect(stale.status).toBe(412);
    expect(stale.body.code).toBe('VERSION_MISMATCH');
  });

  it('deletes an unused party, refuses one in use, and writes the audit trail', async () => {
    const { token, c, company, user } = await ownerWithCompany(t);
    const keep = await t.post(`${c}/parties`, customer({ name: 'Keep' }), { token });
    const drop = await t.post(`${c}/parties`, customer({ name: 'Drop' }), { token });
    // A payment referencing `keep`, written directly.
    const db = t.deps.db;
    const [branch] = await db.select().from(schema.branches).where(eq(schema.branches.companyId, company.id!));
    const [account] = await db.select().from(schema.paymentAccounts).where(eq(schema.paymentAccounts.companyId, company.id!));
    await db.insert(schema.payments).values({
      id: 'pay_test', companyId: company.id!, branchId: branch.id, number: 'PAY-1', direction: 'received', partyId: keep.body.id,
      date: '2026-09-01', amountMinor: 50000, currency: 'INR', method: 'cash', accountId: account.id, unallocatedMinor: 50000, createdBy: user.id!,
    });

    expect((await t.del(`${c}/parties/${drop.body.id}`, { token })).status).toBe(204);
    expect((await t.get(`${c}/parties/${drop.body.id}`, { token })).status).toBe(404);
    const inUse = await t.del(`${c}/parties/${keep.body.id}`, { token });
    expect(inUse.status).toBe(409);
    expect(inUse.body.code).toBe('PARTY_IN_USE');

    // The unallocated payment is the customer's advance.
    const kept = await t.get(`${c}/parties/${keep.body.id}`, { token });
    expect(kept.body.advance).toEqual({ minor: 50000, currency: 'INR' });

    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.companyId, company.id!));
    expect(audit.map((a) => `${a.entityType}:${a.action}`)).toEqual(expect.arrayContaining(['party:created', 'party:deleted']));
  });

  it('forbids a viewer from creating parties', async () => {
    const { token, c, user } = await ownerWithCompany(t);
    await t.deps.db.update(schema.users).set({ role: 'viewer' }).where(eq(schema.users.id, user.id!));
    const res = await t.post(`${c}/parties`, customer(), { token });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_FORBIDDEN');
  });
});
