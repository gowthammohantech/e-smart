import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns';
import type { Locale } from 'date-fns';
import { ta } from 'date-fns/locale/ta';
import i18n from '@/i18n';

export type DateRange = { from: string; to: string };

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'last90'
  | 'thisFY'
  | 'lastFY'
  | 'all'
  | 'custom';

/** The presets offered, in order. Names live in `common:dateRange.*`. */
export const DATE_RANGE_PRESET_KEYS: DateRangePreset[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'thisMonth',
  'lastMonth',
  'last90',
  'thisFY',
  'lastFY',
  'all',
];

/**
 * The date-fns locale for the active language. Only the month and day names
 * come from here; the patterns stay `dd MMM yyyy`, which is the Indian
 * convention and reads correctly in both languages.
 */
function activeLocale(): Locale | undefined {
  return i18n.language === 'ta' ? ta : undefined;
}

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function parseDate(iso: string): Date {
  return parseISO(iso);
}

export function today(): string {
  return toISODate(new Date());
}

export function formatDate(iso: string, pattern = 'dd MMM yyyy'): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), pattern, { locale: activeLocale() });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  if (!iso) return '—';
  try {
    const d = parseISO(iso);
    const locale = activeLocale();
    // The joining word leaves the date-fns pattern: Tamil puts its particle
    // after the date, which a template can express and a pattern cannot.
    return i18n.t('common:dateTime.at', {
      date: format(d, 'dd MMM yyyy', { locale }),
      time: format(d, 'h:mm a', { locale }),
    });
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string): string {
  if (!iso) return '—';
  const d = parseISO(iso);
  const days = differenceInCalendarDays(new Date(), d);
  if (days === 0) return i18n.t('common:relative.today');
  if (days === 1) return i18n.t('common:relative.yesterday');
  if (days === -1) return i18n.t('common:relative.tomorrow');
  if (days > 1 && days < 7) return i18n.t('common:relative.daysAgo', { count: days });
  if (days < -1 && days > -7) return i18n.t('common:relative.inDays', { count: Math.abs(days) });
  return formatDate(iso, 'dd MMM yyyy');
}

export function daysBetween(fromIso: string, toIso: string): number {
  return differenceInCalendarDays(parseISO(toIso), parseISO(fromIso));
}

export function addDaysISO(iso: string, days: number): string {
  return toISODate(addDays(parseISO(iso), days));
}

/** Indian financial year runs Apr 1 -> Mar 31. */
export function financialYearOf(iso: string, startMonth = 4): { start: string; end: string; label: string } {
  const d = parseISO(iso);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const startYear = m >= startMonth ? y : y - 1;
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
  const endDate = endOfMonth(subDays(addDays(parseISO(start), 365), 1));
  const end = toISODate(new Date(startYear + 1, startMonth - 1, 0));
  return {
    start,
    end: end < start ? toISODate(endDate) : end,
    label: `FY ${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`,
  };
}

export function resolveRange(preset: DateRangePreset, custom?: DateRange): DateRange {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: toISODate(now), to: toISODate(now) };
    case 'yesterday': {
      const y = subDays(now, 1);
      return { from: toISODate(y), to: toISODate(y) };
    }
    case 'last7':
      return { from: toISODate(subDays(now, 6)), to: toISODate(now) };
    case 'last30':
      return { from: toISODate(subDays(now, 29)), to: toISODate(now) };
    case 'last90':
      return { from: toISODate(subDays(now, 89)), to: toISODate(now) };
    case 'thisMonth':
      return { from: toISODate(startOfMonth(now)), to: toISODate(endOfMonth(now)) };
    case 'lastMonth': {
      const lm = subMonths(now, 1);
      return { from: toISODate(startOfMonth(lm)), to: toISODate(endOfMonth(lm)) };
    }
    case 'thisFY': {
      const fy = financialYearOf(toISODate(now));
      return { from: fy.start, to: fy.end };
    }
    case 'lastFY': {
      const fy = financialYearOf(toISODate(subMonths(now, 12)));
      return { from: fy.start, to: fy.end };
    }
    case 'all':
      return { from: '1970-01-01', to: '2999-12-31' };
    case 'custom':
    default:
      return custom ?? { from: toISODate(startOfMonth(now)), to: toISODate(now) };
  }
}

export function inRange(iso: string, range: DateRange): boolean {
  if (!iso) return false;
  const d = startOfDay(parseISO(iso));
  return !isBefore(d, startOfDay(parseISO(range.from))) && !isAfter(d, endOfDay(parseISO(range.to)));
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  try {
    return format(parseISO(`${key}-01`), 'MMM', { locale: activeLocale() });
  } catch {
    return key;
  }
}

/**
 * A one- or two-cluster month, for chart axes. Tamil's `MMM` runs to `ஜன.` /
 * `பிப்.`, which is far wider than the three Latin characters the bar charts
 * are spaced for; `MMMMM` gives the narrow form.
 */
export function monthLabelNarrow(key: string): string {
  try {
    return format(parseISO(`${key}-01`), i18n.language === 'ta' ? 'MMMMM' : 'MMM', {
      locale: activeLocale(),
    });
  } catch {
    return key;
  }
}

export function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i -= 1) {
    out.push(format(subMonths(now, i), 'yyyy-MM'));
  }
  return out;
}

export function nowISO(): string {
  return new Date().toISOString();
}
