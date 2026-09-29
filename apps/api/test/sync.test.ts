import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { MUMBAI, createCompany, ownerWithCompany, setupApi } from './helpers';

const t = setupApi();

const customer = (name: string) => ({ kind: 'customer', name, currency: 'INR', billingAddress: MUMBAI, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 30 });
const queuedAt = '2026-09-20T10:00:00Z';

describe('sync push', () => {
  it('replays creates, maps offline ids, and rewrites them in later paths and bodies', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const [tax] = (await t.deps.db.select().from(schema.taxCategories).where(eq(schema.taxCategories.companyId, company.id!))).filter((x) => Number(x.rate) === 18);
    const offlineParty = 'pty_offline_1';
    const mutations = [
      { id: randomUUID(), method: 'POST', path: `${c}/parties`, body: customer('Made Offline'), clientEntityId: offlineParty, queuedAt },
      {
        id: randomUUID(),
        method: 'POST',
        path: `${c}/documents`,
        body: {
          kind: 'invoice',
          partyId: offlineParty,
          date: '2026-09-20',
          currency: 'INR',
          lines: [{ name: 'Steel rod', quantity: 2, unit: 'NOS', unitPrice: { minor: 50000, currency: 'INR' }, taxCategoryId: tax.id }],
        },
        clientEntityId: 'doc_offline_1',
        queuedAt,
      },
      { id: randomUUID(), method: 'PUT', path: `${c}/parties/${offlineParty}`, body: customer('Renamed Offline'), baseVersion: 1, queuedAt },
    ];
    const res = await t.post('/sync/push', { mutations }, { token });
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['applied', 'applied', 'applied']);
    const partyId = res.body.results[0].entity.id;
    expect(partyId).not.toBe(offlineParty);
    expect(res.body.results[1].entity.partyId).toBe(partyId);
    expect(res.body.results[2].entity).toMatchObject({ id: partyId, name: 'Renamed Offline', version: 2 });

    const maps = await t.deps.db.select().from(schema.clientIdMappings);
    expect(maps.map((m) => [m.clientEntityId, m.entityType, m.serverEntityId]).sort()).toEqual(
      [
        ['doc_offline_1', 'document', res.body.results[1].entity.id],
        [offlineParty, 'party', partyId],
      ].sort(),
    );
    const recorded = await t.deps.db.select().from(schema.syncMutations);
    expect(recorded).toHaveLength(3);
    expect(recorded.every((r) => r.companyId === company.id && r.status === 'applied')).toBe(true);

    // A resend of the same queue entries does not run them again.
    const again = await t.post('/sync/push', { mutations }, { token });
    expect(again.body.results.map((r: { status: string }) => r.status)).toEqual(['applied', 'applied', 'applied']);
    expect((await t.get(`${c}/parties`, { token })).body.data).toHaveLength(1);

    // An id mapped in an earlier push is still rewritten.
    const later = await t.post('/sync/push', { mutations: [{ id: 'queue-entry-7', method: 'DELETE', path: `${c}/parties/${offlineParty}`, queuedAt }] }, { token });
    // The party has an invoice, so the server refuses the delete.
    expect(later.body.results[0]).toMatchObject({ id: 'queue-entry-7', status: 'rejected', error: { code: 'PARTY_IN_USE' } });
  });

  it('reports a stale baseVersion as a conflict with the server copy, and 4xx as rejected', async () => {
    const { token, c } = await ownerWithCompany(t);
    const party = await t.post(`${c}/parties`, customer('Sunrise'), { token });
    await t.put(`${c}/parties/${party.body.id}`, customer('Sunrise Online'), { token });
    const res = await t.post(
      '/sync/push',
      {
        mutations: [
          { id: 'm1', method: 'PUT', path: `${c}/parties/${party.body.id}`, body: customer('Sunrise Offline'), baseVersion: 1, queuedAt },
          { id: 'm2', method: 'POST', path: `${c}/parties`, body: { kind: 'customer' }, queuedAt },
          { id: 'm3', method: 'POST', path: '/sync/push', body: { mutations: [] }, queuedAt },
        ],
      },
      { token },
    );
    const [conflict, invalid, loop] = res.body.results;
    expect(conflict).toMatchObject({ id: 'm1', status: 'conflict', entity: { name: 'Sunrise Online', version: 2 }, error: { code: 'VERSION_MISMATCH' } });
    expect(invalid).toMatchObject({ id: 'm2', status: 'rejected', error: { status: 422 } });
    expect(loop).toMatchObject({ id: 'm3', status: 'rejected', error: { code: 'UNSUPPORTED_MUTATION' } });
    const stored = await t.deps.db.select().from(schema.syncMutations).where(and(eq(schema.syncMutations.id, 'm1')));
    expect(stored[0].status).toBe('conflict');
  });

  it("can't write into another account's company", async () => {
    const { token } = await ownerWithCompany(t);
    const other = await ownerWithCompany(t);
    const res = await t.post('/sync/push', { mutations: [{ id: 'x1', method: 'POST', path: `${other.c}/parties`, body: customer('Intruder'), queuedAt }] }, { token });
    expect(res.body.results[0]).toMatchObject({ status: 'rejected', error: { code: 'COMPANY_ACCESS_DENIED' } });
    expect((await t.get(`${other.c}/parties`, { token: other.token })).body.data).toHaveLength(0);
  });
});

