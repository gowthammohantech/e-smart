import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { createCompany, ownerWithCompany, setupApi, signUpOwner, type TestContext } from './helpers';
import { joinTeam } from './team-helpers';

const t = setupApi();

/** A user on their own account with a platform role, set straight in the DB as db:platform-admin does. */
async function platformOperator(t: TestContext, role: 'superadmin' | 'support') {
  const op = await signUpOwner(t, { name: role === 'superadmin' ? 'Sam Super' : 'Sue Support' });
  await t.deps.db.update(schema.users).set({ platformRole: role }).where(eq(schema.users.id, op.user.id!));
  return op;
}

const REASON = { reason: 'Support ticket #1234' };

describe('platform access', () => {
  it('refuses every /admin route to tenant users, owners included', async () => {
    const { token, company, user } = await ownerWithCompany(t);
    const reads = ['/admin/metrics/overview', '/admin/accounts', `/admin/accounts/${user.accountId}`, `/admin/companies/${company.id}`, '/admin/users', '/admin/audit-events'];
    for (const url of reads) {
      const res = await t.get(url, { token });
      expect(res.status, url).toBe(403);
      expect(res.body.code).toBe('PLATFORM_FORBIDDEN');
    }
    const res = await t.post(`/admin/accounts/${user.accountId}/suspend`, REASON, { token });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLATFORM_FORBIDDEN');
  });

  it('requires a token', async () => {
    const res = await t.get('/admin/accounts');
    expect(res.status).toBe(401);
  });

  it('reports platformRole on /me', async () => {
    const support = await platformOperator(t, 'support');
    const tenant = await signUpOwner(t);
    expect((await t.get('/me', { token: support.token })).body.platformRole).toBe('support');
    expect((await t.get('/me', { token: tenant.token })).body.platformRole).toBeNull();
  });

  it('lets support read but not change anything', async () => {
    const support = await platformOperator(t, 'support');
    const { company, user } = await ownerWithCompany(t);
    expect((await t.get('/admin/accounts', { token: support.token })).status).toBe(200);
    expect((await t.get(`/admin/companies/${company.id}`, { token: support.token })).status).toBe(200);

    const writes = [
      t.post(`/admin/accounts/${user.accountId}/suspend`, REASON, { token: support.token }),
      t.post(`/admin/accounts/${user.accountId}/reactivate`, REASON, { token: support.token }),
      t.put(`/admin/companies/${company.id}/plan`, { plan: 'pro', ...REASON }, { token: support.token }),
      t.post(`/admin/users/${user.id}/disable`, REASON, { token: support.token }),
      t.post(`/admin/users/${user.id}/enable`, REASON, { token: support.token }),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PLATFORM_FORBIDDEN');
    }
  });
});

