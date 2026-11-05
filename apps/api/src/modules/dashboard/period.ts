import type { Schema } from '@esmart/api-contract';
import { periodOf, previousPeriod, trendBuckets, type Bucket, type DashboardRange, type Grain, type Period } from '@esmart/core/domain/dashboard';
import { businessDate } from '@esmart/core/lib/date';
import type { AuthUser, CompanyRow } from '../../context';
import { forbidden, invalid } from '../../http/errors';

export { periodOf };

type PeriodQuery = { range?: DashboardRange; from?: string; to?: string; compare?: 'none' | 'previous'; grain?: Grain; branchId?: string };

/** What every hub works from: the day it is in India, the period and the one before, the trend buckets, and the branches. */
export type HubScope = {
  today: string;
  period: Period;
  previous?: Period;
  grain: Grain;
  buckets: Bucket[];
  branchId?: string;
  /** The branches the figures cover; empty is every branch. */
  branches: string[];
  wire: Schema<'DashboardPeriod'>;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The branches a hub covers: the one asked for, which must be one the user works in, or every
 * branch the user may see (all of them when the user isn't limited).
 */
export function branchScope(user: AuthUser, branchId?: string): string[] {
  if (!branchId) return user.branchIds;
  if (user.branchIds.length && !user.branchIds.includes(branchId)) throw forbidden('BRANCH_NOT_ALLOWED', 'You do not work in this branch');
  return [branchId];
}

/** The hub's period, from `range` (or `from`/`to` with `custom`), `compare` and `grain`. Today is India's date: the server's clock is UTC. */
export function hubScope(ctx: { now: Date; company: CompanyRow; user: AuthUser; query: PeriodQuery }): HubScope {
  const q = ctx.query;
  const today = businessDate(ctx.now);
  const range = q.range ?? 'month';
  if (range === 'custom') {
    if (!q.from || !ISO.test(q.from)) throw invalid('from', 'A custom period needs its first day');
    if (!q.to || !ISO.test(q.to)) throw invalid('to', 'A custom period needs its last day');
    if (q.from > q.to) throw invalid('from', 'The range starts after it ends');
  }
  const period = periodOf(range, today, ctx.company.fiscalYearStartMonth, { from: q.from, to: q.to });
  const previous = q.compare === 'previous' ? previousPeriod(period) : undefined;
  const { grain, buckets } = trendBuckets(period, q.grain ?? 'month');
  return {
    today,
    period,
    previous,
    grain,
    buckets,
    branchId: q.branchId,
    branches: branchScope(ctx.user, q.branchId),
    wire: { range, from: period.from, to: period.to, grain, ...(previous ? { previous } : {}) },
  };
}
