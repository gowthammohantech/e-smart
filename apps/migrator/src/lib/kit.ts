import type { TaxCategory } from '@esmart/core/types';
import type { TemplateSheet } from './sheets';

/** Bumped when a template's columns change, so an old file can still be told apart. */
export const TEMPLATE_VERSION = '2';

/** What we need to know about the business to read a sheet the way the app does. */
export type Ctx = {
  currency: string;
  taxCategories: TaxCategory[];
  trackInventory: boolean;
  /** The chart of accounts, for journals; empty when the business has no Books module. */
  accounts: { key: string; name: string }[];
  /** 1 to 12: the month the financial year begins. */
  fiscalYearStartMonth: number;
  /** What the business's plan includes (purchases, expenses, books...). Unset when not known: nothing is warned about. */
  modules?: string[];
  /** The plan's name, for the sentence that says what it lacks. */
  planName?: string;
};

export type EntityId = 'contacts' | 'items' | 'openings' | 'sales' | 'purchases' | 'payments' | 'expenses' | 'journals';
export type Group = 'Masters' | 'Opening balances' | 'Transactions';

export type Mapping = Record<string, number | undefined>;
export type Field = { key: string; label: string; required?: boolean };
export type Parsed = { records: { line: number; value: unknown; /** Every sheet row the record is made of, when more than one. */ rows?: number[] }[]; errors: { line: number; message: string }[] };
export type Outcome = { index: number; status: 'created' | 'duplicate' | 'invalid'; message?: string };
export type SendResult = { created: number; skipped: number; invalid: number; results: Outcome[]; warnings: string[] };

/** What the rows of one sheet are sent with: where to, what the same file also adds, and the person's choices. */
export type Env = {
  companyId: string;
  ctx: Ctx;
  /** Names and GSTINs, SKUs and names, that this same run adds first, so a later sheet can refer to them in the check. */
  pending: { parties: Set<string>; items: Set<string> };
  /** Contacts of this same run that were refused, with why, so a sheet that refers to one can say so. */
  rejected: { parties: Map<string, string> };
  options: Record<string, string>;
};

/** A choice the person makes about a sheet: one of a few values, or a date. */
export type EntityOption = {
  key: string;
  label: string;
  hint: string;
  type?: 'choice' | 'date';
  choices?: { value: string; label: string }[];
  default: string | ((ctx: Ctx) => string);
};

/** The first day of the financial year that today falls in, as YYYY-MM-DD. */
export function financialYearStart(startMonth: number, today = new Date()): string {
  const year = today.getMonth() + 1 >= startMonth ? today.getFullYear() : today.getFullYear() - 1;
  return `${year}-${String(startMonth).padStart(2, '0')}-01`;
}

export type Entity = {
  id: EntityId;
  group: Group;
  title: string;
  /** One line on the card: what this brings over. */
  blurb: string;
  sheetName: string;
  fields: Field[];
  template: TemplateSheet;
  /** Words in a sheet's name that suggest it holds this. */
  nameHint: RegExp;
  /** Fields a sheet must have a column for to be taken for this. */
  signature: string[];
  options?: EntityOption[];
  guess: (header: string[]) => Mapping;
  parse: (rows: string[][], mapping: Mapping, ctx: Ctx, options: Record<string, string>) => Parsed;
  send: (values: unknown[], dryRun: boolean, env: Env) => Promise<SendResult>;
  /** What the business's plan will refuse in these records, said before anything is sent; undefined when nothing. */
  planNeeds?: (records: unknown[], ctx: Ctx) => string | undefined;
  /** Shown on the review step: the main columns of a good row. */
  preview: { label: string; value: (record: never) => string }[];
};

export const emptyResult = (): SendResult => ({ created: 0, skipped: 0, invalid: 0, results: [], warnings: [] });

/** Rows marked as an example in the template are left out, so a forgotten sample row is never imported. */
export const isExample = (cells: string[]) => cells.some((c) => /^\(example\)/i.test(c.trim()));

/** Header at row 0 and the data after it, without the example rows; `lineOf` keeps the sheet's own numbering. */
export function withoutExamples(rows: string[][]) {
  const lineOf = new Map<string[], number>();
  rows.forEach((r, i) => lineOf.set(r, i + 1));
  return { rows: rows.filter((r, i) => i === 0 || !isExample(r)), lineOf };
}

