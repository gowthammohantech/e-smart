import type { Schema } from '@esmart/api-client';
import { changePct } from '@esmart/core/domain/dashboard';
import { formatDate, monthLabelNarrow } from '@esmart/core/lib/date';
import type { Translate } from '@esmart/core/labels';

type Grain = Schema<'DashboardPeriod'>['grain'];

/** A trend bucket's axis label: the day's number, the week's Monday, or the month. */
export function bucketLabel(key: string, grain: Grain): string {
  if (grain === 'month') return monthLabelNarrow(key);
  return formatDate(key, grain === 'day' ? 'd' : 'd MMM');
}

/** The period's name for a heading: "This month", or the dates of a custom one. */
export function periodTitle(tr: Translate, period: Schema<'DashboardPeriod'> | undefined): string {
  if (!period) return tr('reports:dash.period.month');
  if (period.range !== 'custom') return tr(`reports:dash.period.${period.range}`);
  return period.from === period.to ? formatDate(period.from) : `${formatDate(period.from, 'd MMM')} – ${formatDate(period.to)}`;
}

/** A tile's change against the period before, or undefined when the hub isn't comparing. */
export function delta(current: { minor: number } | number | undefined, previous: { minor: number } | number | undefined, inverse?: boolean) {
  if (current === undefined || previous === undefined) return undefined;
  const cur = typeof current === 'number' ? current : current.minor;
  const prev = typeof previous === 'number' ? previous : previous.minor;
  return { pct: changePct(cur, prev), inverse };
}

/** `MMYYYY` as "Oct 2026". */
export function gstPeriodLabel(period: string): string {
  return formatDate(`${period.slice(2)}-${period.slice(0, 2)}-01`, 'MMM yyyy');
}
