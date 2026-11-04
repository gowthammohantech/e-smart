import type { Deps } from '../context';
import { JOB_HANDLERS, SCHEDULES } from './registry';
import { tickSchedules } from './schedule';
import { createWorker } from './worker';

export { enqueue, enqueueOnce } from './queue';

type Log = Parameters<typeof createWorker>[2]['log'];

/**
 * Starts the scheduler and the worker for this process. The scheduler ticks every 30 s on every
 * instance; the period keys make that safe. Returns a stop that drains running jobs first.
 */
export function startBackground(deps: Deps, log: Log, opts: { concurrency: number }) {
  const worker = createWorker(deps, JOB_HANDLERS, { concurrency: opts.concurrency, log });
  const tick = () => void tickSchedules(deps, SCHEDULES).catch((err) => log.warn({ err }, 'schedule tick failed'));
  const ticker = setInterval(tick, 30_000);
  tick();
  worker.start();
  return async () => {
    clearInterval(ticker);
    await worker.stop();
  };
}
