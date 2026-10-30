import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { MUMBAI, ownerWithCompany, setupApi } from './helpers';

const t = setupApi();

const customer = (name = 'Sunrise') => ({ kind: 'customer', name, currency: 'INR', billingAddress: MUMBAI, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 30 });

async function book() {
  t.setNow('2026-09-29T10:00:00Z');
  const o = await ownerWithCompany(t);
  const taxes = await t.deps.db.select().from(schema.taxCategories).where(eq(schema.taxCategories.companyId, o.company.id!));
  const tax = taxes.find((x) => Number(x.rate) === 18)!;
  const party = (await t.post(`${o.c}/parties`, customer(), { token: o.token })).body;
  const invoice = async (quantity = 2, status = 'issued', date = '2026-09-20') =>
    (await t.post(`${o.c}/documents`, { kind: 'invoice', status, partyId: party.id, date, currency: 'INR', lines: [{ name: 'Rod', quantity, unit: 'NOS', unitPrice: { minor: 10000, currency: 'INR' }, taxCategoryId: tax.id }] }, { token: o.token }));
  const convert = async (id: string) => (await t.post(`${o.c}/documents/${id}/convert`, { targetKind: 'salesReturn' }, { token: o.token })).body;
  const finalize = (id: string) => t.post(`${o.c}/documents/${id}/finalize`, {}, { token: o.token });
  const get = async (id: string) => (await t.get(`${o.c}/documents/${id}`, { token: o.token })).body;
  return { ...o, tax, party, invoice, convert, finalize, get };
}

describe('credit notes', () => {
  it('C1: a finalised return reduces what the invoice still owes, and cancelling it restores that', async () => {
    const b = await book();
    const inv = (await b.invoice()).body;
    const ret = await b.convert(inv.id);
    expect((await b.finalize(ret.id)).status).toBe(200);
    const after = await b.get(inv.id);
    expect(after.status).toBe('paid');

    const issued = await b.get(ret.id);
    expect(issued.status).toBe('approved');
    expect((await t.post(`${b.c}/documents/${ret.id}/status`, { status: 'cancelled' }, { token: b.token })).status).toBe(200);
    expect((await b.get(inv.id)).status).toBe('issued');
  });

  it('C3: returns cannot add up to more than was sold', async () => {
    const b = await book();
    const inv = (await b.invoice()).body;
    const first = await b.convert(inv.id);
    expect((await b.finalize(first.id)).status).toBe(200);
    const second = await b.convert(inv.id);
    const res = await b.finalize(second.id);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('RETURN_EXCEEDS_SOURCE');
  });

  it('C3: an invoice with a live return cannot be cancelled', async () => {
    const b = await book();
    const inv = (await b.invoice()).body;
    const ret = await b.convert(inv.id);
    await b.finalize(ret.id);
    const res = await t.post(`${b.c}/documents/${inv.id}/status`, { status: 'cancelled' }, { token: b.token });
    expect(res.body.code).toBe('DOCUMENT_HAS_RETURNS');
  });

  it('C2: a return keeps the rate charged, after the category changes', async () => {
    const b = await book();
    const inv = (await b.invoice()).body;
    await t.deps.db.update(schema.taxCategories).set({ rate: '28' }).where(eq(schema.taxCategories.id, b.tax.id));
    const ret = await b.convert(inv.id);
    await b.finalize(ret.id);
    expect((await b.get(ret.id)).totals.totalTax.minor).toBe(inv.totals.totalTax.minor);
  });
});

describe('rates', () => {
  it('C2: a document dated before a rate change charges the rate then', async () => {
    const b = await book();
    const cat = (await t.get(`${b.c}/tax-categories`, { token: b.token })).body.data.find((x: { id: string }) => x.id === b.tax.id);
    const save = await t.put(`${b.c}/tax-categories/${b.tax.id}`, { ...cat, rate: 28, effectiveFrom: '2026-09-25' }, { token: b.token });
    expect(save.status).toBe(200);
    const old = (await b.invoice(1, 'issued', '2026-09-20')).body;
    const now = (await b.invoice(1, 'issued', '2026-09-28')).body;
    expect(old.lines[0].taxRate).toBe(18);
    expect(now.lines[0].taxRate).toBe(28);
  });
});

