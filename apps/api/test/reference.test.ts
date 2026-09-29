import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedParties } from '@esmart/core/data/seed';
import { gstinChecksum } from '@esmart/core/domain/gstin';
import { schema } from '@esmart/db';
import { ownerWithCompany, setupApi } from './helpers';

const t = setupApi();

const withCheck = (first14: string) => first14 + gstinChecksum(first14);

describe('reference data', () => {
  it('lists countries, states and currencies without signing in', async () => {
    const countries = await t.get('/reference/countries');
    expect(countries.status).toBe(200);
    expect(countries.body.data).toContainEqual({ code: 'IN', name: 'India', currency: 'INR', taxRegime: 'GST', taxIdLabel: 'GSTIN' });

    const states = await t.get('/reference/states', { query: { country: 'IN' } });
    expect(states.body.data).toContainEqual({ code: '27', name: 'Maharashtra' });

    const currencies = await t.get('/reference/currencies');
    expect(currencies.body.data).toContainEqual(expect.objectContaining({ code: 'INR', precision: 2 }));
  });

  it('searches cities by state and prefix', async () => {
    const res = await t.get('/reference/cities', { query: { state: '27', q: 'pun' } });
    expect(res.body.data[0]).toEqual({ name: 'Pune', state: 'Maharashtra', stateCode: '27' });
    const byName = await t.get('/reference/cities', { query: { state: 'karnataka', q: 'beng' } });
    expect(byName.body.data.map((c: { name: string }) => c.name)).toContain('Bengaluru');
  });

  it('looks up PIN codes from the directory, then the provider', async () => {
    await t.deps.db.insert(schema.pincodes).values({ pincode: '411026', city: 'Pimpri-Chinchwad', stateCode: '27' }).onConflictDoNothing();
    const fromTable = await t.get('/reference/pincodes/411026');
    expect(fromTable.body).toEqual({ pincode: '411026', city: 'Pimpri-Chinchwad', state: 'Maharashtra', stateCode: '27' });
    await t.deps.db.delete(schema.pincodes).where(eq(schema.pincodes.pincode, '411026'));

    const simulated = await t.get('/reference/pincodes/560001');
    expect(simulated.body).toEqual({ pincode: '560001', city: 'Bengaluru', state: 'Karnataka', stateCode: '29' });
    expect((await t.get('/reference/pincodes/999999')).status).toBe(404);
  });

  it('estimates road distance deterministically, symmetric and capped', async () => {
    const { token } = await ownerWithCompany(t);
    const d = (a: string, b: string) => t.get('/reference/distance', { token, query: { fromPincode: a, toPincode: b } });
    const mumBlr = await d('400001', '560001');
    expect(mumBlr.body.source).toBe('ewb-portal');
    expect(mumBlr.body.distanceKm).toBeGreaterThan(800);
    expect(mumBlr.body.distanceKm).toBeLessThan(1400);
    expect((await d('560001', '400001')).body.distanceKm).toBe(mumBlr.body.distanceKm);
    expect((await d('400001', '400001')).body.distanceKm).toBe(8);
    const local = (await d('400001', '400050')).body.distanceKm;
    const regional = (await d('400001', '411026')).body.distanceKm;
    expect(local).toBeLessThan(regional);
    expect((await d('190001', '682555')).body.distanceKm).toBeLessThanOrEqual(4000);
    expect((await d('012345', '400001')).status).toBe(422);
  });

  it('searches HSN codes by prefix and by words', async () => {
    const { token } = await ownerWithCompany(t);
    const byCode = await t.get('/reference/hsn', { token, query: { q: '8482' } });
    // hsn_codes isn't truncated between tests, and the catalog adds codes to it.
    expect(byCode.body.data).toContainEqual({ code: '84821011', description: 'Ball bearings', kind: 'HSN', gstRate: 18 });
    expect(byCode.body.data.every((h: { code: string }) => h.code.startsWith('8482'))).toBe(true);
    const byText = await t.get('/reference/hsn', { token, query: { q: 'consult' } });
    expect(byText.body.data.map((h: { code: string; kind: string }) => [h.code, h.kind])).toEqual(expect.arrayContaining([
      ['998311', 'SAC'],
      ['998313', 'SAC'],
    ]));
  });
});

describe('GSTIN lookup', () => {
  it('answers seed GSTINs with their names and caches the result', async () => {
    const { token } = await ownerWithCompany(t);
    const seeded = seedParties().find((p) => p.taxId && p.kind === 'supplier')!;
    const res = await t.get(`/reference/gstin/${seeded.taxId}`, { token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ gstin: seeded.taxId, legalName: seeded.name, status: 'Active', registrationType: 'regular' });
    expect(res.body.address.stateCode).toBe(seeded.taxId!.slice(0, 2));

    const [cached] = await t.deps.db.select().from(schema.gstinLookups).where(eq(schema.gstinLookups.gstin, seeded.taxId!));
    expect(cached.legalName).toBe(seeded.name);
    // A cached answer is served as is, even if the portal would say otherwise now.
    await t.deps.db.update(schema.gstinLookups).set({ legalName: 'From cache' }).where(eq(schema.gstinLookups.gstin, seeded.taxId!));
    expect((await t.get(`/reference/gstin/${seeded.taxId}`, { token })).body.legalName).toBe('From cache');
    t.setNow(new Date(Date.now() + 8 * 24 * 3_600_000));
    expect((await t.get(`/reference/gstin/${seeded.taxId}`, { token })).body.legalName).toBe(seeded.name);
  });

  it('makes up a stable registration in the GSTIN state for unknown ones', async () => {
    const { token } = await ownerWithCompany(t);
    const gstin = withCheck('33AAACZ9876K1Z');
    const a = await t.get(`/reference/gstin/${gstin}`, { token });
    expect(a.body.legalName).toMatch(/Private Limited$/);
    expect(a.body.address).toMatchObject({ state: 'Tamil Nadu', stateCode: '33', city: 'Chennai' });
    expect(a.body.registeredOn).toMatch(/^20\d\d-\d\d-\d\d$/);
    await t.deps.db.delete(schema.gstinLookups);
    expect((await t.get(`/reference/gstin/${gstin}`, { token })).body).toEqual(a.body);
  });

  it('rejects a bad check digit and 404s an unregistered GSTIN', async () => {
    const { token } = await ownerWithCompany(t);
    const bad = await t.get('/reference/gstin/27AAPFU0939F1ZX', { token });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('INVALID_GSTIN');
    expect((await t.get(`/reference/gstin/${withCheck('27AAPFU0939F0Z')}`, { token })).status).toBe(404);
    expect((await t.get(`/reference/gstin/${withCheck('27AAPFU0939F1Z')}`)).status).toBe(401);
  });
});
