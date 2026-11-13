import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { totpCode, totpStep } from '../src/lib/totp';
import type { GspRequest, GspTransport } from '../src/providers/gsp/transport';
import { GspRequestError } from '../src/providers/gsp/transport';
import { createGspRouter } from '../src/providers/gsp';
import { ownerWithCompany, setupApi, signUpOwner, type TestContext } from './helpers';


/** Both gateways configured side by side, as in .env; Adaequare is the deployment's default. */
const t = setupApi({
  COMPLIANCE_PROVIDER: 'gsp',
  TAXATION_GSP_PROVIDER_CODE: 'ADAEQUARE_GSP',
  TAXATION_ADAEQUARE_BASE_URL: 'https://gsp.example.test/',
  TAXATION_ADAEQUARE_APP_ID: 'adq-id',
  TAXATION_ADAEQUARE_APP_SECRET: 'adq-secret',
  TAXATION_WHITEBOOKS_BASE_URL: 'https://apisandbox.example.test',
  TAXATION_WHITEBOOKS_ACCOUNT_EMAIL: 'a@example.test',
  TAXATION_WHITEBOOKS_IP_ADDRESS: '203.0.113.7',
  TAXATION_WHITEBOOKS_EINVOICE_APP_ID: 'wb-id',
  TAXATION_WHITEBOOKS_EINVOICE_APP_SECRET: 'wb-secret',
  TAXATION_GSTIN_ALLOW_SANDBOX: 'true',
});

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
 * Puts the real router behind the app, with a transport that reaches nothing, and records which gateway each
 * call was routed to: Adaequare caches its application token across companies, so the network alone would not show it.
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
  router.gatewayFor = (name) => {
    const gateway = resolve(name);
    routed.push(gateway.gateway);
    return gateway;
  };
  (t.providers as { compliance: unknown }).compliance = router;
  return routed;
}

const choose = (tc: TestContext, token: string, companyId: string, provider: string | null, reason = 'Customer asked to move') =>
  tc.put(`/admin/companies/${companyId}/gsp-provider`, { provider, reason }, { token });

