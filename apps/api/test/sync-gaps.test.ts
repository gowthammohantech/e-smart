import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { MUMBAI, ownerWithCompany, setupApi } from './helpers';

/** Lets a test make one entity's GET fail, as a passing database error would. */
const failing = vi.hoisted(() => ({ url: null as string | null }));
vi.mock('../src/lib/internal', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/lib/internal')>();
  return {
    ...real,
    injectAs: (async (server: never, auth: never, req: { method: string; url: string }) => {
      if (failing.url && req.method === 'GET' && req.url.includes(failing.url)) return { status: 500, body: { code: 'INTERNAL' } };
      return (real.injectAs as (...args: unknown[]) => unknown)(server, auth, req);
    }) as typeof real.injectAs,
  };
});

const t = setupApi();

const customer = (name: string) => ({ kind: 'customer', name, currency: 'INR', billingAddress: MUMBAI, openingBalance: { minor: 0, currency: 'INR' }, paymentTermsDays: 30 });
const queuedAt = '2026-09-20T10:00:00Z';

async function draftInvoice(token: string, c: string, companyId: string) {
  const [tax] = (await t.deps.db.select().from(schema.taxCategories).where(eq(schema.taxCategories.companyId, companyId))).filter((x) => Number(x.rate) === 18);
  const party = await t.post(`${c}/parties`, customer('Sunrise'), { token });
  const doc = await t.post(
    `${c}/documents`,
    { kind: 'invoice', status: 'draft', partyId: party.body.id, date: '2026-09-20', currency: 'INR', lines: [{ name: 'Steel rod', quantity: 2, unit: 'NOS', unitPrice: { minor: 50000, currency: 'INR' }, taxCategoryId: tax.id }] },
    { token },
  );
  expect(doc.status).toBe(201);
  // PATCH takes the whole editable document, not just the fields that changed.
  const { kind, partyId, date, currency, lines } = doc.body;
  const edit = (notes: string) => ({ kind, partyId, date, currency, lines, notes });
  return { id: doc.body.id as string, version: doc.body.version as number, edit };
}

describe('sync push replay', () => {
  it('A3: a second entry for an offline id already created does not create another', async () => {
    const { token, c } = await ownerWithCompany(t);
    const first = await t.post('/sync/push', { mutations: [{ id: randomUUID(), method: 'POST', path: `${c}/parties`, body: customer('Once'), clientEntityId: 'pty_offline_dup', queuedAt }] }, { token });
    expect(first.body.results[0].status).toBe('applied');

    const again = await t.post('/sync/push', { mutations: [{ id: randomUUID(), method: 'POST', path: `${c}/parties`, body: customer('Once'), clientEntityId: 'pty_offline_dup', queuedAt }] }, { token });

    expect(again.body.results[0]).toMatchObject({ status: 'applied', entity: { id: first.body.results[0].entity.id } });
    expect((await t.get(`${c}/parties`, { token })).body.data).toHaveLength(1);
  });

  it('A4: a request still running is not recorded as a final rejection', async () => {
    const { token, c } = await ownerWithCompany(t);
    const id = randomUUID();
    const path = `${c}/parties`;
    const body = customer('In progress');
    // What a crash, or a first push still running, leaves behind.
    await t.post('/sync/push', { mutations: [{ id, method: 'POST', path, body, queuedAt }] }, { token });
    await t.deps.db.delete(schema.syncMutations).where(eq(schema.syncMutations.id, id));
    await t.deps.db.update(schema.idempotencyKeys).set({ responseStatus: null, responseBody: null }).where(eq(schema.idempotencyKeys.key, id));

    const res = await t.post('/sync/push', { mutations: [{ id, method: 'POST', path, body, queuedAt }] }, { token });

    expect(res.body.results[0].error?.code).toBe('IDEMPOTENT_REQUEST_IN_PROGRESS');
    expect(res.body.results[0].status).not.toBe('rejected');
    expect(await t.deps.db.select().from(schema.syncMutations).where(eq(schema.syncMutations.id, id))).toHaveLength(0);
  });

  it('runs an entry once when two pushes of it arrive together', async () => {
    const { token, c } = await ownerWithCompany(t);
    const mutation = { id: randomUUID(), method: 'POST', path: `${c}/parties`, body: customer('Together'), clientEntityId: 'pty_together', queuedAt };
    const answers = await Promise.all([t.post('/sync/push', { mutations: [mutation] }, { token }), t.post('/sync/push', { mutations: [mutation] }, { token })]);

    expect(answers.map((a) => a.body.results[0].status).sort()).toEqual(['applied', 'retry']);
    expect((await t.get(`${c}/parties`, { token })).body.data).toHaveLength(1);
  });

  it('takes over an entry whose claim was left by a request that died', async () => {
    const { token, c } = await ownerWithCompany(t);
    const mutation = { id: randomUUID(), method: 'POST', path: `${c}/parties`, body: customer('Revived'), queuedAt };
    await t.post('/sync/push', { mutations: [mutation] }, { token });
    await t.deps.db.update(schema.syncMutations).set({ result: null, appliedAt: new Date(Date.now() - 3_600_000) }).where(eq(schema.syncMutations.id, mutation.id));
    await t.deps.db.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.key, mutation.id));
    await t.deps.db.delete(schema.parties).where(eq(schema.parties.name, 'Revived'));

    const res = await t.post('/sync/push', { mutations: [mutation] }, { token });

    expect(res.body.results[0].status).toBe('applied');
    expect((await t.get(`${c}/parties`, { token })).body.data).toHaveLength(1);
  });

  it('A10: the database refuses a second document with the same number', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const first = await draftInvoice(token, c, company.id!);
    const second = await draftInvoice(token, c, company.id!);
    const set = (id: string) => t.deps.db.update(schema.documents).set({ number: 'INV/DUP/1', status: 'issued' }).where(eq(schema.documents.id, id));
    await set(first.id);
    await expect(set(second.id)).rejects.toThrow();
  });

  it('A10: any number of drafts share the placeholder number, cancelled or not', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const first = await draftInvoice(token, c, company.id!);
    await draftInvoice(token, c, company.id!);
    await t.deps.db.update(schema.documents).set({ status: 'cancelled' }).where(eq(schema.documents.id, first.id));
  });

  it('B1: a finalise with no version runs on the server copy after the edit before it conflicted', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const doc = await draftInvoice(token, c, company.id!);
    expect((await t.patch(`${c}/documents/${doc.id}`, doc.edit('Theirs'), { token })).status).toBe(200);

    const res = await t.post(
      '/sync/push',
      {
        mutations: [
          { id: randomUUID(), method: 'PATCH', path: `${c}/documents/${doc.id}`, body: doc.edit('Mine'), baseVersion: doc.version, queuedAt },
          { id: randomUUID(), method: 'POST', path: `${c}/documents/${doc.id}/finalize`, queuedAt },
        ],
      },
      { token },
    );

    // Records today's behaviour: the fix is on the client, which holds the finalise back.
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['conflict', 'applied']);
    expect((await t.get(`${c}/documents/${doc.id}`, { token })).body.notes).toBe('Theirs');
  });

  it('B1: a finalise carrying the version it was queued against conflicts instead', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const doc = await draftInvoice(token, c, company.id!);
    expect((await t.patch(`${c}/documents/${doc.id}`, doc.edit('Theirs'), { token })).status).toBe(200);

    const res = await t.post('/sync/push', { mutations: [{ id: randomUUID(), method: 'POST', path: `${c}/documents/${doc.id}/finalize`, baseVersion: doc.version, queuedAt }] }, { token });

    expect(res.body.results[0].status).toBe('conflict');
  });
});

