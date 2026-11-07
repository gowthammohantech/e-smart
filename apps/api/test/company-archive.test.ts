import { eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { schema } from '@esmart/db';
import { companyTables } from '../src/modules/exports/build';
import { purgeDueCompanies } from '../src/modules/platform/purge';
import { MUMBAI, createCompany, ownerWithCompany, setupApi } from './helpers';
import { joinTeam } from './team-helpers';

const t = setupApi();
const log = { info: () => undefined };
/** The job for real: production starts in dry-run until it is switched off. */
const live = () => ({ ...t.deps, config: { ...t.deps.config, PURGE_DRY_RUN: false } });

/** An owner with two businesses: the second is the one archived. */
async function twoBusinesses() {
  const owner = await ownerWithCompany(t);
  const second = await createCompany(t, owner.token, { name: 'Konkan Exports', plan: 'pro' });
  return { ...owner, second, c2: `/companies/${second.id}` };
}

const customer = (name: string) => ({ kind: 'customer', name, currency: 'INR', openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 30, billingAddress: MUMBAI });
const companyRow = async (id: string) => (await t.deps.db.select().from(schema.companies).where(eq(schema.companies.id, id)))[0];

describe('archiving a business', () => {
  it('closes one business: read-only, out of every list, plan dropped, kept 8 years', async () => {
    const o = await twoBusinesses();
    const accountant = await joinTeam(t, o.token, { role: 'accountant', companyIds: [o.second.id!] });
    const res = await t.post(`${o.c2}/archive`, { confirmName: '  konkan exports ', password: o.password }, { token: o.token });
    expect(res.status).toBe(200);
    expect(res.body.archivedAt).toBeTruthy();
    expect(new Date(res.body.purgeAfter).getUTCFullYear() - new Date().getUTCFullYear()).toBe(8);
    expect(res.body.plan).toBe('free');

    // Gone from the lists, for the owner and the people they gave it to.
    for (const token of [o.token, accountant.token]) {
      expect((await t.get('/companies', { token })).body.data.map((c: { id: string }) => c.id)).not.toContain(o.second.id);
      expect((await t.get('/me', { token })).body.companies.map((c: { id: string }) => c.id)).not.toContain(o.second.id);
    }
    const archived = await t.get('/companies', { token: o.token, query: { archived: true } });
    expect(archived.body.data.map((c: { id: string }) => c.id)).toEqual([o.second.id]);

    // Readable and exportable; nothing else.
    expect((await t.get(o.c2, { token: o.token })).status).toBe(200);
    expect((await t.get(`${o.c2}/parties`, { token: o.token })).status).toBe(200);
    expect((await t.post(`${o.c2}/exports`, { format: 'csv-zip' }, { token: o.token })).status).toBe(202);
    const write = await t.post(`${o.c2}/parties`, customer('Late Customer'), { token: o.token });
    expect(write.status).toBe(409);
    expect(write.body.code).toBe('COMPANY_ARCHIVED');
    // The other business is untouched.
    expect((await t.get(o.c, { token: o.token })).body.archivedAt).toBeUndefined();

    const audit = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.companyId, o.second.id!));
    expect(audit.map((a) => a.action)).toContain('archived');
  });

  it('needs the owner, the name, the password, and another open business', async () => {
    const o = await twoBusinesses();
    const admin = await joinTeam(t, o.token, { role: 'admin', companyIds: [o.second.id!] });
    expect((await t.post(`${o.c2}/archive`, { confirmName: 'Konkan Exports', password: 'member password 1' }, { token: admin.token })).status).toBe(403);
    const wrongName = await t.post(`${o.c2}/archive`, { confirmName: 'Konkan', password: o.password }, { token: o.token });
    expect([wrongName.status, wrongName.body.code]).toEqual([422, 'NAME_MISMATCH']);
    expect((await t.post(`${o.c2}/archive`, { confirmName: 'Konkan Exports', password: 'not my password' }, { token: o.token })).body.code).toBe('REAUTH_FAILED');
    expect((await companyRow(o.second.id!)).archivedAt).toBeNull();

    expect((await t.post(`${o.c2}/archive`, { confirmName: 'Konkan Exports', password: o.password }, { token: o.token })).status).toBe(200);
    // The one left can't go this way: that is deleting the account.
    const last = await t.post(`${o.c}/archive`, { confirmName: o.company.name, password: o.password }, { token: o.token });
    expect([last.status, last.body.code]).toEqual([409, 'LAST_COMPANY']);
  });

  it('cancels the subscription first, and changes nothing when it cannot', async () => {
    const o = await twoBusinesses();
    const live = { plan: 'pro', cycle: 'monthly', status: 'active', provider: 'razorpay', providerSubscriptionId: 'sub_second' } as const;
    await t.deps.db.insert(schema.subscriptions).values({ companyId: o.second.id!, ...live }).onConflictDoUpdate({ target: schema.subscriptions.companyId, set: live });
    const cancel = vi.spyOn(t.deps.providers.payments, 'cancelSubscription').mockRejectedValueOnce(new Error('gateway down'));
    const body = { confirmName: 'Konkan Exports', password: o.password };
    const failed = await t.post(`${o.c2}/archive`, body, { token: o.token });
    expect([failed.status, failed.body.code]).toEqual([502, 'SUBSCRIPTION_CANCEL_FAILED']);
    expect((await companyRow(o.second.id!)).archivedAt).toBeNull();

    cancel.mockResolvedValueOnce(undefined);
    expect((await t.post(`${o.c2}/archive`, body, { token: o.token })).status).toBe(200);
    expect(cancel).toHaveBeenLastCalledWith('sub_second', { atPeriodEnd: false });
    cancel.mockRestore();
  });

  it('restores an archived business, as it was left', async () => {
    const o = await twoBusinesses();
    await t.post(`${o.c2}/archive`, { confirmName: 'Konkan Exports', password: o.password }, { token: o.token });
    const res = await t.post(`${o.c2}/restore`, {}, { token: o.token });
    expect(res.status).toBe(200);
    expect(res.body.archivedAt).toBeUndefined();
    expect(res.body.purgeAfter).toBeUndefined();
    expect((await t.get('/companies', { token: o.token })).body.data.map((c: { id: string }) => c.id)).toContain(o.second.id);
    expect((await t.post(`${o.c2}/parties`, customer('Back Again'), { token: o.token })).status).toBe(201);
    expect((await t.post(`${o.c2}/restore`, {}, { token: o.token })).body.code).toBe('NOT_ARCHIVED');
  });

  it('erases it once the 8 years are up, leaving the account and its other business', async () => {
    const o = await twoBusinesses();
    await t.post(`${o.c2}/archive`, { confirmName: 'Konkan Exports', password: o.password }, { token: o.token });
    // Not yet due.
    expect(await purgeDueCompanies(live(), log)).toBe(0);
    const row = await companyRow(o.second.id!);
    t.setNow(new Date(row.purgeAfter!.getTime() + 60_000));
    expect(await purgeDueCompanies(live(), log)).toBe(1);

    expect(await companyRow(o.second.id!)).toBeUndefined();
    for (const scoped of (await companyTables(t.deps.db, new Set(['accounts', 'users', 'webhook_events', 'platform_audit_events']))).values()) {
      const left = await t.deps.db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(scoped.table)} where ${scoped.where(o.second.id!)}`);
      expect([scoped.table, Number(left.rows[0].n)]).toEqual([scoped.table, 0]);
    }
    expect(await companyRow(o.company.id!)).toBeTruthy();
    const audit = await t.deps.db.select().from(schema.platformAuditEvents).where(eq(schema.platformAuditEvents.targetId, o.second.id!));
    expect(audit.map((a) => a.action)).toEqual(['company.purged']);
  });
});
