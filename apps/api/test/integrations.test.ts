import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { decrypt } from '../src/lib/crypto';
import { ownerWithCompany, setupApi } from './helpers';
import { joinTeam } from './team-helpers';

const t = setupApi();

describe('integrations', () => {
  it('lists the catalogue with per-company connection state', async () => {
    const { token, c } = await ownerWithCompany(t);
    const res = await t.get(`${c}/integrations`, { token });
    expect(res.body.data).toHaveLength(8);
    expect(res.body.data.every((i: { connected: boolean }) => i.connected === false)).toBe(true);
    expect(res.body.data.find((i: { id: string }) => i.id === 'int_einvoice')).toMatchObject({ category: 'compliance', configRoute: '/(app)/settings/e-invoicing' });
  });

  it('connects with plain config and encrypted secrets, never returning them', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const res = await t.post(`${c}/integrations/int_sms/connect`, { config: { senderId: 'ELIXIR', apiKey: 'sk_live_supersecret' } }, { token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ integration: expect.objectContaining({ id: 'int_sms', connected: true }) });
    expect(res.raw).not.toContain('supersecret');

    const [row] = await t.deps.db
      .select()
      .from(schema.companyIntegrations)
      .where(and(eq(schema.companyIntegrations.companyId, company.id!), eq(schema.companyIntegrations.integrationId, 'int_sms')));
    expect(row.config).toEqual({ senderId: 'ELIXIR' });
    expect(row.credentialsEncrypted?.toString('utf8')).not.toContain('supersecret');
    expect(JSON.parse(decrypt(row.credentialsEncrypted!, t.deps.config.CREDENTIALS_KEY))).toEqual({ apiKey: 'sk_live_supersecret' });

    const list = await t.get(`${c}/integrations`, { token });
    expect(list.body.data.find((i: { id: string }) => i.id === 'int_sms').connected).toBe(true);

    const off = await t.post(`${c}/integrations/int_sms/disconnect`, {}, { token });
    expect(off.body).toMatchObject({ id: 'int_sms', connected: false });
    const [after] = await t.deps.db.select().from(schema.companyIntegrations).where(eq(schema.companyIntegrations.integrationId, 'int_sms'));
    expect(after.credentialsEncrypted).toBeNull();
    expect((await t.post(`${c}/integrations/int_nope/disconnect`, {}, { token })).status).toBe(404);
  });

  it('gates by the integration minimum plan, and OAuth providers return an authorize URL', async () => {
    const free = await ownerWithCompany(t);
    const denied = await t.post(`${free.c}/integrations/int_drive/connect`, {}, { token: free.token });
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: 'PLAN_UPGRADE_REQUIRED', requiredPlan: 'business' });

    const biz = await ownerWithCompany(t, { plan: 'business' });
    const res = await t.post(`${biz.c}/integrations/int_drive/connect`, {}, { token: biz.token });
    expect(res.status).toBe(200);
    expect(res.body.integration.connected).toBe(false);
    expect(res.body.authorizeUrl).toMatch(/^https:\/\/accounts\.google\.com\//);
  });

  it('is for owners and admins', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const sales = await joinTeam(t, token, { role: 'accountant', companyIds: [company.id!] });
    expect((await t.post(`${c}/integrations/int_upi/connect`, { config: { vpa: 'shop@upi' } }, { token: sales.token })).status).toBe(403);
    expect((await t.get(`${c}/integrations`, { token: sales.token })).status).toBe(200);
  });
});
