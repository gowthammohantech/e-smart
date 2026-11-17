import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { totpCode, totpStep } from '../src/lib/totp';
import type { GspRequest, GspTransport } from '../src/providers/gsp/transport';
import { GspRequestError } from '../src/providers/gsp/transport';
import { createGspRouter } from '../src/providers/gsp';
import { ownerWithCompany, setupApi, signUpOwner, type TestContext } from './helpers';

/**
 * Three targets configured side by side, as in .env, with Whitebooks sandbox the deployment's default. Whitebooks
 * production has no settings (no subscription), so it is listed but cannot be chosen.
 */
const t = setupApi({
  COMPLIANCE_PROVIDER: 'gsp',
  TAXATION_GSP_PROVIDER_CODE: 'WHITE_BOOKS_GSP',
  TAXATION_GSP_ENVIRONMENT: 'sandbox',
  TAXATION_ADAEQUARE_PRODUCTION_BASE_URL: 'https://gsp.example.test/',
  TAXATION_ADAEQUARE_PRODUCTION_APP_ID: 'adq-id',
  TAXATION_ADAEQUARE_PRODUCTION_APP_SECRET: 'adq-secret',
  TAXATION_ADAEQUARE_SANDBOX_BASE_URL: 'https://gsp.example.test/test/',
  TAXATION_ADAEQUARE_SANDBOX_APP_ID: 'adq-sbx-id',
  TAXATION_ADAEQUARE_SANDBOX_APP_SECRET: 'adq-sbx-secret',
  TAXATION_WHITEBOOKS_SANDBOX_BASE_URL: 'https://apisandbox.example.test',
  TAXATION_WHITEBOOKS_ACCOUNT_EMAIL: 'a@example.test',
  TAXATION_WHITEBOOKS_IP_ADDRESS: '203.0.113.7',
  TAXATION_WHITEBOOKS_SANDBOX_EINVOICE_APP_ID: 'wb-id',
  TAXATION_WHITEBOOKS_SANDBOX_EINVOICE_APP_SECRET: 'wb-secret',
});

const WB_SANDBOX = { gateway: 'whitebooks', environment: 'sandbox' };
const ADQ_PRODUCTION = { gateway: 'adaequare', environment: 'production' };

/** An operator on their own account with a platform role and a passed authenticator, as platform-admin.test sets one up. */
async function platformOperator(tc: TestContext, role: 'superadmin' | 'support') {
  const op = await signUpOwner(tc, { name: role === 'superadmin' ? 'Sam Super' : 'Sue Support' });
  await tc.deps.db.update(schema.users).set({ platformRole: role }).where(eq(schema.users.id, op.user.id!));
  const { secret } = (await tc.post('/admin/mfa/enrollment', {}, { token: op.token })).body;
  const confirmed = await tc.post('/admin/mfa/enrollment/confirm', { code: totpCode(secret, totpStep(tc.deps.now().getTime())) }, { token: op.token });
  if (confirmed.status !== 200) throw new Error(`MFA enrollment failed: ${confirmed.raw}`);
  return op;
}

/** A business with its owner, signed in. */
async function tenant() {
  const o = await ownerWithCompany(t);
  return { ...o, companyId: o.company.id! };
}

/**
 * Puts the real router behind the app, with a transport that reaches nothing, and records which target each
 * call was routed to: a gateway caches its application token across companies, so the network alone would not show it.
 */
function recordRouting() {
  const refuse = async (_request: GspRequest): Promise<never> => {
    throw new GspRequestError('no route', 'http', 404, null);
  };
  const transport: GspTransport = {
    async authenticate() {
      return { accessToken: 'bearer', expiresInSeconds: 3600 };
    },
    get: refuse,
    post: refuse,
  };
  const router = createGspRouter(t.deps.config, { transport });
  const routed: string[] = [];
  const resolve = router.gatewayFor.bind(router);
  router.gatewayFor = (target) => {
    const gateway = resolve(target);
    const wanted = typeof target === 'object' ? target : undefined;
    routed.push(`${gateway.gateway}:${wanted?.environment ?? router.target.environment}`);
    return gateway;
  };
  (t.providers as { compliance: unknown }).compliance = router;
  return routed;
}

const choose = (tc: TestContext, token: string, companyId: string, target: { gateway: string; environment: string } | null, reason = 'Customer asked to move') =>
  tc.put(`/admin/companies/${companyId}/gsp-provider`, { provider: target?.gateway ?? null, environment: target?.environment ?? null, reason }, { token });

