import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDb, createScopedPool, schema } from '@esmart/db';
import { withCompanies } from '../src/lib/dbScope';
import { setupApi } from './helpers';
import { issueInvoice, moneySetup } from './money-fixtures';

/**
 * Row-level security (migration 0061, docs/database/rls.md): the request role sees and writes only
 * the companies of its scope, whatever a query forgets to filter.
 */
const t = setupApi();

/**
 * Tables outside row-level security, on purpose: identity and sessions (keyed by user or account),
 * the job queue, platform records and reference data. A new table must be added here or get a
 * policy; this test fails until it does.
 */
const GLOBAL = new Set([
  'accounts',
  'users',
  'device_sessions',
  'otp_requests',
  'password_reset_tokens',
  'push_tokens',
  'invites',
  'idempotency_keys',
  'client_id_mappings',
  'plans',
  'plan_modules',
  'integrations',
  'jobs',
  'job_schedule_runs',
  'webhook_events',
  'platform_audit_events',
  'currencies',
  'countries',
  'states',
  'cities',
  'pincodes',
  'units',
  'hsn_codes',
  'gstin_lookups',
]);

/** Drizzle wraps the Postgres error; the policy violation is its cause. */
async function refusedByPolicy(write: PromiseLike<unknown>) {
  const err = await Promise.resolve(write).then(
    () => null,
    (e: Error & { cause?: Error }) => e,
  );
  expect(err, 'the write went through').not.toBeNull();
  expect(String(err!.cause?.message ?? err!.message)).toMatch(/row-level security/);
}

async function twoBusinesses() {
  const a = await moneySetup(t);
  const b = await moneySetup(t);
  await issueInvoice(t, a);
  await issueInvoice(t, b);
  return { a, b };
}

/** Tables with a company_id column, as the database has them. */
async function companyTables(): Promise<string[]> {
  const { rows } = await t.deps.pool.query<{ table_name: string }>(
    `select c.table_name from information_schema.columns c
       join information_schema.tables x using (table_schema, table_name)
      where c.table_schema = 'public' and x.table_type = 'BASE TABLE' and c.column_name = 'company_id'
      order by 1`,
  );
  return rows.map((r) => r.table_name);
}

