import { addDaysISO } from '../lib/date';
import type { RecurrenceFrequency } from '../types';

/** `iso` moved on by whole months, clamped to the end of a shorter month (31 Jan + 1 → 28/29 Feb). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** The `k`th occurrence of a series that started on `anchor`. */
function occurrence(anchor: string, frequency: Exclude<RecurrenceFrequency, 'none'>, k: number): string {
  switch (frequency) {
    case 'weekly':
      return addDaysISO(anchor, 7 * k);
    case 'monthly':
      return addMonthsISO(anchor, k);
    case 'quarterly':
      return addMonthsISO(anchor, 3 * k);
    case 'yearly':
      return addMonthsISO(anchor, 12 * k);
  }
}

/**
 * The first occurrence strictly after `after` of a series anchored on the
 * template's date, or null when it does not recur. Counting from the anchor
 * (rather than from the last occurrence) keeps a series that started on the
 * 31st on month ends instead of drifting to the 28th.
 */
export function nextRecurrence(anchor: string, frequency: RecurrenceFrequency, after: string = anchor): string | null {
  if (frequency === 'none') return null;
  for (let k = 1; k < 100_000; k++) {
    const d = occurrence(anchor, frequency, k);
    if (d > after) return d;
  }
  return null;
}

/** Every date of a series from `from` up to `to`, both included, starting at `first` (its next date). */
export function occurrencesBetween(anchor: string, frequency: RecurrenceFrequency, first: string | null, to: string, end?: string | null): string[] {
  const out: string[] = [];
  let next = first;
  while (next && next <= to && (!end || next <= end) && out.length < 400) {
    out.push(next);
    next = nextRecurrence(anchor, frequency, next);
  }
  return out;
}
