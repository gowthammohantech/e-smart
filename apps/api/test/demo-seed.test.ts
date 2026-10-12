import { afterAll, describe, expect, it } from 'vitest';
import { isValidGstin } from '@esmart/core/domain/gstin';
import { GSTIN_RE } from '@esmart/core/lib/validators';
import { createDb, createPool } from '@esmart/db';
import { ACCOUNT_ID, buildDemoData, seedCompanies, seedItems, seedParties } from '@esmart/db/demo';
import { demoAccountConfig, seedDemo, seedDemoFromEnv } from '@esmart/db/seed';

/* ------------------------------------------------------------------ */
/* The demo data has to satisfy the same rules as real books           */
/* ------------------------------------------------------------------ */

describe('demo dataset', () => {
  it('gives every company and registered party a GSTIN that passes its check digit', () => {
    // The demo book is what people try e-invoicing on; a GSTIN that fails its
    // own check digit would be rejected before it ever reached the portal.
    const gstins = [...seedCompanies().map((c) => c.taxRegistration?.identifier), ...seedParties().map((p) => p.taxId)].filter((g): g is string => Boolean(g));
    expect(gstins.length).toBeGreaterThan(0);
    expect(gstins.filter((g) => !isValidGstin(g) || !GSTIN_RE.test(g) || g.length !== 15)).toEqual([]);
  });

  it('bills services in Nos, as the unit picker does', () => {
    expect(seedItems().filter((i) => i.type === 'service').every((i) => i.unit === 'NOS')).toBe(true);
  });

  it('leaves some parties unregistered, so the B2C path is exercised', () => {
    expect(seedParties().some((p) => !p.taxId)).toBe(true);
  });
});

describe('demo account config', () => {
  it('needs a password, and a strong one in production', () => {
    expect(() => demoAccountConfig({})).toThrow(/DEMO_ACCOUNT_PASSWORD must be set/);
    expect(demoAccountConfig({ DEMO_ACCOUNT_PASSWORD: 'demo1234' })).toEqual({ email: 'gowtham@vertextraders.in', password: 'demo1234' });
    expect(() => demoAccountConfig({ NODE_ENV: 'production', DEMO_ACCOUNT_PASSWORD: 'demo1234' })).toThrow(/development password/);
    expect(() => demoAccountConfig({ NODE_ENV: 'production', DEMO_ACCOUNT_PASSWORD: 'eleven-char' })).toThrow(/at least 12/);
    expect(demoAccountConfig({ NODE_ENV: 'production', DEMO_ACCOUNT_PASSWORD: 'a-long-demo-pass', DEMO_ACCOUNT_EMAIL: 'demo@example.in' }).email).toBe('demo@example.in');
    expect(() => demoAccountConfig({ DEMO_ACCOUNT_PASSWORD: 'x', DEMO_ACCOUNT_EMAIL: 'not-an-email' })).toThrow(/DEMO_ACCOUNT_EMAIL/);
  });
});

describe('demo seed', () => {
  const pool = createPool(process.env.TEST_DATABASE_URL!, 2);
  const db = createDb(pool);
  const count = async (q: string) => Number((await pool.query<{ n: string }>(q)).rows[0].n);
  // Other files truncate before each test, so the demo rows don't leak into them.
  afterAll(() => pool.end());

  it('does nothing unless SEED_DEMO_ACCOUNT is on', async () => {
    expect(await seedDemoFromEnv(db, { env: { DEMO_ACCOUNT_PASSWORD: 'demo1234' } })).toMatch(/not seeded/);
    expect(await count(`select count(*) n from accounts where id = '${ACCOUNT_ID}'`)).toBe(0);
  });

  it('writes the account once, skips it after, and rebuilds it on reset', async () => {
    const env = { SEED_DEMO_ACCOUNT: 'true', DEMO_ACCOUNT_PASSWORD: 'demo1234', DEMO_ACCOUNT_EMAIL: 'demo-seed@example.in' };
    expect(await seedDemoFromEnv(db, { env })).toMatch(/Demo account loaded/);
    const expected = buildDemoData();
    const docs = `select count(*) n from documents where company_id in (select id from companies where account_id = '${ACCOUNT_ID}')`;
    expect(await count(`select count(*) n from companies where account_id = '${ACCOUNT_ID}'`)).toBe(expected.companies.length);
    expect(await count(docs)).toBe(expected.documents.length);
    expect((await pool.query(`select email from users where id = 'usr_owner'`)).rows[0].email).toBe('demo-seed@example.in');
    // No fake rows: no sessions nobody holds, and no backup that never ran.
    expect(await count(`select count(*) n from device_sessions where user_id in (select id from users where account_id = '${ACCOUNT_ID}')`)).toBe(0);
    expect(await count(`select count(*) n from backup_settings where last_backup_at is not null and company_id in ('cmp_vertex', 'cmp_aurora')`)).toBe(0);

    expect(await seedDemoFromEnv(db, { env })).toMatch(/already exists/);
    expect(await count(docs)).toBe(expected.documents.length);

    await pool.query(`update companies set name = 'Renamed' where id = 'cmp_vertex'`);
    expect(await seedDemo(db, demoAccountConfig(env), { reset: true })).not.toBeNull();
    expect(await count(docs)).toBe(expected.documents.length);
    expect((await pool.query(`select name from companies where id = 'cmp_vertex'`)).rows[0].name).toBe('Vertex Traders');
  });
});