describe('row-level security', () => {
  it('covers every table that is not global: enabled, forced and with a policy', async () => {
    const { rows } = await t.deps.pool.query<{ relname: string; on: boolean; forced: boolean; policies: number }>(
      `select c.relname, c.relrowsecurity as on, c.relforcerowsecurity as forced,
              (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
         from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'`,
    );
    const missing = rows.filter((r) => !GLOBAL.has(r.relname) && !(r.on && r.forced && r.policies > 0)).map((r) => r.relname);
    expect(missing, 'tables with company data but no row-level security').toEqual([]);
    const needless = rows.filter((r) => GLOBAL.has(r.relname) && r.on).map((r) => r.relname);
    expect(needless, 'tables listed as global that now have a policy').toEqual([]);
  });

  it('the app runs as a role that row-level security applies to', async () => {
    const { rows } = await t.appDeps.pool.query<{ bypass: boolean; user: string }>('select current_user as user, rolsuper or rolbypassrls as bypass from pg_roles where rolname = current_user');
    expect(rows[0]).toEqual({ user: 'esmart_app', bypass: false });
  });

  it('a query scoped to one business sees none of another, even without a filter', async () => {
    const { a, b } = await twoBusinesses();
    const tables = await companyTables();
    const db = t.appDeps.db;
    await withCompanies([a.companyId], async () => {
      for (const table of tables) {
        const [{ others }] = (await db.execute<{ others: number }>(sql`select count(*)::int as others from ${sql.identifier(table)} where company_id <> ${a.companyId}`)).rows;
        expect(others, `${table}: rows of another business`).toBe(0);
      }
      // No company filter at all, as a buggy query would be written.
      const docs = await db.select({ companyId: schema.documents.companyId }).from(schema.documents);
      expect(docs.length).toBeGreaterThan(0);
      expect(new Set(docs.map((d) => d.companyId))).toEqual(new Set([a.companyId]));
      const companies = await db.select({ id: schema.companies.id }).from(schema.companies);
      expect(companies.map((c) => c.id)).toEqual([a.companyId]);
      // Rows without a company_id follow their parent.
      const lines = await db.select({ documentId: schema.documentLines.documentId }).from(schema.documentLines);
      const ownDocs = await t.deps.db.select({ id: schema.documents.id }).from(schema.documents).where(eq(schema.documents.companyId, a.companyId));
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.every((l) => ownDocs.some((d) => d.id === l.documentId))).toBe(true);
    });
    // The owner (the tests' own access) still sees both.
    const all = await t.deps.db.select({ companyId: schema.documents.companyId }).from(schema.documents);
    expect(new Set(all.map((d) => d.companyId))).toEqual(new Set([a.companyId, b.companyId]));
  });

  it("refuses to write into another business's rows", async () => {
    const { a, b } = await twoBusinesses();
    const db = t.appDeps.db;
    await withCompanies([a.companyId], async () => {
      await refusedByPolicy(db.insert(schema.brands).values({ id: 'brd_rls_test', companyId: b.companyId, name: 'Not yours' }));
      // Updates and deletes of the other business match no rows.
      const updated = await db.update(schema.parties).set({ name: 'Taken over' }).where(eq(schema.parties.companyId, b.companyId)).returning({ id: schema.parties.id });
      expect(updated).toEqual([]);
      const deleted = await db.delete(schema.items).where(eq(schema.items.companyId, b.companyId)).returning({ id: schema.items.id });
      expect(deleted).toEqual([]);
      // Nor can a business's own row be moved into another.
      await refusedByPolicy(db.update(schema.parties).set({ companyId: b.companyId }).where(eq(schema.parties.id, a.mumbai.id)));
    });
    const [party] = await t.deps.db.select().from(schema.parties).where(eq(schema.parties.id, b.mumbai.id));
    expect(party?.name).toBe('Sunrise Retail');
  });

  it('sees no business at all outside a scope', async () => {
    await twoBusinesses();
    expect(await t.appDeps.db.select({ id: schema.companies.id }).from(schema.companies)).toEqual([]);
    expect(await t.appDeps.db.select({ id: schema.documents.id }).from(schema.documents)).toEqual([]);
  });

  it("a pooled connection never keeps the last request's businesses", async () => {
    const { a, b } = await twoBusinesses();
    // One connection, so every query reuses it.
    let scoped: string[] | undefined;
    const pool = createScopedPool(t.appDeps.config.DATABASE_URL, () => scoped, 1);
    const db = createDb(pool);
    try {
      scoped = [a.companyId];
      expect((await db.select({ id: schema.companies.id }).from(schema.companies)).map((c) => c.id)).toEqual([a.companyId]);
      scoped = undefined;
      expect(await db.select({ id: schema.companies.id }).from(schema.companies)).toEqual([]);
      scoped = [b.companyId];
      await db.transaction(async (tx) => {
        expect((await tx.select({ id: schema.companies.id }).from(schema.companies)).map((c) => c.id)).toEqual([b.companyId]);
      });
      scoped = [a.companyId, b.companyId];
      expect((await db.select({ id: schema.companies.id }).from(schema.companies)).map((c) => c.id).sort()).toEqual([a.companyId, b.companyId].sort());
    } finally {
      await pool.end();
    }
  });

  it('through the API, one business still cannot open another', async () => {
    const { a, b } = await twoBusinesses();
    const res = await t.get(`/companies/${b.companyId}/documents`, { token: a.token });
    expect(res.status).toBe(403);
    const own = await t.get(`/companies/${a.companyId}/documents`, { token: a.token });
    expect(own.status).toBe(200);
  });
});