describe('accounts', () => {
  it('lists and searches accounts with rollups', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const a = await ownerWithCompany(t, { name: 'Acme Wholesale' });
    await createCompany(t, a.token, { name: 'Acme Retail', plan: 'pro' });
    await ownerWithCompany(t, { name: 'Zenith Stores' });

    const all = await t.get('/admin/accounts', { token: admin.token });
    expect(all.status).toBe(200);
    // Two tenants and the operator's own account.
    expect(all.body.data).toHaveLength(3);

    const found = await t.get('/admin/accounts', { token: admin.token, query: { q: 'acme retail' } });
    expect(found.body.data).toHaveLength(1);
    expect(found.body.data[0]).toMatchObject({ id: a.user.accountId, companyCount: 2, userCount: 1, status: 'active', ownerEmail: a.email });
    expect([...found.body.data[0].plans].sort()).toEqual(['free', 'pro']);

    const pro = await t.get('/admin/accounts', { token: admin.token, query: { plan: 'pro' } });
    expect(pro.body.data.map((x: { id: string }) => x.id)).toEqual([a.user.accountId]);

    const page = await t.get('/admin/accounts', { token: admin.token, query: { limit: 2 } });
    expect(page.body.data).toHaveLength(2);
    const next = await t.get('/admin/accounts', { token: admin.token, query: { limit: 2, cursor: page.body.nextCursor } });
    expect(next.body.data).toHaveLength(1);
    expect(next.body.nextCursor).toBeNull();

    const detail = await t.get(`/admin/accounts/${a.user.accountId}`, { token: admin.token });
    expect(detail.body.companies.map((c: { name: string }) => c.name)).toEqual(['Acme Wholesale', 'Acme Retail']);
    expect(detail.body.users).toHaveLength(1);

    expect((await t.get('/admin/accounts/acc_missing', { token: admin.token })).status).toBe(404);
  });

  it('suspends an account: sessions end, sign-in and refresh are refused, and reactivation restores sign-in', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const tenant = await ownerWithCompany(t);
    const member = await joinTeam(t, tenant.token, { role: 'sales', companyIds: [tenant.company.id!] });

    const res = await t.post(`/admin/accounts/${tenant.user.accountId}/suspend`, { reason: 'Chargeback fraud' }, { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'suspended', suspendedReason: 'Chargeback fraud' });

    // Existing access tokens die with their sessions.
    expect((await t.get(tenant.c, { token: tenant.token })).status).toBe(401);
    expect((await t.get(tenant.c, { token: member.token })).status).toBe(401);
    const refresh = await t.post('/auth/refresh', { refreshToken: tenant.refreshToken });
    expect(refresh.status).toBe(401);
    const signIn = await t.post('/auth/sign-in', { email: tenant.email, password: tenant.password });
    expect(signIn.status).toBe(401);
    expect(signIn.body.code).toBe('ACCOUNT_SUSPENDED');

    expect((await t.post(`/admin/accounts/${tenant.user.accountId}/suspend`, REASON, { token: admin.token })).body.code).toBe('ALREADY_SUSPENDED');

    const back = await t.post(`/admin/accounts/${tenant.user.accountId}/reactivate`, { reason: 'Resolved with the bank' }, { token: admin.token });
    expect(back.status).toBe(200);
    expect(back.body.status).toBe('active');
    const again = await t.post('/auth/sign-in', { email: tenant.email, password: tenant.password });
    expect(again.status).toBe(200);
    expect((await t.get(tenant.c, { token: again.body.accessToken })).status).toBe(200);

    const audit = await t.get('/admin/audit-events', { token: admin.token, query: { targetId: tenant.user.accountId } });
    expect(audit.body.data.map((e: { action: string }) => e.action)).toEqual(['account.reactivate', 'account.suspend']);
    expect(audit.body.data[1]).toMatchObject({ actorId: admin.user.id, actorEmail: admin.email, reason: 'Chargeback fraud', targetType: 'account' });
  });

  it("won't suspend an account that has platform operators, the caller's own included", async () => {
    const admin = await platformOperator(t, 'superadmin');
    const res = await t.post(`/admin/accounts/${admin.user.accountId}/suspend`, REASON, { token: admin.token });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PLATFORM_ACCOUNT');
  });

  it('requires a real reason', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const tenant = await ownerWithCompany(t);
    const blank = await t.post(`/admin/accounts/${tenant.user.accountId}/suspend`, { reason: '     ' }, { token: admin.token });
    expect(blank.status).toBe(422);
    const missing = await t.post(`/admin/accounts/${tenant.user.accountId}/suspend`, {}, { token: admin.token, unchecked: true });
    expect(missing.status).toBeGreaterThanOrEqual(400);
    expect(await t.deps.db.select().from(schema.platformAuditEvents)).toHaveLength(0);
  });
});

describe('plan override', () => {
  it('changes the plan, records a subscription event, the tenant audit trail and the platform audit log', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const tenant = await ownerWithCompany(t);
    const periodEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();

    const res = await t.put(`/admin/companies/${tenant.company.id}/plan`, { plan: 'business', status: 'trialing', currentPeriodEnd: periodEnd, reason: 'Pilot partner' }, { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.company.plan).toBe('business');
    expect(res.body.subscription).toMatchObject({ plan: 'business', status: 'trialing', currentPeriodEnd: periodEnd });
    expect(res.body.warning).toBeNull();

    // The tenant sees the new plan straight away.
    const company = await t.get(tenant.c, { token: tenant.token });
    expect(company.body.plan).toBe('business');

    const detail = await t.get(`/admin/companies/${tenant.company.id}`, { token: admin.token });
    expect(detail.body.planHistory[0]).toMatchObject({ fromPlan: 'free', toPlan: 'business', event: 'adminOverride' });

    const tenantAudit = await t.get(`${tenant.c}/audit-events`, { token: tenant.token, query: { entityType: 'company' } });
    expect(tenantAudit.body.data[0]).toMatchObject({ action: 'plan changed to business', actorName: 'Sam Super (platform support)' });

    const [row] = await t.deps.db.select().from(schema.platformAuditEvents);
    expect(row).toMatchObject({ action: 'company.plan.override', targetId: tenant.company.id, reason: 'Pilot partner' });
    expect(row.before).toMatchObject({ plan: 'free', status: 'none' });
    expect(row.after).toMatchObject({ plan: 'business', status: 'trialing' });
  });

  it('warns when a billing provider manages the subscription', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const tenant = await ownerWithCompany(t, { plan: 'basic' });
    await t.deps.db.insert(schema.subscriptions).values({ companyId: tenant.company.id!, plan: 'basic', cycle: 'monthly', status: 'active', provider: 'razorpay', providerSubscriptionId: 'sub_test1' });
    const res = await t.put(`/admin/companies/${tenant.company.id}/plan`, { plan: 'pro', reason: 'Goodwill upgrade' }, { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.warning).toMatch(/razorpay/);
    expect(res.body.subscription.provider).toBe('razorpay');
  });

  it('rejects a period end in the past and an unknown company', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const tenant = await ownerWithCompany(t);
    const past = await t.put(`/admin/companies/${tenant.company.id}/plan`, { plan: 'pro', currentPeriodEnd: '2020-01-01T00:00:00Z', ...REASON }, { token: admin.token });
    expect(past.status).toBe(422);
    expect((await t.put('/admin/companies/cmp_missing/plan', { plan: 'pro', ...REASON }, { token: admin.token })).status).toBe(404);
  });
});

