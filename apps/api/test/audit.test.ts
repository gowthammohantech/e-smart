import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { MUMBAI, ownerWithCompany, setupApi } from './helpers';
import { joinTeam } from './team-helpers';

const t = setupApi();

const customer = (name: string) => ({ kind: 'customer', name, currency: 'INR', billingAddress: MUMBAI, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 0 });

describe('audit events', () => {
  it('lists newest first with filters and a cursor that loses nothing', async () => {
    const { token, c, company, user } = await ownerWithCompany(t);
    const ids: string[] = [];
    for (const name of ['A', 'B', 'C', 'D']) ids.push((await t.post(`${c}/parties`, customer(name), { token })).body.id);
    await t.put(`${c}/parties/${ids[0]}`, customer('A2'), { token });

    const all = await t.get(`${c}/audit-events`, { token, query: { entityType: 'party' } });
    expect(all.body.data).toHaveLength(5);
    expect(all.body.data[0]).toMatchObject({ action: 'updated', entityId: ids[0], entityLabel: 'A2', actorId: user.id, actorName: 'Priya Shah' });
    expect(JSON.parse(all.body.data[0].before).name).toBe('A');
    expect(JSON.parse(all.body.data[0].after).name).toBe('A2');

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await t.get(`${c}/audit-events`, { token, query: { limit: 2, cursor } });
      seen.push(...page.body.data.map((e: { id: string }) => e.id));
      cursor = page.body.nextCursor ?? undefined;
    } while (cursor);
    const total = await t.deps.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.companyId, company.id!));
    expect(seen).toHaveLength(total.length);
    expect(new Set(seen).size).toBe(total.length);

    const one = await t.get(`${c}/audit-events`, { token, query: { entityId: ids[2] } });
    expect(one.body.data.map((e: { entityLabel: string }) => e.entityLabel)).toEqual(['C']);
    const byActor = await t.get(`${c}/audit-events`, { token, query: { actorId: 'usr_nobody' } });
    expect(byActor.body.data).toEqual([]);
  });

  it('filters by date', async () => {
    const { token, c, company, user } = await ownerWithCompany(t);
    await t.deps.db.insert(schema.auditEvents).values([
      { id: 'aud_old', companyId: company.id!, actorId: user.id!, actorName: 'Priya', action: 'created', entityType: 'party', entityId: 'p1', entityLabel: 'Old', createdAt: new Date('2026-01-10T12:00:00Z') },
      { id: 'aud_mid', companyId: company.id!, actorId: user.id!, actorName: 'Priya', action: 'created', entityType: 'party', entityId: 'p2', entityLabel: 'Mid', createdAt: new Date('2026-02-15T23:59:00Z') },
    ]);
    const res = await t.get(`${c}/audit-events`, { token, query: { from: '2026-02-01', to: '2026-02-15' } });
    expect(res.body.data.map((e: { id: string }) => e.id)).toEqual(['aud_mid']);
  });

  it('is for owners, admins and accountants only, and per company', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const other = await ownerWithCompany(t);
    const sales = await joinTeam(t, token, { role: 'sales', companyIds: [company.id!] });
    expect((await t.get(`${c}/audit-events`, { token: sales.token })).status).toBe(403);
    const foreign = await t.get(`${other.c}/audit-events`, { token });
    expect(foreign.status).toBe(403);
  });

  it('rejects a cursor it did not issue', async () => {
    const { token, c } = await ownerWithCompany(t);
    const res = await t.get(`${c}/audit-events`, { token, query: { cursor: 'garbage' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CURSOR');
  });
});
