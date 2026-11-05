import { addDaysISO, financialYearOf } from '../lib/date';
import type { Item, StockMovement } from '../types';
import { dueDate as gstr3bDueDate } from './gstr3b';
import { signedQuantity, stockOnHand } from './stockLedger';
import { tdsDepositDue } from './tdsReports';

/**
 * The dashboard's shared vocabulary: which dates a period covers, the period before it, the buckets a
 * trend is drawn in, and the cards built from more than one engine (the filing calendar, dead stock,
 * cash movement). Dates are ISO `yyyy-mm-dd`, amounts base-currency paise.
 */

export type DashboardRange = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
export type Grain = 'day' | 'week' | 'month';
export type Period = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, '0');
/** The last day of month `m` (1-12) of year `y`. */
const monthEnd = (y: number, m: number) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
/** Monday = 0 … Sunday = 6. */
const weekday = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
/** `months` before (negative) or after `yyyy-mm`, as `[year, month]`. */
const shiftMonth = (y: number, m: number, months: number): [number, number] => {
  const total = y * 12 + (m - 1) + months;
  return [Math.floor(total / 12), (total % 12) + 1];
};
const daysIn = (p: Period) => Math.round((Date.parse(p.to) - Date.parse(p.from)) / 86_400_000) + 1;

/**
 * The period `range` names around `today`: the day, the week from Monday, the calendar month or
 * quarter, the company's financial year, or `custom`'s own dates.
 */
