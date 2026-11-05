import { addDaysISO, daysBetween, financialYearOf } from '../lib/date';

/**
 * The fixed asset register and its depreciation (RULES 6.15).
 *
 * An asset's cost is in the books already: the bill or voucher it was bought on posted it to its
 * account. The register adds what the books can't work out on their own: when it was put to use, how
 * it wears out, and when it went. From that, depreciation is worked out by the day and posted at each
 * month's end (or on the day it is disposed of), never stored, like every other posting (RULES 6.1):
 *
 * - **Straight line** (`slm`): cost less residual value, evenly over the useful life from the day it
 *   was put to use (Companies Act, Schedule II).
 * - **Written down value** (`wdv`): `rate` percent a year of what is left at the start of each
 *   financial year (or of cost, in the year it was put to use), by the days of that year it was in use.
 *
 * Neither takes it below its residual value. Bought before the books began here, an asset brings the
 * depreciation already written off by `openingAsOf`, and depreciates from the day after.
 *
 * Amounts are base-currency paise.
 */

export type DepreciationMethod = 'slm' | 'wdv';

export type FixedAsset = {
  id: string;
  branchId?: string;
  name: string;
  category?: string;
  /** The ledger account its cost sits in: `sys:fixedAssets` or a fixed-asset ledger account (`acc:…`). */
  account: string;
  assetCode?: string;
  acquiredOn: string;
  inUseFrom: string;
  costMinor: number;
  residualMinor: number;
  method: DepreciationMethod;
  /** Straight line: the useful life, in months. */
  lifeMonths?: number;
  /** Written down value: percent a year. */
  rate?: number;
  openingDepreciationMinor: number;
  openingAsOf?: string;
  costCentreId?: string;
  disposedOn?: string;
};

export type DepreciationEntry = { date: string; amountMinor: number };

const monthEnd = (iso: string) => {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
};