describe('a company’s GST gateway', () => {
  it('follows the deployment default until an operator chooses one', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const m = await tenant();

    const detail = await t.get(`/admin/companies/${m.companyId}`, { token: admin.token });
    expect(detail.status).toBe(200);
    expect(detail.body.company.gspProvider).toBeNull();
    expect(detail.body.gsp).toMatchObject({
      override: null,
      default: 'adaequare',
      effective: 'adaequare',
      simulated: false,
      options: [
        { gateway: 'adaequare', available: true, sandboxOnly: false },
        { gateway: 'whitebooks', available: true, sandboxOnly: true },
      ],
    });
  });

  it('lets a superadmin choose and clear it, and records who did what and why', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const m = await tenant();
    // The business has stored a portal login, with a session cached from the old gateway.
    expect((await t.put(`${m.c}/compliance-settings/credentials`, { username: 'api_user', password: 'a-long-password-1' }, { token: m.token })).status).toBe(204);
    const CR = schema.complianceCredentials;
    await t.deps.db.update(CR).set({ authTokenEncrypted: Buffer.from('cached'), authTokenExpiresAt: new Date(Date.now() + 3_600_000), lastTestOk: true }).where(eq(CR.companyId, m.companyId));

    const set = await choose(t, admin.token, m.companyId, 'whitebooks');
    expect(set.status).toBe(200);
    expect(set.body.company.gspProvider).toBe('whitebooks');
    expect(set.body.gsp).toMatchObject({ override: 'whitebooks', default: 'adaequare', effective: 'whitebooks' });

    const [company] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(company.gspProvider).toBe('whitebooks');
    // The old gateway's session and test result are dropped; the login itself stays, now recorded against the new gateway.
    const rows = await t.deps.db.select().from(CR).where(eq(CR.companyId, m.companyId));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ gspProvider: 'WHITE_BOOKS_GSP', authTokenEncrypted: null, authTokenExpiresAt: null, lastTestOk: null });
    }

    const tenantAudit = await t.get(`${m.c}/audit-events`, { token: m.token, query: { entityType: 'company' } });
    expect(tenantAudit.body.data[0]).toMatchObject({ action: 'GST gateway set to whitebooks', actorName: 'Sam Super (platform support)' });
    const [event] = await t.deps.db.select().from(schema.platformAuditEvents).where(eq(schema.platformAuditEvents.action, 'company.gsp.set'));
    expect(event).toMatchObject({ targetId: m.companyId, reason: 'Customer asked to move' });
    expect(event.before).toEqual({ gspProvider: null });
    expect(event.after).toEqual({ gspProvider: 'whitebooks' });

    // The same choice again changes nothing.
    const again = await choose(t, admin.token, m.companyId, 'whitebooks');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NO_CHANGE');

    // Clearing it sends the company back to the deployment default.
    const cleared = await choose(t, admin.token, m.companyId, null);
    expect(cleared.status).toBe(200);
    expect(cleared.body.gsp).toMatchObject({ override: null, effective: 'adaequare' });
    expect(cleared.body.company.gspProvider).toBeNull();
    const [after] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(after.gspProvider).toBeNull();
    expect((await t.deps.db.select().from(CR).where(eq(CR.companyId, m.companyId)))[0].gspProvider).toBe('ADAEQUARE_GSP');
    expect((await choose(t, admin.token, m.companyId, null)).body.code).toBe('NO_CHANGE');
  });

  it('is a superadmin’s to change, and a tenant never sees or sets it', async () => {
    const support = await platformOperator(t, 'support');
    const m = await tenant();

    expect((await choose(t, support.token, m.companyId, 'whitebooks')).status).toBe(403);
    expect((await choose(t, m.token, m.companyId, 'whitebooks')).status).toBe(403);
    // Support can read it.
    expect((await t.get(`/admin/companies/${m.companyId}`, { token: support.token })).body.gsp.effective).toBe('adaequare');

    // The company's own profile neither shows the field nor takes it.
    const own = await t.get(m.c, { token: m.token });
    expect(JSON.stringify(own.body)).not.toMatch(/gsp/i);
    const saved = await t.put(m.c, { ...own.body, gspProvider: 'whitebooks' }, { token: m.token, headers: { 'if-match': `"v${own.body.version}"` } });
    expect(saved.status).toBeLessThan(500);
    const [row] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(row.gspProvider).toBeNull();
  });

  it('refuses a gateway this deployment cannot run, an unknown one, and a choice with no reason', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const m = await tenant();

    expect((await choose(t, admin.token, m.companyId, 'cleartax')).status).toBe(422);
    expect((await choose(t, admin.token, m.companyId, 'whitebooks', 'x')).status).toBe(422);
    expect((await choose(t, admin.token, 'cmp_missing', 'whitebooks')).status).toBe(404);

    // A live deployment does not allow the sandbox, so Whitebooks cannot be chosen there.
    const config = t.deps.config as { TAXATION_GSTIN_ALLOW_SANDBOX: boolean };
    config.TAXATION_GSTIN_ALLOW_SANDBOX = false;
    try {
      const refused = await choose(t, admin.token, m.companyId, 'whitebooks');
      expect(refused.status).toBe(422);
      expect(JSON.stringify(refused.body)).toMatch(/sandbox/i);
      const detail = await t.get(`/admin/companies/${m.companyId}`, { token: admin.token });
      expect(detail.body.gsp.options).toContainEqual(expect.objectContaining({ gateway: 'whitebooks', available: false }));
      // Adaequare is still on offer.
      expect((await choose(t, admin.token, m.companyId, 'adaequare')).status).toBe(200);
    } finally {
      config.TAXATION_GSTIN_ALLOW_SANDBOX = true;
    }
    const [row] = await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, m.companyId));
    expect(row.gspProvider).toBe('adaequare');
  });

  it('files each company through its own gateway, both at once, and back again when cleared', async () => {
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

    // Nothing chosen: the deployment's default, Adaequare, for both.
    expect(await hit(a)).toEqual(['adaequare']);
    expect(await hit(b)).toEqual(['adaequare']);

    // One company moves to Whitebooks; the other stays where it was.
    expect((await choose(t, admin.token, a.companyId, 'whitebooks')).status).toBe(200);
    expect(await hit(a)).toEqual(['whitebooks']);
    expect(await hit(b)).toEqual(['adaequare']);

    // And the other way round, with the first cleared.
    expect((await choose(t, admin.token, b.companyId, 'whitebooks')).status).toBe(200);
    expect((await choose(t, admin.token, a.companyId, null)).status).toBe(200);
    expect(await hit(a)).toEqual(['adaequare']);
    expect(await hit(b)).toEqual(['whitebooks']);
  });
});