describe('a company’s GST target', () => {
  it('follows the deployment default until an operator chooses one, and lists all four targets', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const m = await tenant();

    const detail = await t.get(`/admin/companies/${m.companyId}`, { token: admin.token });
    expect(detail.status).toBe(200);
    expect(detail.body.company.gspProvider).toBeNull();
    expect(detail.body.company.gspEnvironment).toBeNull();
    expect(detail.body.gsp).toMatchObject({
      override: null,
      default: WB_SANDBOX,
      effective: WB_SANDBOX,
      simulated: false,
      options: [
        { gateway: 'adaequare', environment: 'production', available: true },
        { gateway: 'adaequare', environment: 'sandbox', available: true },
        { gateway: 'whitebooks', environment: 'sandbox', available: true },
        { gateway: 'whitebooks', environment: 'production', available: false },
      ],
    });
    // The one that cannot be chosen says what is missing.
    expect(detail.body.gsp.options[3].reason).toMatch(/TAXATION_WHITEBOOKS_PRODUCTION_BASE_URL/);
  });

  it('lets a superadmin choose and clear it, and records who did what and why', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const m = await tenant();
    // The business has stored a portal login, with a session cached from the old target.
    expect((await t.put(`${m.c}/compliance-settings/credentials`, { username: 'api_user', password: 'a-long-password-1' }, { token: m.token })).status).toBe(204);
    const CR = schema.complianceCredentials;
    await t.deps.db.update(CR).set({ authTokenEncrypted: Buffer.from('cached'), authTokenExpiresAt: new Date(Date.now() + 3_600_000), lastTestOk: true }).where(eq(CR.companyId, m.companyId));

    const set = await choose(t, admin.token, m.companyId, ADQ_PRODUCTION);
    expect(set.status).toBe(200);
    expect(set.body.company).toMatchObject({ gspProvider: 'adaequare', gspEnvironment: 'production' });
    expect(set.body.gsp).toMatchObject({ override: ADQ_PRODUCTION, default: WB_SANDBOX, effective: ADQ_PRODUCTION });

    const [company] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(company).toMatchObject({ gspProvider: 'adaequare', gspEnvironment: 'production' });
    // The old target's session and test result are dropped; the login itself stays, now recorded against the new gateway.
    const rows = await t.deps.db.select().from(CR).where(eq(CR.companyId, m.companyId));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ gspProvider: 'ADAEQUARE_GSP', authTokenEncrypted: null, authTokenExpiresAt: null, lastTestOk: null });
    }

    const tenantAudit = await t.get(`${m.c}/audit-events`, { token: m.token, query: { entityType: 'company' } });
    expect(tenantAudit.body.data[0]).toMatchObject({ action: 'GST gateway set to adaequare production', actorName: 'Sam Super (platform support)' });
    const [event] = await t.deps.db.select().from(schema.platformAuditEvents).where(eq(schema.platformAuditEvents.action, 'company.gsp.set'));
    expect(event).toMatchObject({ targetId: m.companyId, reason: 'Customer asked to move' });
    expect(event.before).toEqual({ gspProvider: null, gspEnvironment: null });
    expect(event.after).toEqual({ gspProvider: 'adaequare', gspEnvironment: 'production' });

    // The same choice again changes nothing.
    const again = await choose(t, admin.token, m.companyId, ADQ_PRODUCTION);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NO_CHANGE');

    // The same gateway in the other environment is a change.
    const sandbox = await choose(t, admin.token, m.companyId, { gateway: 'adaequare', environment: 'sandbox' });
    expect(sandbox.status).toBe(200);
    expect(sandbox.body.gsp.effective).toEqual({ gateway: 'adaequare', environment: 'sandbox' });

    // Clearing it sends the company back to the deployment default.
    const cleared = await choose(t, admin.token, m.companyId, null);
    expect(cleared.status).toBe(200);
    expect(cleared.body.gsp).toMatchObject({ override: null, effective: WB_SANDBOX });
    expect(cleared.body.company).toMatchObject({ gspProvider: null, gspEnvironment: null });
    const [after] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(after).toMatchObject({ gspProvider: null, gspEnvironment: null });
    expect((await t.deps.db.select().from(CR).where(eq(CR.companyId, m.companyId)))[0].gspProvider).toBe('WHITE_BOOKS_GSP');
    expect((await choose(t, admin.token, m.companyId, null)).body.code).toBe('NO_CHANGE');
  });

  it('is a superadmin’s to change, and a tenant never sees or sets it', async () => {
    const support = await platformOperator(t, 'support');
    const m = await tenant();

    expect((await choose(t, support.token, m.companyId, ADQ_PRODUCTION)).status).toBe(403);
    expect((await choose(t, m.token, m.companyId, ADQ_PRODUCTION)).status).toBe(403);
    // Support can read it.
    expect((await t.get(`/admin/companies/${m.companyId}`, { token: support.token })).body.gsp.effective).toEqual(WB_SANDBOX);

    // The company's own profile neither shows the field nor takes it.
    const own = await t.get(m.c, { token: m.token });
    expect(JSON.stringify(own.body)).not.toMatch(/gsp/i);
    const saved = await t.put(m.c, { ...own.body, gspProvider: 'adaequare', gspEnvironment: 'production' }, { token: m.token, headers: { 'if-match': `"v${own.body.version}"` } });
    expect(saved.status).toBeLessThan(500);
    const [row] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(row).toMatchObject({ gspProvider: null, gspEnvironment: null });
  });

  it('refuses a target this deployment cannot run, half a choice, an unknown gateway, and a choice with no reason', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const m = await tenant();

    // Whitebooks production has no settings here: listed, but not choosable. Nothing is hard-coded.
    const noSubscription = await choose(t, admin.token, m.companyId, { gateway: 'whitebooks', environment: 'production' });
    expect(noSubscription.status).toBe(422);
    expect(JSON.stringify(noSubscription.body)).toMatch(/TAXATION_WHITEBOOKS_PRODUCTION_BASE_URL/);

    // A gateway needs an environment and an environment needs a gateway.
    expect((await t.put(`/admin/companies/${m.companyId}/gsp-provider`, { provider: 'adaequare', environment: null, reason: 'Customer asked to move' }, { token: admin.token })).status).toBe(422);
    expect((await t.put(`/admin/companies/${m.companyId}/gsp-provider`, { provider: null, environment: 'sandbox', reason: 'Customer asked to move' }, { token: admin.token })).status).toBe(422);

    expect((await choose(t, admin.token, m.companyId, { gateway: 'cleartax', environment: 'sandbox' })).status).toBe(422);
    expect((await choose(t, admin.token, m.companyId, { gateway: 'adaequare', environment: 'staging' })).status).toBe(422);
    expect((await choose(t, admin.token, m.companyId, ADQ_PRODUCTION, 'x')).status).toBe(422);
    expect((await choose(t, admin.token, 'cmp_missing', ADQ_PRODUCTION)).status).toBe(404);

    const [row] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(row).toMatchObject({ gspProvider: null, gspEnvironment: null });
  });

  it('becomes choosable the moment its settings are filled in, with no code change', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const m = await tenant();
    const config = t.deps.config as Record<string, unknown>;
    const filled = { TAXATION_WHITEBOOKS_PRODUCTION_BASE_URL: 'https://api.example.test', TAXATION_WHITEBOOKS_PRODUCTION_EINVOICE_APP_ID: 'live-id', TAXATION_WHITEBOOKS_PRODUCTION_EINVOICE_APP_SECRET: 'live-secret' };
    const before = Object.fromEntries(Object.keys(filled).map((k) => [k, config[k]]));
    Object.assign(config, filled);
    try {
      expect((await choose(t, admin.token, m.companyId, { gateway: 'whitebooks', environment: 'production' })).status).toBe(200);
      const detail = await t.get(`/admin/companies/${m.companyId}`, { token: admin.token });
      expect(detail.body.gsp.options).toContainEqual(expect.objectContaining({ gateway: 'whitebooks', environment: 'production', available: true }));
    } finally {
      Object.assign(config, before);
    }
  });

  it('files each company through its own target, all at once, and back again when cleared', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const a = await tenant();
    const b = await tenant();
    for (const m of [a, b]) {
      expect((await t.put(`${m.c}/compliance-settings/credentials`, { username: 'api_user', password: 'a-long-password-1' }, { token: m.token })).status).toBe(204);
      // The login is checked against the company's GSTIN.
      await t.deps.db.update(schema.companies).set({ taxIdentifier: '27AAPFU0939F1ZV' }).where(eq(schema.companies.id, m.companyId));
    }
    const routed = recordRouting();
    const hit = async (m: { c: string; token: string }) => {
      routed.length = 0;
      await t.post(`${m.c}/compliance-settings/test-connection`, {}, { token: m.token });
      return [...new Set(routed)];
    };

    // Nothing chosen: the deployment's default, Whitebooks sandbox, for both.
    expect(await hit(a)).toEqual(['whitebooks:sandbox']);
    expect(await hit(b)).toEqual(['whitebooks:sandbox']);

    // One company moves to Adaequare production; the other stays where it was.
    expect((await choose(t, admin.token, a.companyId, ADQ_PRODUCTION)).status).toBe(200);
    expect(await hit(a)).toEqual(['adaequare:production']);
    expect(await hit(b)).toEqual(['whitebooks:sandbox']);

    // The other moves to Adaequare's sandbox, with the first cleared.
    expect((await choose(t, admin.token, b.companyId, { gateway: 'adaequare', environment: 'sandbox' })).status).toBe(200);
    expect((await choose(t, admin.token, a.companyId, null)).status).toBe(200);
    expect(await hit(a)).toEqual(['whitebooks:sandbox']);
    expect(await hit(b)).toEqual(['adaequare:sandbox']);
  });
});