export function addMonthsISO(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/** The first day depreciation runs: the day it was put to use, or the day after its opening figure. */
function firstDay(a: FixedAsset): string {
  const afterOpening = a.openingAsOf ? addDaysISO(a.openingAsOf, 1) : a.inUseFrom;
  return afterOpening > a.inUseFrom ? afterOpening : a.inUseFrom;
}

/** Depreciation from `from` (inclusive) through `to` (inclusive), cumulative, given what was written off before `from`. */
type Curve = (to: string) => number;

/** Straight line: what is left to write off, evenly over what is left of the life. */
function straightLine(a: FixedAsset, start: string): Curve {
  const depreciable = Math.max(0, a.costMinor - a.residualMinor);
  const lifeEnd = addMonthsISO(a.inUseFrom, a.lifeMonths ?? 0);
  const span = daysBetween(start, lifeEnd);
  const left = Math.max(0, depreciable - a.openingDepreciationMinor);
  return (to) => {
    if (span <= 0) return left;
    const days = Math.min(span, Math.max(0, daysBetween(start, addDaysISO(to, 1))));
    return Math.round((left * days) / span);
  };
}

/** Written down value: each financial year, the rate on what was left at its start, by the days in use. */
function writtenDown(a: FixedAsset, start: string, fyStartMonth: number): Curve {
  const floor = a.residualMinor;
  const rate = (a.rate ?? 0) / 100;
  // Worked out year by year, from the first day, and kept: a curve is asked for in date order.
  const years: { start: string; end: string; from: string; base: number; days: number; before: number }[] = [];
  let at = start;
  let written = 0;
  let left = a.costMinor - a.openingDepreciationMinor;
  return (to) => {
    while (at <= to) {
      const fy = financialYearOf(at, fyStartMonth);
      const days = daysBetween(fy.start, addDaysISO(fy.end, 1));
      const inYear = Math.max(0, daysBetween(at, addDaysISO(fy.end, 1)));
      const full = Math.min(Math.max(0, left - floor), Math.round((left * rate * inYear) / days));
      years.push({ start: fy.start, end: fy.end, from: at, base: left, days, before: written });
      written += full;
      left -= full;
      at = addDaysISO(fy.end, 1);
    }
    const y = years.find((y) => y.start <= to && to <= y.end) ?? years[years.length - 1];
    if (!y) return 0;
    const elapsed = Math.max(0, daysBetween(y.from, addDaysISO(to, 1)));
    const yearFull = (years[years.indexOf(y) + 1]?.before ?? written) - y.before;
    return y.before + Math.min(yearFull, Math.round((y.base * rate * elapsed) / y.days));
  };
}

/**
 * Depreciation as it posts: an entry at each month's end from the first day through `until` (or the
 * day it was disposed of, whichever comes first), that day's entry for the part month it went.
 */
export function depreciationEntries(a: FixedAsset, until: string, fyStartMonth = 4): DepreciationEntry[] {
  const start = firstDay(a);
  const end = a.disposedOn && a.disposedOn < until ? a.disposedOn : until;
  if (end < start) return [];
  const curve = a.method === 'wdv' ? writtenDown(a, start, fyStartMonth) : straightLine(a, start);
  const out: DepreciationEntry[] = [];
  let before = 0;
  for (let at = monthEnd(start); ; at = monthEnd(addDaysISO(at, 1))) {
    const date = at < end ? at : end;
    const total = curve(date);
    if (total - before) out.push({ date, amountMinor: total - before });
    before = total;
    if (date >= end) break;
  }
  return out;
}

/** What has been written off by the end of `date`: the opening figure and depreciation since. */
export function accumulatedDepreciation(a: FixedAsset, date: string, fyStartMonth = 4): number {
  if (a.openingAsOf && date < a.openingAsOf) return 0;
  return a.openingDepreciationMinor + depreciationEntries(a, date, fyStartMonth).reduce((s, e) => s + e.amountMinor, 0);
}

/** What it stands at in the books at the end of `date`: nothing once disposed of. */
export function bookValue(a: FixedAsset, date: string, fyStartMonth = 4): number {
  if (date < a.acquiredOn || (a.disposedOn && date >= a.disposedOn)) return 0;
  return a.costMinor - accumulatedDepreciation(a, date, fyStartMonth);
}

export const DEPRECIATION = 'sys:depreciation';
export const ACCUMULATED_DEPRECIATION = 'sys:accumulatedDepreciation';
export const ASSET_DISPOSAL = 'sys:assetDisposal';

/**
 * The entries each asset posts through `until`, debit positive:
 * - depreciation, Dr Depreciation / Cr Accumulated depreciation, at each month's end;
 * - depreciation written off before the books began, Dr Opening balances / Cr Accumulated depreciation,
 *   on `openingAsOf`;
 * - disposal, on its day: the cost and what was written off come out of the books, and what it still
 *   stood at goes to Profit or loss on assets sold. What it was sold for is recorded where the money
 *   came in (a receipt voucher, or an invoice) to that same account, so the account is the gain or loss.
 */
export function assetEntries(a: FixedAsset, until: string, fyStartMonth = 4): { date: string; kind: 'opening' | 'depreciation' | 'disposal'; entries: [string, number][] }[] {
  const out: { date: string; kind: 'opening' | 'depreciation' | 'disposal'; entries: [string, number][] }[] = [];
  if (a.openingDepreciationMinor && a.openingAsOf && a.openingAsOf <= until) {
    out.push({ date: a.openingAsOf, kind: 'opening', entries: [['sys:openingDifference', a.openingDepreciationMinor], [ACCUMULATED_DEPRECIATION, -a.openingDepreciationMinor]] });
  }
  for (const e of depreciationEntries(a, until, fyStartMonth)) {
    out.push({ date: e.date, kind: 'depreciation', entries: [[DEPRECIATION, e.amountMinor], [ACCUMULATED_DEPRECIATION, -e.amountMinor]] });
  }
  if (a.disposedOn && a.disposedOn <= until) {
    const written = accumulatedDepreciation(a, a.disposedOn, fyStartMonth);
    out.push({ date: a.disposedOn, kind: 'disposal', entries: [[ACCUMULATED_DEPRECIATION, written], [a.account, -a.costMinor], [ASSET_DISPOSAL, a.costMinor - written]] });
  }
  return out;
}

export type ScheduleRow = {
  assetId: string;
  name: string;
  category?: string;
  account: string;
  /** Cost: at the start, bought in the period, gone in it, at the end. */
  openingCost: number;
  additions: number;
  disposals: number;
  closingCost: number;
  /** Depreciation: written off by the start, for the period, taken out with what went, by the end. */
  openingDepreciation: number;
  depreciation: number;
  depreciationOnDisposals: number;
  closingDepreciation: number;
  openingValue: number;
  closingValue: number;
};

/**
 * The fixed asset schedule for a period, asset by asset, as the notes to the accounts show it: cost and
 * depreciation at the start, what came and went, and at the end. Assets gone before it, or bought after,
 * are left out.
 */
export function assetSchedule(assets: FixedAsset[], range: { from: string; to: string }, fyStartMonth = 4): ScheduleRow[] {
  const dayBefore = addDaysISO(range.from, -1);
  const rows: ScheduleRow[] = [];
  for (const a of assets) {
    if (a.acquiredOn > range.to || (a.disposedOn && a.disposedOn < range.from)) continue;
    const held = a.acquiredOn < range.from;
    const gone = !!a.disposedOn && a.disposedOn <= range.to;
    const openingCost = held ? a.costMinor : 0;
    const additions = held ? 0 : a.costMinor;
    const disposals = gone ? a.costMinor : 0;
    const openingDepreciation = held ? accumulatedDepreciation(a, dayBefore, fyStartMonth) : 0;
    const atEnd = accumulatedDepreciation(a, gone ? a.disposedOn! : range.to, fyStartMonth);
    // Bought before the books began, in the period: what came with it counts as written off at the start.
    const brought = !held && a.openingAsOf && a.openingAsOf <= range.to ? a.openingDepreciationMinor : 0;
    const depreciation = atEnd - openingDepreciation - brought;
    const depreciationOnDisposals = gone ? atEnd : 0;
    const closingDepreciation = openingDepreciation + brought + depreciation - depreciationOnDisposals;
    rows.push({
      assetId: a.id,
      name: a.name,
      category: a.category,
      account: a.account,
      openingCost,
      additions,
      disposals,
      closingCost: openingCost + additions - disposals,
      openingDepreciation: openingDepreciation + brought,
      depreciation,
      depreciationOnDisposals,
      closingDepreciation,
      openingValue: openingCost - openingDepreciation,
      closingValue: openingCost + additions - disposals - closingDepreciation,
    });
  }
  return rows.sort((x, y) => (x.category ?? '').localeCompare(y.category ?? '') || x.name.localeCompare(y.name));
}
