import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { schema } from '@esmart/db';
import { enqueue, enqueueOnce } from '../src/jobs/queue';
import { periodKey, tickSchedules } from '../src/jobs/schedule';
import { backoffMs, createWorker, type JobHandler } from '../src/jobs/worker';
import { setupApi } from './helpers';

const t = setupApi();
const quiet = { info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} };
const J = schema.jobs;
const jobRow = async (id: string) => (await t.deps.db.select().from(J).where(eq(J.id, id)))[0];

describe('job queue', () => {
  it('runs each job exactly once with two workers taking from the same queue', async () => {
    const seen: string[] = [];
    const handlers: Record<string, JobHandler> = {
      'test.count': async ({ payload }) => {
        await new Promise((r) => setTimeout(r, Math.random() * 5));
        seen.push(String(payload.n));
      },
    };
    for (let n = 0; n < 50; n++) await enqueue(t.deps.db, 'test.count', { n });
    const a = createWorker(t.deps, handlers, { concurrency: 5, log: quiet });
    const b = createWorker(t.deps, handlers, { concurrency: 5, log: quiet });
    const drain = async (w: typeof a) => {
      while ((await w.drainOnce()) > 0);
    };
    await Promise.all([drain(a), drain(b)]);
    expect(seen).toHaveLength(50);
    expect(new Set(seen).size).toBe(50);
    expect(await t.deps.db.select().from(J).where(eq(J.status, 'done'))).toHaveLength(50);
  });

  it('takes back a job whose worker died, once its lease lapses', async () => {
    const id = (await enqueue(t.deps.db, 'test.ok'))!;
    // A worker took it, then the process was killed: running, lease already over.
    await t.deps.db.update(J).set({ status: 'running', attempts: 1, lockedUntil: new Date(Date.now() - 1000) }).where(eq(J.id, id));
    let ran = 0;
    const w = createWorker(t.deps, { 'test.ok': async () => void ran++ }, { log: quiet });
    await w.drainOnce();
    expect(ran).toBe(1);
    expect(await jobRow(id)).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('retries a failing job later, then gives up', async () => {
    const id = (await enqueue(t.deps.db, 'test.fail', {}, { maxAttempts: 2 }))!;
    const w = createWorker(t.deps, { 'test.fail': async () => Promise.reject(new Error('portal down')) }, { log: quiet });
    await w.drainOnce();
    const first = await jobRow(id);
    expect(first).toMatchObject({ status: 'queued', attempts: 1, lastError: 'Error: portal down' });
    expect(first.runAt.getTime()).toBeGreaterThan(Date.now() + 25_000);
    // Not due yet.
    expect(await w.drainOnce()).toBe(0);
    t.setNow(new Date(first.runAt.getTime() + 1000));
    await w.drainOnce();
    expect(await jobRow(id)).toMatchObject({ status: 'dead', attempts: 2 });
  });

  it('backs off exponentially up to an hour', () => {
    expect(backoffMs(1)).toBeGreaterThanOrEqual(30_000);
    expect(backoffMs(3)).toBeGreaterThanOrEqual(120_000);
    expect(backoffMs(20)).toBeLessThanOrEqual(3_600_000 * 1.2);
  });

  it('queues one job per unique key while it waits, and leaves none behind a rolled-back change', async () => {
    expect(await enqueue(t.deps.db, 'test.ok', {}, { uniqueKey: 'backup:cmp_1' })).toBeTruthy();
    expect(await enqueue(t.deps.db, 'test.ok', {}, { uniqueKey: 'backup:cmp_1' })).toBeNull();
    await expect(
      t.deps.db.transaction(async (tx) => {
        await enqueue(tx, 'test.ok', { lost: true });
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');
    expect(await t.deps.db.select().from(J)).toHaveLength(1);
  });

  it('queues a scheduled period once, even after it ran and from several instances at once', async () => {
    const results = await Promise.all([1, 2, 3].map(() => enqueueOnce(t.deps.db, 'test.daily:2026-11-03', 'test.ok')));
    expect(results.filter(Boolean)).toHaveLength(1);
    const w = createWorker(t.deps, { 'test.ok': async () => {} }, { log: quiet });
    await w.drainOnce();
    expect(await enqueueOnce(t.deps.db, 'test.daily:2026-11-03', 'test.ok')).toBeNull();
    expect(await t.deps.db.select().from(J)).toHaveLength(1);
  });

  it('hands unfinished jobs back to the queue on shutdown', async () => {
    const id = (await enqueue(t.deps.db, 'test.slow'))!;
    let release!: () => void;
    const w = createWorker(t.deps, { 'test.slow': () => new Promise<void>((r) => (release = r)) }, { log: quiet, pollMs: 10 });
    w.start();
    await new Promise((r) => setTimeout(r, 100));
    await w.stop(50);
    expect(await jobRow(id)).toMatchObject({ status: 'queued', attempts: 0, lockedUntil: null });
    release();
  });
});

describe('schedules', () => {
  it('names periods in IST and waits for a daily time', () => {
    // 2026-11-03 00:05 IST is 2026-11-02 18:35 UTC.
    expect(periodKey({ kind: 'x', dailyAt: { hour: 0, minute: 10 } }, new Date('2026-11-02T18:35:00Z'))).toBeNull();
    expect(periodKey({ kind: 'x', dailyAt: { hour: 0, minute: 10 } }, new Date('2026-11-02T18:41:00Z'))).toBe('x:2026-11-03');
    expect(periodKey({ kind: 'x', everyMinutes: 5 }, new Date('2026-11-02T18:41:30Z'))).toBe('x:2026-11-02T18:40:00.000Z');
  });

  it('queues each due schedule once per period', async () => {
    t.setNow('2026-11-02T18:41:00Z');
    const schedules = [
      { kind: 'test.ok', everyMinutes: 5 },
      { kind: 'test.daily', dailyAt: { hour: 0, minute: 10 } },
    ];
    expect(await tickSchedules(t.deps, schedules)).toHaveLength(2);
    expect(await tickSchedules(t.deps, schedules)).toHaveLength(0);
    t.setNow('2026-11-02T18:46:00Z');
    expect(await tickSchedules(t.deps, schedules)).toEqual(['test.ok:2026-11-02T18:45:00.000Z']);
  });
});

describe('health and request ids', () => {
  it('reports the job queue falling behind', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/health/worker' })).json()).toMatchObject({ ok: true, oldestDueSeconds: 0 });
    await t.deps.db.insert(J).values({ id: 'job_old', kind: 'test.ok', runAt: new Date(Date.now() - 20 * 60_000) });
    const late = await t.app.inject({ method: 'GET', url: '/health/worker' });
    expect(late.statusCode).toBe(503);
    expect(late.json().oldestDueSeconds).toBeGreaterThan(900);
  });

  it('keeps a request id it was given, and sends one back', async () => {
    const given = await t.app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'req-from-railway' } });
    expect(given.headers['x-request-id']).toBe('req-from-railway');
    expect((await t.app.inject({ method: 'GET', url: '/health' })).headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