describe('users', () => {
  it('searches users across accounts', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const a = await ownerWithCompany(t);
    await ownerWithCompany(t);
    const res = await t.get('/admin/users', { token: admin.token, query: { q: a.email } });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: a.user.id, platformRole: null, accountSuspended: false });
    const byAccount = await t.get('/admin/users', { token: admin.token, query: { accountId: admin.user.accountId } });
    expect(byAccount.body.data[0].platformRole).toBe('superadmin');
  });

  it('disables a user (signing them out) and enables them again', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const tenant = await ownerWithCompany(t);
    const member = await joinTeam(t, tenant.token, { role: 'accountant', companyIds: [tenant.company.id!] });

    const off = await t.post(`/admin/users/${member.user.id}/disable`, { reason: 'Left the company' }, { token: admin.token });
    expect(off.status).toBe(200);
    expect(off.body.status).toBe('disabled');
    expect((await t.get(tenant.c, { token: member.token })).status).toBe(401);
    expect((await t.post('/auth/sign-in', { email: member.email, password: 'member password 1' })).body.code).toBe('USER_DISABLED');
    expect((await t.post(`/admin/users/${member.user.id}/disable`, REASON, { token: admin.token })).body.code).toBe('ALREADY_DISABLED');

    const on = await t.post(`/admin/users/${member.user.id}/enable`, { reason: 'Rehired' }, { token: admin.token });
    expect(on.status).toBe(200);
    expect(on.body.status).toBe('active');
    expect((await t.post('/auth/sign-in', { email: member.email, password: 'member password 1' })).status).toBe(200);

    const tenantAudit = await t.get(`${tenant.c}/audit-events`, { token: tenant.token, query: { entityType: 'user', entityId: member.user.id } });
    expect(tenantAudit.body.data.slice(0, 2).map((e: { action: string }) => e.action)).toEqual(['enabled', 'disabled']);
  });

  it("won't disable a platform operator", async () => {
    const admin = await platformOperator(t, 'superadmin');
    const res = await t.post(`/admin/users/${admin.user.id}/disable`, REASON, { token: admin.token });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PLATFORM_OPERATOR');
  });
});

describe('overview', () => {
  it('counts tenants, plans, signups and documents per day', async () => {
    t.setNow('2026-10-09T10:00:00Z');
    const admin = await platformOperator(t, 'superadmin');
    await ownerWithCompany(t, { plan: 'pro' });
    const b = await ownerWithCompany(t);
    await t.deps.db.update(schema.accounts).set({ suspendedAt: new Date() }).where(eq(schema.accounts.id, b.user.accountId!));

    const res = await t.get('/admin/metrics/overview', { token: admin.token, query: { from: '2026-10-01', to: '2026-10-09' } });
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ accounts: 3, suspendedAccounts: 1, companies: 2, users: 3 });
    expect(res.body.plans).toEqual([
      { plan: 'free', companies: 1 },
      { plan: 'basic', companies: 0 },
      { plan: 'pro', companies: 1 },
      { plan: 'business', companies: 0 },
    ]);
    expect(res.body.signups).toHaveLength(9);
    expect(res.body.documents).toHaveLength(9);
    expect(res.body.signups[0]).toEqual({ date: '2026-10-01', accounts: 0, companies: 0 });

    const bad = await t.get('/admin/metrics/overview', { token: admin.token, query: { from: '2026-10-09', to: '2026-10-01' } });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_RANGE');
  });

  it('defaults to the last 30 days', async () => {
    const admin = await platformOperator(t, 'superadmin');
    const res = await t.get('/admin/metrics/overview', { token: admin.token });
    expect(res.body.signups).toHaveLength(30);
    expect(res.body.signups.at(-1).accounts).toBeGreaterThanOrEqual(1);
  });
});
