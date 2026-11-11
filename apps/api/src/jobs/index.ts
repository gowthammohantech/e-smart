import type { Deps } from '../context';
import { asSystem } from '../lib/dbScope';
import { JOB_HANDLERS, SCHEDULES } from './registry';
import { tickSchedules } from './schedule';
import { createWorker } from './worker';

import { enqueue } from './queue';

export { enqueue, enqueueOnce } from './queue';

type Log = Parameters<typeof createWorker>[2]['log'];

/**
 * Starts the scheduler and the worker for this process. The scheduler ticks every 30 s on every
 * instance; the period keys make that safe. Returns a stop that drains running jobs first.
 */
export function startBackground(appDeps: Deps, log: Log, opts: { concurrency: number }) {
  // Jobs sweep every business (recurring invoices, reminders, purges), so they run on the system
  // database, outside row-level security (docs/database/rls.md).
  const deps = asSystem(appDeps);
  const worker = createWorker(deps, JOB_HANDLERS, { concurrency: opts.concurrency, log });
  const tick = () => void tickSchedules(deps, SCHEDULES).catch((err) => log.warn({ err }, 'schedule tick failed'));
  const ticker = setInterval(tick, 30_000);
  tick();
  worker.start();
  // On start-up the demo is checked at once (a new deploy, a new dataset), not at the next 03:45.
  void enqueue(deps.db, 'demo.refresh', {}, { uniqueKey: 'demo.refresh', maxAttempts: 2 }).catch((err) => log.warn({ err }, 'demo check not queued'));
  return async () => {
    clearInterval(ticker);
    await worker.stop();
  };
}
