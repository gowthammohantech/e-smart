import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { ownerWithCompany, setupApi } from './helpers';

const t = setupApi();

/** The company's primary branch and default account, for rows written directly. */
async function basics(companyId: string) {
  const db = t.deps.db;
  const [branch] = await db.select().from(schema.branches).where(eq(schema.branches.companyId, companyId));
  const [account] = await db.select().from(schema.paymentAccounts).where(eq(schema.paymentAccounts.companyId, companyId));
  const [category] = await db.select().from(schema.expenseCategories).where(eq(schema.expenseCategories.companyId, companyId));
  return { branch, account, category };
}

describe('tax categories', () => {
  it('lists the seeded slabs, creates one with a new HSN, and saves with If-Match', async () => {
    const { token, c } = await ownerWithCompany(t);
    const list = await t.get(`${c}/tax-categories`, { token });
    expect(list.body.data.map((x: { rate: number }) => x.rate)).toEqual([0, 5, 12, 18, 28]);

    const created = await t.post(`${c}/tax-categories`, { name: 'GST 3%', rate: 3, type: 'GST', effectiveFrom: '2017-07-01', hsnCode: '71131910' }, { token });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'GST 3%', rate: 3, hsnCode: '71131910' });
    const [hsn] = await t.deps.db.select().from(schema.hsnCodes).where(eq(schema.hsnCodes.code, '71131910'));
    expect(hsn.description).toBe('Added from catalog');

    const url = `${c}/tax-categories/${created.body.id}`;
    const saved = await t.put(url, { name: 'GST 3% (jewellery)', rate: 3, type: 'GST', effectiveFrom: '2017-07-01' }, { token, headers: { 'if-match': created.headers.etag as string } });
    expect(saved.status).toBe(200);
    expect(saved.headers.etag).toBe('"v2"');
    expect(saved.body.hsnCode).toBeUndefined();
    const stale = await t.put(url, { name: 'Lost', rate: 3, type: 'GST', effectiveFrom: '2017-07-01' }, { token, headers: { 'if-match': '"v1"' } });
    expect(stale.status).toBe(412);

    const bad = await t.post(`${c}/tax-categories`, { name: 'Odd', rate: 140, type: 'GST', effectiveFrom: '2017-07-01' }, { token });
    expect(bad.status).toBe(422);
    expect(bad.body.issues[0].field).toBe('rate');
  });

  it('refuses to delete a category an item uses, and 404s across companies', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const other = await ownerWithCompany(t);
    const [used, unused] = (await t.get(`${c}/tax-categories`, { token })).body.data;
    await t.deps.db.insert(schema.items).values({
      id: 'itm_t1', companyId: company.id!, sku: 'S1', name: 'Widget', type: 'goods', unit: 'PCS', currency: 'INR', taxCategoryId: used.id,
    });
    const inUse = await t.del(`${c}/tax-categories/${used.id}`, { token });
    expect(inUse.status).toBe(409);
    expect(inUse.body.code).toBe('TAX_CATEGORY_IN_USE');

    expect((await t.del(`${other.c}/tax-categories/${unused.id}`, { token: other.token })).status).toBe(404);
    expect((await t.del(`${c}/tax-categories/${unused.id}`, { token })).status).toBe(204);
    const audit = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.entityId, unused.id));
    expect(audit.map((a) => a.action)).toEqual(['deleted']);
  });

  it('is closed to viewers', async () => {
    const { token, c, user } = await ownerWithCompany(t);
    await t.deps.db.update(schema.users).set({ role: 'viewer' }).where(eq(schema.users.id, user.id!));
    const res = await t.post(`${c}/tax-categories`, { name: 'X', rate: 1, type: 'GST', effectiveFrom: '2017-07-01' }, { token });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_FORBIDDEN');
  });
});

