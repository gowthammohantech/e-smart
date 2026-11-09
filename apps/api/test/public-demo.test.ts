import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { BUSINESS_TYPES } from '@esmart/core/data/masters';
import { addDaysISO, businessDate } from '@esmart/core/lib/date';
import { ensurePublicDemo } from '../src/demo/seed';
import { issueRecurringInvoices } from '../src/modules/documents/recurring';
import { materializeRecurringExpenses } from '../src/modules/expenses/engine';
import { loadOperations } from '../src/openapi/spec';
import { setupApi, signUpOwner } from './helpers';

const t = setupApi();
const ON = { DEMO_ENABLED: 'true', DEMO_EMAIL: 'demo@elixir-books.com', DEMO_PASSWORD: 'TryElixirBooks@2026' };
const quiet = { info: () => {}, warn: () => {}, error: (o: unknown) => console.error(o) };
const build = (env: Record<string, string> = ON, force = false) => ensurePublicDemo(t.deps, quiet, { env, force });

async function signInDemo() {
  const creds = await t.get('/auth/demo');
  expect(creds.status).toBe(200);
  const res = await t.post('/auth/sign-in', creds.body);
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

/** Each module's list, and how to count what came back. */
const MODULE_LISTS: [string, (b: any) => number, Record<string, string>?][] = [
  ['/branches', (b) => b.data.length],
  ['/parties', (b) => b.data.length],
  ['/items', (b) => b.data.length],
  ['/item-categories', (b) => b.data.length],
  ['/custom-fields', (b) => b.data.length],
  ['/documents', (b) => b.data.length, { kind: 'invoice' }],
  ['/documents', (b) => b.data.length, { kind: 'quote' }],
  ['/documents', (b) => b.data.length, { kind: 'creditNote' }],
  ['/documents', (b) => b.data.length, { kind: 'openingInvoice' }],
  ['/payments', (b) => b.data.length],
  ['/payment-requests', (b) => b.data.length],
  ['/approvals', (b) => b.data.length],
  ['/expenses', (b) => b.data.length],
  ['/ledger-accounts', (b) => b.data.length],
  ['/vouchers', (b) => b.data.length],
  ['/voucher-templates', (b) => b.data.length],
  ['/cost-centres', (b) => b.data.length],
  ['/fixed-assets', (b) => b.data.length],
  ['/budgets', (b) => b.data.length],
  ['/notifications', (b) => b.data.length],
  ['/audit-events', (b) => b.data.length],
];

describe('public demo account', () => {
  it('builds every business type on Business with branches and data in every module, books that balance, and is read-only', { timeout: 600_000 }, async () => {
    // The suites run with the demo off (global-setup); this one turns it on for the API as well.
    process.env.DEMO_ENABLED = 'true';
    // Someone else's account, to prove the demo never touches it.
    const other = await signUpOwner(t);

    expect(await build()).toBe('built');
    expect(await build()).toBe('current');

    const token = await signInDemo();
    const me = await t.get('/me', { token });
    expect(me.body.demo).toBe(true);
    expect(me.body.companies.map((c: { businessType: string }) => c.businessType).sort()).toEqual([...BUSINESS_TYPES].sort());

    for (const company of me.body.companies as { id: string; plan: string; name: string }[]) {
      expect(company.plan).toBe('business');
      const c = `/companies/${company.id}`;
      for (const [path, count, query] of MODULE_LISTS) {
        const res = await t.get(`${c}${path}`, { token, query });
        expect(res.status, `${company.name} ${path} ${JSON.stringify(query ?? {})}`).toBe(200);
        expect(count(res.body), `${company.name} ${path} ${JSON.stringify(query ?? {})}`).toBeGreaterThan(0);
      }
      expect((await t.get(`${c}/branches`, { token })).body.data.length).toBeGreaterThanOrEqual(2);
      const today = businessDate(new Date());
      const integrity = await t.get(`${c}/books/integrity`, { token, query: { from: addDaysISO(today, -400), to: today } });
      expect(integrity.body.checks.filter((x: { ok: boolean }) => !x.ok), company.name).toEqual([]);
    }

    // Read-only: every write is refused, the account's own settings included.
    const company = me.body.companies[0] as { id: string };
    const c = `/companies/${company.id}`;
    const parties = (await t.get(`${c}/parties`, { token })).body.data as { id: string }[];
    const writes = [
      () => t.post(`${c}/parties`, { kind: 'customer', name: 'Visitor Co', currency: 'INR', billingAddress: { line1: 'x', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', postalCode: '400001', country: 'IN' }, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 30 }, { token }),
      () => t.post(`${c}/expenses`, { categoryId: 'x', date: '2026-01-01', amount: { minor: 100, currency: 'INR' }, currency: 'INR', accountId: 'x', method: 'cash' }, { token }),
      () => t.del(`${c}/parties/${parties[0].id}`, { token, headers: { 'if-match': '*' } }),
      () => t.patch('/me', { name: 'Hacked' }, { token }),
      () => t.post('/me/delete', { confirm: 'DELETE', password: ON.DEMO_PASSWORD }, { token }),
      () => t.post('/me/mfa/enrollment', {}, { token }),
      () => t.post('/companies', { name: 'Mine now', businessType: 'retail', country: 'IN', baseCurrency: 'INR', address: { line1: 'x', city: 'Mumbai', state: 'Maharashtra', stateCode: '27', postalCode: '400001', country: 'IN' }, fiscalYearStartMonth: 4 }, { token }),
      () => t.post('/users', { name: 'Friend', email: 'friend@example.com', role: 'admin', companyIds: [company.id] }, { token }),
    ];
    for (const write of writes) {
      const res = await write();
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('DEMO_READ_ONLY');
    }
    expect((await t.get('/me', { token })).body.user.name).toBe('Demo Owner');

    // What it may still do: work out totals, export, sign out.
    const { operations } = await loadOperations();
    expect(operations.filter((op) => op.demoAllowed).map((op) => op.id).sort()).toEqual(['calculateDocument', 'createExport', 'lixiChat', 'previewTds', 'refreshToken', 'signIn', 'signOut']);

    // Each visitor sees only their own device.
    const second = await signInDemo();
    expect((await t.get('/me/devices', { token: second })).body.data).toHaveLength(1);

    // A public password: wrong guesses never lock it, and nobody can reset it.
    for (let i = 0; i < 6; i++) expect((await t.post('/auth/sign-in', { email: ON.DEMO_EMAIL, password: 'wrong-guess-123' })).status).toBe(401);
    await signInDemo();
    t.providers.outbox.clear();
    await t.post('/auth/password/forgot', { email: ON.DEMO_EMAIL });
    expect(t.providers.outbox.messages).toHaveLength(0);

    // Background jobs leave it alone, however far the clock runs.
    const demoCompanies = (me.body.companies as { id: string }[]).map((x) => x.id);
    const later = addDaysISO(businessDate(new Date()), 45);
    await issueRecurringInvoices(t.deps, later);
    await materializeRecurringExpenses(t.deps, later);
    expect(await t.deps.db.select({ id: schema.documents.id }).from(schema.documents).where(and(inArray(schema.documents.companyId, demoCompanies), isNotNull(schema.documents.recurringParentId)))).toEqual([]);
    expect(await t.deps.db.select({ id: schema.expenses.id }).from(schema.expenses).where(and(inArray(schema.expenses.companyId, demoCompanies), isNotNull(schema.expenses.recurringParentId)))).toEqual([]);

    // A rebuild swaps a fresh copy in under the same sign-in, signs the old visitors out, and erases the old data.
    expect(await build(ON, true)).toBe('built');
    expect((await t.get('/me', { token })).status).toBe(401);
    const fresh = await signInDemo();
    const after = (await t.get('/me', { token: fresh })).body.companies.map((x: { id: string }) => x.id);
    expect(after.some((id: string) => demoCompanies.includes(id))).toBe(false);
    expect(await t.deps.db.select({ id: schema.companies.id }).from(schema.companies).where(inArray(schema.companies.id, demoCompanies))).toEqual([]);
    expect((await t.get('/me', { token: other.token })).status).toBe(200);

    // Switched off: no sign-in to hand out, and nobody gets in.
    expect(await build({ ...ON, DEMO_ENABLED: 'false' })).toBe('disabled');
    process.env.DEMO_ENABLED = 'false';
    expect((await t.get('/auth/demo')).status).toBe(404);
    expect((await t.post('/auth/sign-in', { email: ON.DEMO_EMAIL, password: ON.DEMO_PASSWORD })).status).toBe(401);
    expect(await t.deps.db.select({ id: schema.accounts.id }).from(schema.accounts).where(and(eq(schema.accounts.isDemo, true), isNull(schema.accounts.suspendedAt)))).toEqual([]);
  });
});