export function periodOf(range: DashboardRange, today: string, fiscalYearStartMonth = 4, custom?: Partial<Period>): Period {
  const [y, m] = today.split('-').map(Number);
  switch (range) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const from = addDaysISO(today, -weekday(today));
      return { from, to: addDaysISO(from, 6) };
    }
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: monthEnd(y, m) };
    case 'quarter': {
      const q0 = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${y}-${pad(q0)}-01`, to: monthEnd(y, q0 + 2) };
    }
    case 'year': {
      const fy = financialYearOf(today, fiscalYearStartMonth);
      return { from: fy.start, to: fy.end };
    }
    case 'custom':
      return { from: custom?.from ?? today, to: custom?.to ?? today };
  }
}

/** Whether a period is whole calendar months: from the 1st to a month's last day. */
function wholeMonths(p: Period): number | null {
  if (!p.from.endsWith('-01')) return null;
  const [ty, tm] = p.to.split('-').map(Number);
  if (p.to !== monthEnd(ty, tm)) return null;
  const [fy, fm] = p.from.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/**
 * The period just before `p`, the same length. Whole months step back by months (October's previous
 * is September, all 30 days of it); anything else steps back by days.
 */
export function previousPeriod(p: Period): Period {
  const months = wholeMonths(p);
  if (months) {
    const [fy, fm] = p.from.split('-').map(Number);
    const [sy, sm] = shiftMonth(fy, fm, -months);
    const [ey, em] = shiftMonth(fy, fm, -1);
    return { from: `${sy}-${pad(sm)}-01`, to: monthEnd(ey, em) };
  }
  const days = daysIn(p);
  return { from: addDaysISO(p.from, -days), to: addDaysISO(p.from, -1) };
}

/** Change from `previous` to `current` in percent, or null when there was nothing before to compare with. */
export function changePct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export type Bucket = { key: string; from: string; to: string };

/** The days, Monday-weeks or calendar months that cover `p`, each clipped to it. Keys: `yyyy-mm-dd` (the day or the week's Monday) or `yyyy-mm`. */
export function bucketsOf(p: Period, grain: Grain): Bucket[] {
  const out: Bucket[] = [];
  if (p.from > p.to) return out;
  if (grain === 'day') {
    for (let d = p.from; d <= p.to; d = addDaysISO(d, 1)) out.push({ key: d, from: d, to: d });
    return out;
  }
  if (grain === 'week') {
    for (let monday = addDaysISO(p.from, -weekday(p.from)); monday <= p.to; monday = addDaysISO(monday, 7)) {
      const sunday = addDaysISO(monday, 6);
      out.push({ key: monday, from: monday < p.from ? p.from : monday, to: sunday > p.to ? p.to : sunday });
    }
    return out;
  }
  let [y, m] = p.from.split('-').map(Number);
  for (;;) {
    const start = `${y}-${pad(m)}-01`;
    if (start > p.to) break;
    const end = monthEnd(y, m);
    out.push({ key: `${y}-${pad(m)}`, from: start < p.from ? p.from : start, to: end > p.to ? p.to : end });
    [y, m] = shiftMonth(y, m, 1);
  }
  return out;
}

/** Past this many buckets a trend steps up a grain: a year by the day is 365 bars nobody can read. */
const MAX_BUCKETS: Record<Grain, number> = { day: 62, week: 60, month: 36 };

/**
 * The buckets a period's trend is drawn in. By the month a trend always shows at least six months,
 * ending with the period's own (so "this month" still has a shape); by the day or week it covers the
 * period. A grain that would give too many bars steps up to the next.
 */
export function trendBuckets(p: Period, grain: Grain = 'month'): { grain: Grain; buckets: Bucket[] } {
  let g = grain;
  let buckets = bucketsOf(p, g);
  while (buckets.length > MAX_BUCKETS[g] && g !== 'month') {
    g = g === 'day' ? 'week' : 'month';
    buckets = bucketsOf(p, g);
  }
  if (g === 'month' && buckets.length < 6) {
    const [ty, tm] = p.to.split('-').map(Number);
    const [sy, sm] = shiftMonth(ty, tm, -5);
    buckets = bucketsOf({ from: `${sy}-${pad(sm)}-01`, to: monthEnd(ty, tm) }, 'month');
  }
  return { grain: g, buckets };
}

/** The bucket a date falls in, or undefined when it's outside them all. */
export function bucketOf(buckets: Bucket[], date: string): Bucket | undefined {
  return buckets.find((b) => date >= b.from && date <= b.to);
}

/* ------------------------------------------------------------------ */
/* Filing calendar                                                     */
/* ------------------------------------------------------------------ */

/**
 * GSTR-1: the 11th of the month after a monthly period. Under QRMP the quarter's return is due the
 * 13th after the quarter, and the optional IFF for its first two months the 13th after each (rule 59).
 */
export function gstr1DueDate(period: string, frequency: 'monthly' | 'qrmp'): { due: string; iff: boolean } {
  const m = Number(period.slice(0, 2));
  const y = Number(period.slice(2));
  const [ny, nm] = shiftMonth(y, m, 1);
  if (frequency === 'monthly') return { due: `${ny}-${pad(nm)}-11`, iff: false };
  return { due: `${ny}-${pad(nm)}-13`, iff: m % 3 !== 0 };
}

export type FilingKind = 'gstr1' | 'iff' | 'gstr3b' | 'pmt06' | 'tds';
export type FilingDue = {
  kind: FilingKind;
  /** `MMYYYY` for GST, `yyyy-mm` (the month the TDS was deducted in) for TDS. */
  period: string;
  due: string;
  /** IFF is a choice under QRMP; leaving it out only moves the invoices to the quarter's GSTR-1. */
  optional: boolean;
};

/**
 * What falls due between `from` and `to`: GSTR-1 (or IFF) and GSTR-3B (or the PMT-06 payment in a
 * QRMP quarter's first two months, due the 25th), and the TDS deposit when the business deducts TDS.
 * Earliest first.
 */
export function filingCalendar(opts: { from: string; to: string; frequency: 'monthly' | 'qrmp'; stateCode: string; deductsTds: boolean }): FilingDue[] {
  const out: FilingDue[] = [];
  const [fy, fm] = opts.from.split('-').map(Number);
  // A month's returns fall due in the month or two after it.
  for (let i = -3; i <= 2; i++) {
    const [y, m] = shiftMonth(fy, fm, i);
    const period = `${pad(m)}${y}`;
    const g1 = gstr1DueDate(period, opts.frequency);
    out.push({ kind: g1.iff ? 'iff' : 'gstr1', period, due: g1.due, optional: g1.iff });
    if (opts.frequency === 'monthly' || m % 3 === 0) out.push({ kind: 'gstr3b', period, due: gstr3bDueDate(period, opts.frequency, opts.stateCode), optional: false });
    else {
      const [ny, nm] = shiftMonth(y, m, 1);
      out.push({ kind: 'pmt06', period, due: `${ny}-${pad(nm)}-25`, optional: false });
    }
    if (opts.deductsTds) out.push({ kind: 'tds', period: `${y}-${pad(m)}`, due: tdsDepositDue(`${y}-${pad(m)}-01`), optional: false });
  }
  return out.filter((f) => f.due >= opts.from && f.due <= opts.to).sort((a, b) => a.due.localeCompare(b.due) || a.kind.localeCompare(b.kind));
}

/* ------------------------------------------------------------------ */
/* Dead stock                                                          */
/* ------------------------------------------------------------------ */

export type DeadStockRow = { item: Item; onHand: number; lastOut?: string };

/**
 * Tracked items with stock on hand that nothing has taken out of in the `days` up to `asOf`, though
 * they were in stock before then (an item bought last week hasn't had its chance yet). Oldest
 * last-sale first.
 */
export function deadStock(items: Item[], movements: StockMovement[], asOf: string, days = 90, branchId?: string): DeadStockRow[] {
  const since = addDaysISO(asOf, -(days - 1));
  const rows: DeadStockRow[] = [];
  for (const item of items) {
    if (!item.trackInventory) continue;
    const mine = movements.filter((m) => m.itemId === item.id && m.date <= asOf && (!branchId || m.branchId === branchId));
    const onHand = stockOnHand(item.id, mine);
    if (onHand <= 0 || !mine.some((m) => m.date < since)) continue;
    const outs = mine.filter((m) => signedQuantity(m) < 0).map((m) => m.date).sort();
    const lastOut = outs[outs.length - 1];
    if (lastOut && lastOut >= since) continue;
    rows.push({ item, onHand, lastOut });
  }
  return rows.sort((a, b) => (a.lastOut ?? '').localeCompare(b.lastOut ?? ''));
}

/* ------------------------------------------------------------------ */
/* Cash movement                                                       */
/* ------------------------------------------------------------------ */

export type CashCategory = 'receipts' | 'payments' | 'expenses' | 'tax' | 'other';
/** Money into (+) or out of (−) the business's cash and bank accounts on a date. */
export type CashFlow = { date: string; category: CashCategory; minor: number };

/**
 * The cash a voucher moves, by what kind of voucher it is. A contra between two of the business's
 * own accounts moves nothing in total and is left out; a TDS challan or GST payment is tax.
 */
export function voucherCashFlows(v: { date: string; kind: string; lines: { account: string; debitMinor: number; creditMinor: number }[] }): CashFlow[] {
  const net = v.lines.filter((l) => l.account.startsWith('pay:')).reduce((s, l) => s + l.debitMinor - l.creditMinor, 0);
  if (net === 0) return [];
  const category: CashCategory = v.kind === 'tdsChallan' || v.kind === 'gstJournal' ? 'tax' : v.kind === 'receipt' ? 'receipts' : 'other';
  return [{ date: v.date, category, minor: net }];
}

export type CashMovement = {
  opening: number;
  inflow: number;
  outflow: number;
  net: number;
  closing: number;
  byCategory: Record<CashCategory, number>;
};

/**
 * Direct-method cash movement over `range`: what the accounts held before it (their opening
 * balances plus every flow dated earlier), what came in and went out in it by category, and what
 * they held at its end. Flows after `range.to` are ignored.
 */
export function cashMovement(openingBalances: number, flows: CashFlow[], range: Period): CashMovement {
  const byCategory: Record<CashCategory, number> = { receipts: 0, payments: 0, expenses: 0, tax: 0, other: 0 };
  let opening = openingBalances;
  let inflow = 0;
  let outflow = 0;
  for (const f of flows) {
    if (f.date > range.to) continue;
    if (f.date < range.from) {
      opening += f.minor;
      continue;
    }
    byCategory[f.category] += f.minor;
    if (f.minor > 0) inflow += f.minor;
    else outflow -= f.minor;
  }
  const net = inflow - outflow;
  return { opening, inflow, outflow, net, closing: opening + net, byCategory };
}

/** Money in and out per bucket, for the net cash flow chart. */
export function cashSeries(buckets: Bucket[], flows: CashFlow[]): { key: string; inflow: number; outflow: number }[] {
  const rows = buckets.map((b) => ({ key: b.key, inflow: 0, outflow: 0 }));
  for (const f of flows) {
    const i = buckets.findIndex((b) => f.date >= b.from && f.date <= b.to);
    if (i < 0) continue;
    if (f.minor > 0) rows[i].inflow += f.minor;
    else rows[i].outflow -= f.minor;
  }
  return rows;
}