describe('sync pull', () => {
  it('keeps one entity changed in two companies as two changes', async () => {
    const { token, c } = await ownerWithCompany(t);
    const second = await createCompany(t, token, { name: 'Second Co' });
    for (const base of [c, `/companies/${second.id}`]) {
      expect((await t.post(`${base}/integrations/int_sms/connect`, { config: { senderId: 'ELIXIR' } }, { token })).status).toBe(200);
    }
    const pull = await t.get('/sync/pull', { token });
    const sms = pull.body.changes.filter((ch: { entityId: string }) => ch.entityId === 'int_sms');
    expect(sms.map((ch: { companyId: string }) => ch.companyId).sort()).toEqual([c.split('/')[2], second.id].sort());
  });

  it('returns a snapshot, then changes since the cursor with each GET representation', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const a = await t.post(`${c}/parties`, customer('A'), { token });
    const b = await t.post(`${c}/parties`, customer('B'), { token });
    await t.put(`${c}/parties/${a.body.id}`, customer('A2'), { token });
    await t.del(`${c}/parties/${b.body.id}`, { token });

    const snap = await t.get('/sync/pull', { token });
    expect(snap.body.hasMore).toBe(false);
    const byId = new Map(snap.body.changes.map((ch: { entityId: string }) => [ch.entityId, ch]));
    // B was deleted: a snapshot leaves it out. A appears once, at its latest version.
    expect(byId.has(b.body.id)).toBe(false);
    expect(byId.get(a.body.id)).toEqual({ companyId: company.id, entityType: 'party', entityId: a.body.id, op: 'upsert', version: 2, data: (await t.get(`${c}/parties/${a.body.id}`, { token })).body });
    expect((byId.get(company.id) as { data: { name: string } }).data.name).toBe('Vertex Traders');
    // Branches have no single GET; their data comes from the list.
    const branchChange = snap.body.changes.find((ch: { entityType: string }) => ch.entityType === 'branch');
    if (branchChange) expect(branchChange.data.companyId).toBe(company.id);

    const quiet = await t.get('/sync/pull', { token, query: { since: snap.body.cursor } });
    expect(quiet.body).toEqual({ changes: [], cursor: snap.body.cursor, hasMore: false });

    const cParty = await t.post(`${c}/parties`, customer('C'), { token });
    await t.put(`${c}/parties/${cParty.body.id}`, customer('C2'), { token });
    await t.del(`${c}/parties/${a.body.id}`, { token });
    const delta = await t.get('/sync/pull', { token, query: { since: snap.body.cursor } });
    expect(delta.body.changes.map((ch: { entityId: string; op: string; version: number }) => [ch.entityId, ch.op, ch.version])).toEqual([
      [cParty.body.id, 'upsert', 2],
      [a.body.id, 'delete', 3],
    ]);
    expect(delta.body.changes[0].data.name).toBe('C2');
    expect(delta.body.changes[1].data).toBeUndefined();
  });

  it('pages with limit and hasMore, and scopes to reachable companies', async () => {
    const { token, c } = await ownerWithCompany(t);
    const other = await ownerWithCompany(t);
    for (const name of ['A', 'B', 'C']) await t.post(`${c}/parties`, customer(name), { token });
    await t.post(`${other.c}/parties`, customer('Theirs'), { token: other.token });

    const seen: string[] = [];
    let since: string | undefined;
    for (let i = 0; i < 10; i++) {
      const page: { body: { changes: { entityId: string; data?: { name?: string } }[]; cursor: string; hasMore: boolean } } = await t.get('/sync/pull', { token, query: { limit: 2, since } });
      seen.push(...page.body.changes.map((ch) => ch.data?.name ?? ch.entityId));
      since = page.body.cursor;
      if (!page.body.hasMore) break;
    }
    expect(seen).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    expect(seen).not.toContain('Theirs');

    const denied = await t.get('/sync/pull', { token, query: { companyId: other.company.id } });
    expect(denied.status).toBe(403);
    expect((await t.get('/sync/pull', { token, query: { since: 'nope' } })).status).toBe(400);
  });
});
