import { and, eq, lt, or } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { purgeIdempotencyKeys } from '../http/idempotency';
import { reconcileEInvoices } from '../modules/compliance/einvoice';
import { recoverComplianceAttempts } from '../modules/compliance/recovery';
import { materializeRecurringExpenses } from '../modules/expenses/engine';
import { deleteExpiredExports, failExport, queueDueBackups, runExport } from '../modules/exports/handlers';
import { checkPushReceipts, sendPush } from '../lib/notify';
import { notifyOverdueInvoices } from '../modules/documents/overdue';
import { runQueuedExtraction } from '../modules/ocr/handlers';
import { purgeDueAccounts } from '../modules/platform/purge';
import { backupDatabase } from './dbBackup';
import type { Schedule } from './schedule';
import type { JobHandler } from './worker';

const DAY_MS = 86_400_000;

/** Finished jobs are kept a while for looking into, then dropped; failed ones longer. */
async function pruneJobs({ deps }: Parameters<JobHandler>[0]) {
  const now = deps.now().getTime();
  const J = schema.jobs;
  await deps.db
    .delete(J)
    .where(or(and(eq(J.status, 'done'), lt(J.finishedAt, new Date(now - 14 * DAY_MS))), and(eq(J.status, 'dead'), lt(J.finishedAt, new Date(now - 90 * DAY_MS)))));
  await deps.db.delete(schema.jobScheduleRuns).where(lt(schema.jobScheduleRuns.createdAt, new Date(now - 90 * DAY_MS)));
}

/** Every job kind and what runs it. Each must be safe to run twice. */
export const JOB_HANDLERS: Record<string, JobHandler> = {
  'idempotency.purge': ({ deps }) => purgeIdempotencyKeys(deps),
  'einvoice.reconcile': async ({ deps }) => {
    await reconcileEInvoices(deps);
  },
  'jobs.prune': pruneJobs,
  'compliance.recover': async ({ deps }) => {
    await recoverComplianceAttempts(deps);
  },
  'expenses.recur': async ({ deps }) => {
    await materializeRecurringExpenses(deps, deps.now());
  },
  'export.build': async ({ deps, payload, job }) => {
    try {
      await runExport(deps, payload as { exportId: string });
    } catch (err) {
      // Out of tries: the app stops waiting on it.
      if (job.attempts >= job.maxAttempts) await failExport(deps, String(payload.exportId));
      throw err;
    }
  },
  'backups.due': async ({ deps }) => {
    await queueDueBackups(deps);
  },
  'exports.expire': async ({ deps }) => {
    await deleteExpiredExports(deps);
  },
  'ocr.extract': ({ deps, payload }) => runQueuedExtraction(deps, String(payload.extractionId)),
  'accounts.purge': async ({ deps, log }) => {
    await purgeDueAccounts(deps, log);
  },
  'db.backup': async ({ deps, log }) => {
    if (!deps.config.DB_BACKUP_ENABLED) return;
    log.info(await backupDatabase(deps), 'database backed up');
  },
  'push.send': async ({ deps, payload }) => {
    await sendPush(deps, String(payload.notificationId));
  },
  'push.receipts': async ({ deps, payload }) => {
    await checkPushReceipts(deps, (payload.tickets ?? []) as { token: string; ticketId: string }[]);
  },
  'invoices.overdue': async ({ deps }) => {
    await notifyOverdueInvoices(deps);
  },
};

/** What runs on its own, and when. */
export const SCHEDULES: Schedule[] = [
  { kind: 'idempotency.purge', everyMinutes: 60 },
  { kind: 'einvoice.reconcile', everyMinutes: 5 },
  { kind: 'compliance.recover', everyMinutes: 5 },
  { kind: 'jobs.prune', dailyAt: { hour: 3, minute: 30 } },
  { kind: 'db.backup', dailyAt: { hour: 2, minute: 0 } },
  // After midnight IST, so the day's recurring expenses carry the new date.
  { kind: 'expenses.recur', dailyAt: { hour: 0, minute: 10 } },
  { kind: 'backups.due', everyMinutes: 60 },
  { kind: 'exports.expire', dailyAt: { hour: 4, minute: 0 } },
  { kind: 'accounts.purge', dailyAt: { hour: 4, minute: 30 } },
  // In the morning, when people are at work.
  { kind: 'invoices.overdue', dailyAt: { hour: 9, minute: 30 } },
];
