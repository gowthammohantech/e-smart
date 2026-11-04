import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Deps } from '../context';
import { reportError } from '../lib/reporter';

type JobRow = typeof schema.jobs.$inferSelect;
type Log = { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void; error: (o: object, m?: string) => void; fatal: (o: object, m?: string) => void };

export type JobContext = { deps: Deps; payload: Record<string, unknown>; job: JobRow; log: Log };
/** Must be safe to run twice: a worker can die after the work but before marking it done. */
export type JobHandler = (ctx: JobContext) => Promise<void>;

/** How long a claimed job is held. A worker that dies mid-job lets it lapse and another takes the job. */
const LEASE_MS = 5 * 60_000;

/** 30 s, 1 min, 2 min… capped at an hour, with up to 20 % jitter so failures don't retry in lockstep. */
export function backoffMs(attempts: number): number {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
  return Math.round(base * (1 + Math.random() * 0.2));
}

export type WorkerOptions = { concurrency?: number; pollMs?: number; log: Log };

/**
 * Runs queued jobs. Several workers, in one process or many, share the queue safely: a job is
 * claimed with FOR UPDATE SKIP LOCKED, so two never take the same one.
 */
export function createWorker(deps: Deps, handlers: Record<string, JobHandler>, opts: WorkerOptions) {
  const concurrency = opts.concurrency ?? 2;
  const running = new Map<string, Promise<void>>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopping = false;

  /** Takes up to `n` due jobs: queued ones whose time has come, and running ones whose lease lapsed. */
  async function claim(n: number): Promise<JobRow[]> {
    if (n <= 0) return [];
    const now = deps.now();
    const J = schema.jobs;
    const kinds = Object.keys(handlers);
    if (!kinds.length) return [];
    const result = await deps.db.execute<JobRow>(sql`
      UPDATE ${J}
      SET status = 'running', attempts = ${J.attempts} + 1, locked_until = ${new Date(now.getTime() + LEASE_MS).toISOString()}::timestamptz
      WHERE ${J.id} IN (
        SELECT ${J.id} FROM ${J}
        WHERE ${inArray(J.kind, kinds)}
          AND ((${J.status} = 'queued' AND ${J.runAt} <= ${now.toISOString()}::timestamptz)
            OR (${J.status} = 'running' AND ${J.lockedUntil} < ${now.toISOString()}::timestamptz))
        ORDER BY ${J.runAt}
        LIMIT ${n}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`);
    return (result.rows as unknown as Record<string, unknown>[]).map(fromRow);
  }

  async function finish(job: JobRow, err: unknown) {
    const now = deps.now();
    const J = schema.jobs;
    if (!err) {
      await deps.db.update(J).set({ status: 'done', finishedAt: now, lockedUntil: null, lastError: null }).where(eq(J.id, job.id));
      return;
    }
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    if (job.attempts >= job.maxAttempts) {
      await deps.db.update(J).set({ status: 'dead', finishedAt: now, lockedUntil: null, lastError: message.slice(0, 2000) }).where(eq(J.id, job.id));
      reportError(opts.log, err, { source: `job:${job.kind}`, jobId: job.id, attempts: job.attempts });
      return;
    }
    await deps.db
      .update(J)
      .set({ status: 'queued', runAt: new Date(now.getTime() + backoffMs(job.attempts)), lockedUntil: null, lastError: message.slice(0, 2000) })
      .where(eq(J.id, job.id));
    opts.log.warn({ jobId: job.id, kind: job.kind, attempts: job.attempts, err: message }, 'job failed; will retry');
  }

  async function run(job: JobRow) {
    const handler = handlers[job.kind];
    let failure: unknown = null;
    try {
      await handler({ deps, payload: (job.payload ?? {}) as Record<string, unknown>, job, log: opts.log });
    } catch (err) {
      failure = err ?? new Error('job failed');
    }
    await finish(job, failure);
  }

  /** One pass: claims what fits and runs it. Resolves when those jobs are done. Used by tests directly. */
  async function drainOnce(): Promise<number> {
    const jobs = await claim(concurrency - running.size);
    await Promise.all(
      jobs.map((job) => {
        const p = run(job).finally(() => running.delete(job.id));
        running.set(job.id, p);
        return p;
      }),
    );
    return jobs.length;
  }

  /** Mark jobs whose lease lapsed after their last attempt as dead, so they don't run forever. */
  async function buryExhausted() {
    const J = schema.jobs;
    await deps.db
      .update(J)
      .set({ status: 'dead', finishedAt: deps.now(), lastError: sql`coalesce(${J.lastError}, 'lease lapsed on the last attempt')` })
      .where(and(eq(J.status, 'running'), lt(J.lockedUntil, deps.now()), sql`${J.attempts} >= ${J.maxAttempts}`));
  }

  function poll() {
    if (stopping || running.size >= concurrency) return;
    void buryExhausted()
      .then(() => claim(concurrency - running.size))
      .then((jobs) => {
        for (const job of jobs) {
          const p = run(job).finally(() => running.delete(job.id));
          running.set(job.id, p);
        }
      })
      .catch((err) => opts.log.warn({ err }, 'job poll failed'));
  }

  return {
    drainOnce,
    buryExhausted,
    start() {
      stopping = false;
      timer ??= setInterval(poll, opts.pollMs ?? 2_000);
      poll();
    },
    /** Stops claiming, waits up to `graceMs` for running jobs, then hands the rest back to the queue. */
    async stop(graceMs = 25_000) {
      stopping = true;
      if (timer) clearInterval(timer);
      timer = null;
      const unfinished = [...running.keys()];
      await Promise.race([Promise.allSettled(running.values()), new Promise((r) => setTimeout(r, graceMs).unref?.())]);
      const left = unfinished.filter((id) => running.has(id));
      if (left.length) {
        await deps.db
          .update(schema.jobs)
          .set({ status: 'queued', lockedUntil: null, attempts: sql`greatest(${schema.jobs.attempts} - 1, 0)` })
          .where(and(inArray(schema.jobs.id, left), eq(schema.jobs.status, 'running')));
      }
    },
  };
}

/** Raw rows come back snake_case; the rest of the code reads the schema's camelCase. */
function fromRow(r: Record<string, unknown>): JobRow {
  const date = (v: unknown) => (v == null ? null : v instanceof Date ? v : new Date(String(v)));
  return {
    id: r.id as string,
    kind: r.kind as string,
    payload: (r.payload ?? {}) as JobRow['payload'],
    status: r.status as JobRow['status'],
    runAt: date(r.run_at)!,
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    lockedUntil: date(r.locked_until),
    lastError: (r.last_error as string | null) ?? null,
    uniqueKey: (r.unique_key as string | null) ?? null,
    createdAt: date(r.created_at)!,
    finishedAt: date(r.finished_at),
  };
}
