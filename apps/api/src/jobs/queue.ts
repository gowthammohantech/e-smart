import { sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { DbOrTx } from '../lib/audit';
import { newId } from '../lib/ids';

export type EnqueueOptions = {
  /** Not before this time. */
  runAt?: Date;
  /** While a job with this key is waiting or running, another is not queued. */
  uniqueKey?: string;
  maxAttempts?: number;
};

/**
 * Queues a job. Called inside the caller's transaction, the job exists only if that change commits,
 * so a rolled-back write never leaves work behind for something that didn't happen. Returns the id,
 * or null when a job with the same `uniqueKey` is already waiting or running.
 */
export async function enqueue(db: DbOrTx, kind: string, payload: Record<string, unknown> = {}, opts: EnqueueOptions = {}): Promise<string | null> {
  const id = newId('job');
  const rows = await db
    .insert(schema.jobs)
    .values({ id, kind, payload, runAt: opts.runAt ?? new Date(), uniqueKey: opts.uniqueKey ?? null, maxAttempts: opts.maxAttempts ?? 5 })
    .onConflictDoNothing({ target: schema.jobs.uniqueKey, where: sql`${schema.jobs.uniqueKey} IS NOT NULL AND ${schema.jobs.status} IN ('queued', 'running')` })
    .returning({ id: schema.jobs.id });
  return rows[0]?.id ?? null;
}

/**
 * Queues a scheduled period's job once, however many API instances try at the same moment: the
 * first to record the period key queues it, the rest see the key taken and do nothing.
 */
export async function enqueueOnce(db: DbOrTx & { transaction: (fn: (tx: DbOrTx) => Promise<unknown>) => Promise<unknown> }, periodKey: string, kind: string, payload: Record<string, unknown> = {}, opts: Omit<EnqueueOptions, 'uniqueKey'> = {}): Promise<string | null> {
  let queued: string | null = null;
  await db.transaction(async (tx) => {
    const id = newId('job');
    const claimed = await tx.insert(schema.jobScheduleRuns).values({ key: periodKey, jobId: id }).onConflictDoNothing().returning({ key: schema.jobScheduleRuns.key });
    if (!claimed.length) return;
    await tx.insert(schema.jobs).values({ id, kind, payload, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 });
    queued = id;
  });
  return queued;
}