describe('sync pull', () => {
  it('A9b: delivers what comes before a failed change, and stops the cursor there', async () => {
    const { token, c } = await ownerWithCompany(t);
    const snap = await t.get('/sync/pull', { token });
    const before = await t.post(`${c}/parties`, customer('Before'), { token });
    const broken = await t.post(`${c}/parties`, customer('Broken'), { token });

    failing.url = `/parties/${broken.body.id}`;
    const first = await t.get('/sync/pull', { token, query: { since: snap.body.cursor } }).finally(() => {
      failing.url = null;
    });
    expect(first.body.hasMore).toBe(true);
    expect(first.body.changes.map((ch: { entityId: string }) => ch.entityId)).toContain(before.body.id);
    expect(first.body.changes.map((ch: { entityId: string }) => ch.entityId)).not.toContain(broken.body.id);

    const second = await t.get('/sync/pull', { token, query: { since: first.body.cursor } });
    expect(second.body.changes.find((ch: { entityId: string }) => ch.entityId === broken.body.id).data.name).toBe('Broken');
  });

  it('A9a: a change committing after a later one is not passed over', async () => {
    const { token, c, company } = await ownerWithCompany(t);
    const party = await t.post(`${c}/parties`, customer('Slow'), { token });
    const snap = await t.get('/sync/pull', { token });

    // A slow transaction takes its seq first, then a quicker one commits past it.
    let commit!: () => void;
    const held = new Promise<void>((resolve) => (commit = resolve));
    let started!: () => void;
    const begun = new Promise<void>((resolve) => (started = resolve));
    const slow = t.deps.db.transaction(async (tx) => {
      await tx.insert(schema.changeLog).values({ companyId: company.id!, entityType: 'party', entityId: party.body.id, op: 'upsert', version: 1 });
      started();
      await held;
    });
    await begun;
    const quick = await t.post(`${c}/parties`, customer('Quick'), { token });

    const during = await t.get('/sync/pull', { token, query: { since: snap.body.cursor } });
    commit();
    await slow;
    const after = await t.get('/sync/pull', { token, query: { since: during.body.cursor } });

    const ids = [...during.body.changes, ...after.body.changes].map((ch: { entityId: string }) => ch.entityId);
    expect(ids).toContain(party.body.id);
    expect(ids).toContain(quick.body.id);
  });

  it('still takes a plain seq cursor from an app that has not updated', async () => {
    const { token, c } = await ownerWithCompany(t);
    const [{ top }] = await t.deps.db.select({ top: sql<number>`max(${schema.changeLog.seq})::int` }).from(schema.changeLog);
    const party = await t.post(`${c}/parties`, customer('After upgrade'), { token });
    const res = await t.get('/sync/pull', { token, query: { since: String(top) } });
    expect(res.body.changes.map((ch: { entityId: string }) => ch.entityId)).toContain(party.body.id);
  });

  it('A9b: a change whose fetch failed is sent again on the next pull', async () => {
    const { token, c } = await ownerWithCompany(t);
    const snap = await t.get('/sync/pull', { token });
    const party = await t.post(`${c}/parties`, customer('Fetched later'), { token });

    failing.url = `/parties/${party.body.id}`;
    let first;
    try {
      first = await t.get('/sync/pull', { token, query: { since: snap.body.cursor } });
    } finally {
      failing.url = null;
    }
    // Refused outright when it's the first change on the page: the cursor doesn't move.
    expect(first.status).toBe(503);

    const second = await t.get('/sync/pull', { token, query: { since: snap.body.cursor } });
    const delivered = second.body.changes.filter((ch: { entityId: string; data?: unknown }) => ch.entityId === party.body.id && ch.data);
    expect(delivered).toHaveLength(1);
  });
});
