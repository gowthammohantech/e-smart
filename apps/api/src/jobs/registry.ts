import { and, eq, lt, or } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { purgeIdempotencyKeys } from '../http/idempotency';
import { reconcileEInvoices } from '../modules/compliance/einvoice';
import { recoverComplianceAttempts } from '../modules/compliance/recovery';
import { materializeRecurringExpenses } from '../modules/expenses/engine';
import { issueRecurringInvoices } from '../modules/documents/recurring';
import { deleteExpiredExports, failExport, queueDueBackups, runExport } from '../modules/exports/handlers';
import { checkPushReceipts, sendPush } from '../lib/notify';
import { reverseUnpaidItc } from '../modules/documents/itcReversal';
import { recoverLostFilings } from '../modules/gst/filing';
import { remindMsmeDue } from '../modules/ledger/msme';
import { fetchDueGstr2b } from '../modules/gst/gstr2b';
import { notifyOverdueInvoices } from '../modules/documents/overdue';
import { runQueuedExtraction } from '../modules/ocr/handlers';
import { purgeDueAccounts, purgeDueCompanies } from '../modules/platform/purge';
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
  'invoices.recur': async ({ deps }) => {
    await issueRecurringInvoices(deps, deps.now());
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
    await purgeDueCompanies(deps, log);
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
  'itc.reversal180': async ({ deps, log }) => {
    log.info(await reverseUnpaidItc(deps), 'input tax credit reversals');
  },
  'msme.reminders': async ({ deps, log }) => {
    const sent = await remindMsmeDue(deps);
    if (sent) log.info({ sent }, 'MSME payment reminders sent');
  },
  'gst.returns.recover': async ({ deps, log }) => {
    const settled = await recoverLostFilings(deps);
    if (settled) log.info({ settled }, 'lost GST return filings settled');
  },
  'gstr2b.fetch': async ({ deps, log }) => {
    log.info({ fetched: await fetchDueGstr2b(deps) }, 'GSTR-2B downloaded');
  },
  // The public demo: built if missing, rebuilt when a week old or its dataset changed (src/demo).
  'demo.refresh': async ({ deps, log }) => {
    const { ensurePublicDemo } = await import('../demo/seed');
    log.info({ outcome: await ensurePublicDemo(deps, log as never) }, 'public demo checked');
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
  { kind: 'invoices.recur', dailyAt: { hour: 0, minute: 15 } },
  { kind: 'backups.due', everyMinutes: 60 },
  { kind: 'exports.expire', dailyAt: { hour: 4, minute: 0 } },
  { kind: 'accounts.purge', dailyAt: { hour: 4, minute: 30 } },
  // In the morning, when people are at work.
  { kind: 'invoices.overdue', dailyAt: { hour: 9, minute: 30 } },
  { kind: 'itc.reversal180', dailyAt: { hour: 5, minute: 0 } },
  // GSTN makes last month's GSTR-2B on the 14th; from then, each day until it's in.
  { kind: 'gstr2b.fetch', dailyAt: { hour: 9, minute: 0 } },
  // A return whose filing answer was lost: the portal's tracker says whether it went through.
  { kind: 'gst.returns.recover', everyMinutes: 15 },
  // A week before a micro or small supplier's bill passes its legal limit, and once it has.
  { kind: 'msme.reminders', dailyAt: { hour: 8, minute: 30 } },
  // Early morning IST, when hardly anyone is trying the demo; it only rebuilds once a week.
  { kind: 'demo.refresh', dailyAt: { hour: 3, minute: 45 } },
];