describe('expense categories', () => {
  it('needs the expenses module', async () => {
    const { token, c } = await ownerWithCompany(t);
    const res = await t.get(`${c}/expense-categories`, { token });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_UPGRADE_REQUIRED');
  });

  it('creates, renames, refuses duplicates and deletes only unused ones', async () => {
    const { token, c, company, user } = await ownerWithCompany(t, { plan: 'pro' });
    const created = await t.post(`${c}/expense-categories`, { name: 'Software' }, { token });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Software', icon: 'tag-outline', color: '#8E98AC' });
    const dupe = await t.post(`${c}/expense-categories`, { name: 'software' }, { token });
    expect(dupe.status).toBe(422);
    expect(dupe.body.code).toBe('EXPENSE_CATEGORY_EXISTS');

    const saved = await t.put(`${c}/expense-categories/${created.body.id}`, { name: 'SaaS', color: '#112233' }, { token });
    expect(saved.body).toMatchObject({ name: 'SaaS', icon: 'tag-outline', color: '#112233' });

    const { branch, account, category } = await basics(company.id!);
    await t.deps.db.insert(schema.expenses).values({
      id: 'exp_t1', companyId: company.id!, branchId: branch.id, number: 'EXP-1', categoryId: category.id, date: '2026-09-01',
      amountMinor: 1000, currency: 'INR', accountId: account.id, method: 'cash', createdBy: user.id!,
    });
    const inUse = await t.del(`${c}/expense-categories/${category.id}`, { token });
    expect(inUse.status).toBe(409);
    expect(inUse.body.code).toBe('EXPENSE_CATEGORY_IN_USE');
    expect((await t.del(`${c}/expense-categories/${created.body.id}`, { token })).status).toBe(204);
  });
});

describe('payment accounts', () => {
  it('keeps one default and derives the current balance from payments and expenses', async () => {
    const { token, c, company, user } = await ownerWithCompany(t);
    const bank = await t.post(`${c}/payment-accounts`, { name: 'HDFC Current', type: 'bank', currency: 'INR', accountNumber: 'XXXX8842', openingBalance: { minor: 100000, currency: 'INR' }, isDefault: true }, { token });
    expect(bank.status).toBe(201);
    expect(bank.body.currentBalance).toEqual({ minor: 100000, currency: 'INR' });

    const list = await t.get(`${c}/payment-accounts`, { token });
    expect(list.body.data.map((a: { name: string; isDefault: boolean }) => [a.name, a.isDefault])).toEqual([
      ['HDFC Current', true],
      ['Cash', false],
    ]);

    const db = t.deps.db;
    const { branch, category } = await basics(company.id!);
    const [party] = await db
      .insert(schema.parties)
      .values({ id: 'pty_t1', companyId: company.id!, kind: 'customer', name: 'Sunrise', code: 'C-001', currency: 'INR', billingLine1: 'x', billingCity: 'Mumbai', billingState: 'Maharashtra', billingPostalCode: '400001', billingCountry: 'IN' })
      .returning();
    const pay = { companyId: company.id!, branchId: branch.id, partyId: party.id, date: '2026-09-01', currency: 'INR', method: 'bank' as const, accountId: bank.body.id, createdBy: user.id! };
    await db.insert(schema.payments).values([
      { ...pay, id: 'pay_1', number: 'PAY-1', direction: 'received', amountMinor: 50000 },
      { ...pay, id: 'pay_2', number: 'PAY-2', direction: 'paid', amountMinor: 20000 },
    ]);
    await db.insert(schema.expenses).values({
      id: 'exp_1', companyId: company.id!, branchId: branch.id, number: 'EXP-1', categoryId: category.id, date: '2026-09-02',
      amountMinor: 5000, currency: 'INR', accountId: bank.body.id, method: 'bank', createdBy: user.id!,
    });
    const after = await t.get(`${c}/payment-accounts`, { token });
    const hdfc = after.body.data.find((a: { id: string }) => a.id === bank.body.id);
    expect(hdfc.currentBalance).toEqual({ minor: 125000, currency: 'INR' });

    const unset = await t.put(`${c}/payment-accounts/${bank.body.id}`, { ...bank.body, isDefault: false }, { token });
    expect(unset.status).toBe(422);

    const inUse = await t.del(`${c}/payment-accounts/${bank.body.id}`, { token });
    expect(inUse.status).toBe(409);
    expect(inUse.body.code).toBe('PAYMENT_ACCOUNT_IN_USE');
  });

  it('hands the default on when the default account is deleted', async () => {
    const { token, c } = await ownerWithCompany(t);
    const [cash] = (await t.get(`${c}/payment-accounts`, { token })).body.data;
    const upi = await t.post(`${c}/payment-accounts`, { name: 'UPI', type: 'wallet', currency: 'INR', openingBalance: { minor: 0, currency: 'INR' } }, { token });
    expect(upi.body.isDefault).toBe(false);
    expect((await t.del(`${c}/payment-accounts/${cash.id}`, { token })).status).toBe(204);
    const list = await t.get(`${c}/payment-accounts`, { token });
    expect(list.body.data).toEqual([expect.objectContaining({ id: upi.body.id, isDefault: true })]);

    const wrong = await t.post(`${c}/payment-accounts`, { name: 'USD', type: 'bank', currency: 'USD', openingBalance: { minor: 5, currency: 'INR' } }, { token });
    expect(wrong.status).toBe(422);
    expect(wrong.body.issues[0].field).toBe('openingBalance.currency');
  });
});