describe('numbering', () => {
  it('C4: an old-year document leaves the current sequence alone', async () => {
    const b = await book();
    const first = (await b.invoice(1, 'issued', '2026-09-20')).body;
    expect(first.number).toBe('INV/26-27/0001');
    t.setNow('2027-05-02T10:00:00Z');
    const fresh = (await b.invoice(1, 'issued', '2027-05-01')).body;
    expect(fresh.number).toBe('INV/27-28/0001');
    const late = (await b.invoice(1, 'issued', '2027-03-20')).body;
    expect(late.number).toBe('INV/26-27/0002');
    const next = (await b.invoice(1, 'issued', '2027-05-02')).body;
    expect(next.number).toBe('INV/27-28/0002');
  });

  it('C10: refuses a series whose numbers would be too long for a tax invoice', async () => {
    const b = await book();
    const [s] = await t.deps.db.select().from(schema.numberingSeries).where(and(eq(schema.numberingSeries.companyId, b.company.id!), eq(schema.numberingSeries.kind, 'invoice')));
    const res = await t.put(`${b.c}/numbering-series/${s.id}`, { prefix: 'LONGPREFIX', nextNumber: 1, padding: 6, includeFiscalYear: true }, { token: b.token });
    expect(res.status).toBe(422);
  });
});

describe('periods and dates', () => {
  it('C5: closed books refuse finalising and cancelling, until an owner reopens them', async () => {
    const b = await book();
    const inv = (await b.invoice(1, 'issued', '2026-09-20')).body;
    const draft = (await b.invoice(1, 'draft', '2026-09-21')).body;
    await t.deps.db.update(schema.companies).set({ lockedThroughDate: '2026-09-30' }).where(eq(schema.companies.id, b.company.id!));

    expect((await b.finalize(draft.id)).body.code).toBe('PERIOD_LOCKED');
    expect((await t.post(`${b.c}/documents/${inv.id}/status`, { status: 'cancelled' }, { token: b.token })).body.code).toBe('PERIOD_LOCKED');

    await t.deps.db.update(schema.companies).set({ lockedThroughDate: null }).where(eq(schema.companies.id, b.company.id!));
    expect((await b.finalize(draft.id)).status).toBe(200);
  });

  it('C5: a tax document cannot be dated in the future', async () => {
    const b = await book();
    const res = await b.invoice(1, 'issued', '2026-10-05');
    expect(res.body.code).toBe('DOCUMENT_DATED_IN_FUTURE');
  });

  it('C9: the business date is IST: at 20:00 UTC it is already tomorrow', async () => {
    const b = await book();
    t.setNow('2026-09-29T20:00:00Z');
    expect((await b.invoice(1, 'issued', '2026-09-30')).status).toBe(201);
    const inv = (await b.invoice(1, 'draft', '2026-09-30')).body;
    expect(inv.date).toBe('2026-09-30');
  });
});

describe('plan cap', () => {
  async function atLimit() {
    const b = await book();
    await t.deps.db.update(schema.companies).set({ plan: 'free' }).where(eq(schema.companies.id, b.company.id!));
    for (let i = 0; i < 20; i++) expect((await b.invoice(1)).status).toBe(201);
    return b;
  }

  it('C8: refuses the 21st invoice of the month on the free plan', async () => {
    const b = await atLimit();
    const res = await b.invoice(1);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('C8: lets through one that had been waiting in an offline queue', async () => {
    const b = await atLimit();
    const body = { kind: 'invoice', status: 'issued', partyId: b.party.id, date: '2026-09-20', currency: 'INR', lines: [{ name: 'Rod', quantity: 1, unit: 'NOS', unitPrice: { minor: 10000, currency: 'INR' }, taxCategoryId: b.tax.id }] };
    const res = await t.post('/sync/push', { mutations: [{ id: randomUUID(), method: 'POST', path: `${b.c}/documents`, body, queuedAt: '2026-09-29T08:00:00Z' }] }, { token: b.token });
    expect(res.body.results[0].status).toBe('applied');
    const fresh = await t.post('/sync/push', { mutations: [{ id: randomUUID(), method: 'POST', path: `${b.c}/documents`, body, queuedAt: '2026-09-29T09:59:00Z' }] }, { token: b.token });
    expect(fresh.body.results[0].error.code).toBe('PLAN_LIMIT_REACHED');
  });
});
