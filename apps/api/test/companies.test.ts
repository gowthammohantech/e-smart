import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { eq } from 'drizzle-orm';
import { BENGALURU, MUMBAI, createCompany, idem, ownerWithCompany, setupApi, signUpOwner } from './helpers';

const t = setupApi();

describe('companies', () => {
  it('creates a company with its defaults and lists it', async () => {
    const { token, company, user } = await ownerWithCompany(t);
    expect(company).toMatchObject({ name: 'Vertex Traders', plan: 'free', country: 'IN', baseCurrency: 'INR', version: 1 });
    expect(company.taxRegistration?.identifier).toBe('27AAPFU0939F1ZV');

    const db = t.deps.db;
    const series = await db.select().from(schema.numberingSeries).where(eq(schema.numberingSeries.companyId, company.id!));
    expect(series).toHaveLength(11);
    const taxes = await db.select().from(schema.taxCategories).where(eq(schema.taxCategories.companyId, company.id!));
    expect(taxes.map((x) => Number(x.rate)).sort((a, b) => a - b)).toEqual([0, 5, 12, 18, 28]);
    const branches = await db.select().from(schema.branches).where(eq(schema.branches.companyId, company.id!));
    expect(branches).toHaveLength(1);
    expect(branches[0].isPrimary).toBe(true);

    const list = await t.get('/companies', { token });
    expect(list.body.data.map((c: { id: string }) => c.id)).toEqual([company.id]);
    const me = await t.get('/me', { token });
    expect(me.body.defaultCompanyId).toBe(company.id);
    expect(me.body.user.companyIds).toEqual([company.id]);
    void user;
  });

  it('keeps branches and numbering sent by onboarding', async () => {
    const owner = await signUpOwner(t);
    const company = await createCompany(t, owner.token, {
      branches: [
        { name: 'Mumbai HQ', code: 'mum', address: MUMBAI, isPrimary: true },
        { name: 'Bengaluru', code: 'BLR', address: BENGALURU },
      ],
      numberingSeries: [{ kind: 'invoice', prefix: 'VT', nextNumber: 101, padding: 5 }],
    } as never);
    const rows = await t.deps.db.select().from(schema.numberingSeries).where(eq(schema.numberingSeries.companyId, company.id!));
    expect(rows.find((r) => r.kind === 'invoice')).toMatchObject({ prefix: 'VT', nextNumber: 101, padding: 5 });
    const branches = await t.deps.db.select().from(schema.branches).where(eq(schema.branches.companyId, company.id!));
    expect(branches.map((b) => b.code).sort()).toEqual(['BLR', 'MUM']);
  });

  it('rejects a GSTIN with a bad check digit', async () => {
    const owner = await signUpOwner(t);
    const res = await t.post(
      '/companies',
      { name: 'X', businessType: 'retail', country: 'IN', baseCurrency: 'INR', address: MUMBAI, fiscalYearStartMonth: 4, taxRegistration: { regime: 'GST', identifier: '27AAPFU0939F1ZX', identifierLabel: 'GSTIN', registered: true } },
      { token: owner.token },
    );
    expect(res.status).toBe(422);
    expect(res.body.issues[0].field).toBe('taxRegistration.identifier');
  });

  it("keeps one account out of another's companies", async () => {
    const a = await ownerWithCompany(t);
    const b = await signUpOwner(t);
    const res = await t.get(a.c, { token: b.token });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('COMPANY_ACCESS_DENIED');
  });

  it('returns an ETag and replays an idempotent create', async () => {
    const owner = await signUpOwner(t);
    const headers = idem();
    const body = { name: 'Once Only', businessType: 'retail', country: 'IN', baseCurrency: 'INR', address: MUMBAI, fiscalYearStartMonth: 4 };
    const first = await t.post('/companies', body, { token: owner.token, headers });
    const retry = await t.post('/companies', body, { token: owner.token, headers });
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.id).toBe(first.body.id);
    expect((await t.get('/companies', { token: owner.token })).body.data).toHaveLength(1);

    const changed = await t.post('/companies', { ...body, name: 'Different' }, { token: owner.token, headers });
    expect(changed.status).toBe(422);
    expect(changed.body.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const got = await t.get(`/companies/${first.body.id}`, { token: owner.token });
    expect(got.headers.etag).toBe('"v1"');
  });
});