export const col = (label: string, sample: string, hint: string, extra: Partial<TemplateSheet['columns'][number]> = {}) => ({ label, sample, hint, ...extra });

const MAX_PER_REQUEST = 500;

/** The server takes up to a few hundred rows a call; sends in steps and puts the answers back together. */
export async function inChunks(values: unknown[], one: (chunk: unknown[]) => Promise<SendResult>, size = MAX_PER_REQUEST): Promise<SendResult> {
  const out = emptyResult();
  for (let at = 0; at < values.length; at += size) {
    const part = await one(values.slice(at, at + size));
    out.created += part.created;
    out.skipped += part.skipped;
    out.invalid += part.invalid;
    out.results.push(...part.results.map((r) => ({ ...r, index: r.index + at })));
    for (const w of part.warnings) if (!out.warnings.includes(w)) out.warnings.push(w);
  }
  return out;
}

type Raw = { created?: number; skipped?: number; invalid?: number; warnings?: string[]; results?: { index: number; status: string; issues?: { message?: string }[] }[] };
/** The server's answer to an import call, as ours. */
export const shape = (data: Raw): SendResult => ({
  created: data.created ?? 0,
  skipped: data.skipped ?? 0,
  invalid: data.invalid ?? 0,
  warnings: data.warnings ?? [],
  results: (data.results ?? []).map((r) => ({
    index: r.index,
    status: r.status === 'duplicate' ? 'duplicate' : r.status === 'invalid' ? 'invalid' : 'created',
    message: r.issues?.map((i) => i.message).filter(Boolean).join(' · ') || undefined,
  })),
});

/** Runs `work` over the items a few at a time. */
export async function pool<T, R>(items: T[], size: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await work(items[i], i);
      }
    }),
  );
  return out;
}

/** Totals a list of per-row outcomes into a result. */
export function tally(results: Outcome[]): SendResult {
  const out = emptyResult();
  out.results = results;
  for (const r of results) {
    if (r.status === 'created') out.created += 1;
    else if (r.status === 'duplicate') out.skipped += 1;
    else out.invalid += 1;
  }
  return out;
}

/** Looks a header up by the names it goes by, ignoring case, spaces and punctuation. */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthOf = (word: string) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;

/**
 * A date as people write it, to YYYY-MM-DD; undefined when it is not one. Day first, as in India:
 * 31/03/2026, 31-03-26, 31.3.2026, 31-Mar-2026, 31 March 2026, Mar 31, 2026, 2026-03-31, and an Excel
 * serial number. A month-first date is taken only when it cannot be anything else (12/31/2026).
 */
export function toIsoDate(raw: string): string | undefined {
  // A time of day after the date (10:30, 10:30:15, 10:30 PM) is not part of the date.
  const v = raw.trim().replace(/\s+/g, ' ').replace(/[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?: ?[AaPp][Mm])?(?:Z|[+-]\d{2}:?\d{2})?$/, '');
  if (!v) return undefined;
  let y = 0;
  let m = 0;
  let d = 0;
  let t: RegExpExecArray | null;
  if ((t = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(v))) [y, m, d] = [+t[1], +t[2], +t[3]];
  else if ((t = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/.exec(v))) {
    [d, m] = [+t[1], +t[2]];
    y = t[3].length === 2 ? 2000 + +t[3] : +t[3];
    // 12/31/2026 can only be month first.
    if (m > 12 && d <= 12) [d, m] = [m, d];
  } else if ((t = /^(\d{1,2})(?:st|nd|rd|th)?[-/. ]([A-Za-z]{3,9})\.?[-/. ,]*(\d{2}|\d{4})$/.exec(v)) && monthOf(t[2])) {
    [d, m] = [+t[1], monthOf(t[2])];
    y = t[3].length === 2 ? 2000 + +t[3] : +t[3];
  } else if ((t = /^([A-Za-z]{3,9})\.?[ -]+(\d{1,2})(?:st|nd|rd|th)?,? ?(\d{4})$/.exec(v)) && monthOf(t[1])) [m, d, y] = [monthOf(t[1]), +t[2], +t[3]];
  else if (/^\d{5}$/.test(v) && +v > 20000 && +v < 80000) {
    // A date Excel kept as its day number.
    const date = new Date(Date.UTC(1899, 11, 30) + +v * 86_400_000);
    [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else return undefined;
  if (m < 1 || m > 12 || d < 1 || y < 1990 || y > 2100) return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