describe('exchange rates', () => {
  it('manages manual rates on the full plan', async () => {
    const free = await ownerWithCompany(t);
    expect((await t.get(`${free.c}/exchange-rates`, { token: free.token })).status).toBe(403);

    const { token, c } = await ownerWithCompany(t, { plan: 'pro' });
    const created = await t.post(`${c}/exchange-rates`, { from: 'USD', to: 'INR', rate: 83.1, effectiveFrom: '2026-09-01' }, { token });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ from: 'USD', to: 'INR', rate: 83.1, source: 'manual' });
    const dupe = await t.post(`${c}/exchange-rates`, { from: 'USD', to: 'INR', rate: 84, effectiveFrom: '2026-09-01' }, { token });
    expect(dupe.body.code).toBe('EXCHANGE_RATE_EXISTS');
    const same = await t.post(`${c}/exchange-rates`, { from: 'INR', to: 'INR', rate: 1, effectiveFrom: '2026-09-01' }, { token });
    expect(same.status).toBe(422);

    const saved = await t.put(`${c}/exchange-rates/${created.body.id}`, { from: 'USD', to: 'INR', rate: 83.25, effectiveFrom: '2026-09-01' }, { token });
    expect(saved.body.rate).toBe(83.25);
    expect((await t.del(`${c}/exchange-rates/${created.body.id}`, { token })).status).toBe(204);
    expect((await t.get(`${c}/exchange-rates`, { token })).body.data).toEqual([]);
  });

  it('refreshes rates from the provider for currencies in use', async () => {
    const { token, c, company } = await ownerWithCompany(t, { plan: 'pro' });
    t.setNow('2026-09-29T10:00:00Z');
    expect((await t.post(`${c}/exchange-rates/refresh`, {}, { token })).body.data).toEqual([]);

    await t.deps.db.insert(schema.parties).values({
      id: 'pty_ae', companyId: company.id!, kind: 'customer', name: 'Harbour Supplies', code: 'C-001', currency: 'AED',
      billingLine1: 'Jebel Ali', billingCity: 'Dubai', billingState: 'Dubai', billingPostalCode: '17000', billingCountry: 'AE',
    });
    await t.post(`${c}/exchange-rates`, { from: 'USD', to: 'INR', rate: 80, effectiveFrom: '2026-01-01' }, { token });

    const first = await t.post(`${c}/exchange-rates/refresh`, {}, { token });
    expect(first.status).toBe(200);
    expect(first.body.data.map((r: { from: string; to: string; rate: number; source: string; effectiveFrom: string }) => [r.from, r.to, r.rate, r.source, r.effectiveFrom])).toEqual([
      ['AED', 'INR', 22.73, 'provider', '2026-09-29'],
      ['USD', 'INR', 83.5, 'provider', '2026-09-29'],
    ]);
    // Running it again the same day updates today's rows rather than adding more.
    await t.post(`${c}/exchange-rates/refresh`, {}, { token });
    const rows = await t.deps.db.select().from(schema.exchangeRates).where(and(eq(schema.exchangeRates.companyId, company.id!), eq(schema.exchangeRates.effectiveFrom, '2026-09-29')));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.version === 2)).toBe(true);
  });
});

