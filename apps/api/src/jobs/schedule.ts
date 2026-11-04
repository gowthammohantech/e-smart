import type { Deps } from '../context';
import { enqueueOnce } from './queue';

/** India Standard Time, where the business day turns over. */
const IST_OFFSET_MS = 330 * 60_000;

export type Schedule =
  /** Every `minutes`, aligned to the clock (every 5 minutes: :00, :05, …). */
  | { kind: string; everyMinutes: number }
  /** Once a day, at or after `hour:minute` IST. */
  | { kind: string; dailyAt: { hour: number; minute: number } };

/**
 * The period a schedule is in now, or null before a daily one's time. The key is what makes the
 * period's job unique across instances: `recurring-expenses:2026-11-03`.
 */
export function periodKey(s: Schedule, now: Date): string | null {
  if ('everyMinutes' in s) {
    const size = s.everyMinutes * 60_000;
    return `${s.kind}:${new Date(Math.floor(now.getTime() / size) * size).toISOString()}`;
  }
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  if (minutes < s.dailyAt.hour * 60 + s.dailyAt.minute) return null;
  return `${s.kind}:${ist.toISOString().slice(0, 10)}`;
}

/** Queues every schedule's current period that isn't queued yet. Safe to call from every instance, often. */
export async function tickSchedules(deps: Pick<Deps, 'db' | 'now'>, schedules: Schedule[]): Promise<string[]> {
  const now = deps.now();
  const queued: string[] = [];
  for (const s of schedules) {
    const key = periodKey(s, now);
    if (!key) continue;
    const id = await enqueueOnce(deps.db, key, s.kind, { period: key }, { runAt: now });
    if (id) queued.push(key);
  }
  return queued;
}