describe('transporters', () => {
  it('validates the transporter id and keeps it unique', async () => {
    const { token, c } = await ownerWithCompany(t);
    const bad = await t.post(`${c}/transporters`, { name: 'Konkan', transporterId: '27AABCT5512M1Z7' }, { token });
    expect(bad.status).toBe(422);
    expect(bad.body.issues[0].field).toBe('transporterId');

    const ok = await t.post(`${c}/transporters`, { name: 'Konkan Roadlines', transporterId: '27aabct5512m1z6', phone: '+91 22 2771 4410' }, { token });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ transporterId: '27AABCT5512M1Z6', status: 'active' });
    const dupe = await t.post(`${c}/transporters`, { name: 'Again', transporterId: '27AABCT5512M1Z6' }, { token });
    expect(dupe.body.code).toBe('TRANSPORTER_EXISTS');

    const saved = await t.put(`${c}/transporters/${ok.body.id}`, { name: 'Konkan Roadlines', transporterId: '27AABCT5512M1Z6', status: 'inactive' }, { token });
    expect(saved.body.status).toBe('inactive');
    expect(saved.body.phone).toBeUndefined();
    expect((await t.del(`${c}/transporters/${ok.body.id}`, { token })).status).toBe(204);
    expect((await t.get(`${c}/transporters`, { token })).body.data).toEqual([]);
  });
});

describe('numbering series', () => {
  it('lists every kind, only moves forward, and previews with the branch code', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const list = await t.get(`${c}/numbering-series`, { token });
    expect(list.body.data).toHaveLength(11);
    const inv = list.body.data.find((s: { kind: string }) => s.kind === 'invoice');
    expect(inv).toMatchObject({ prefix: 'INV', nextNumber: 1, includeFiscalYear: true });

    const url = `${c}/numbering-series/${inv.id}`;
    const forward = await t.put(url, { ...inv, nextNumber: 42, includeBranchCode: true }, { token });
    expect(forward.status).toBe(200);
    expect(forward.body.nextNumber).toBe(42);
    const back = await t.put(url, { ...inv, nextNumber: 41 }, { token });
    expect(back.status).toBe(422);
    expect(back.body.code).toBe('NUMBER_REUSE');
    const kind = await t.put(url, { ...inv, kind: 'quote', nextNumber: 42 }, { token });
    expect(kind.status).toBe(422);

    const [branch] = await t.deps.db.select().from(schema.branches).where(eq(schema.branches.companyId, company.id!));
    const preview = await t.get(`${url}/preview`, { token, query: { date: '2026-09-29', branchId: branch.id } });
    expect(preview.body.number).toBe(`INV/${branch.code}/26-27/0042`);
    const march = await t.get(`${url}/preview`, { token, query: { date: '2026-03-15' } });
    expect(march.body.number).toBe(`INV/${branch.code}/25-26/0042`);
    expect((await t.get(`${url}/preview`, { token, query: { branchId: 'brn_nope' } })).status).toBe(404);
  });

  it('is saved by owners and admins only', async () => {
    const { token, c, user } = await ownerWithCompany(t);
    const [series] = (await t.get(`${c}/numbering-series`, { token })).body.data;
    await t.deps.db.update(schema.users).set({ role: 'accountant' }).where(eq(schema.users.id, user.id!));
    const res = await t.put(`${c}/numbering-series/${series.id}`, { ...series, nextNumber: 5 }, { token });
    expect(res.status).toBe(403);
  });
});
