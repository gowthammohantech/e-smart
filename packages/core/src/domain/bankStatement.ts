/**
 * Bank statements: reading the rows a bank's CSV or Excel export holds into
 * dated, signed lines, and matching those lines to what the books recorded
 * on the account (payments, expenses, contra and journal vouchers).
 *
 * Amounts are integer minor units, signed as the bank sees them: + is money
 * into the account (a credit on the statement), − is money out (a debit).
 * Dates in Indian statements are always day first: 03/04/2025 is 3 April.
 */
import { cleanAmount, matchColumns, squashHeader } from '../lib/csv';

/** Column indexes of a statement's fields; undefined when the file has no such column. */
export type StatementMapping = {
  date?: number;
  description?: number;
  reference?: number;
  debit?: number;
  credit?: number;
  /** One signed (or Dr/Cr-marked) amount column, when there are no separate debit and credit columns. */
  amount?: number;
  /** The Dr/Cr column that goes with `amount`. */
  type?: number;
  balance?: number;
};

export type StatementField = keyof StatementMapping;

export type StatementLine = {
  /** The row as a spreadsheet numbers it (1-based). */
  row: number;
  /** yyyy-MM-dd. */
  date: string;
  description: string;
  reference?: string;
  /** + money into the bank, − money out. */
  amountMinor: number;
  balanceMinor?: number;
};

export type StatementError = { row: number; message: string };

export type ReadStatementResult = {
  mapping: StatementMapping;
  /** 0-based index of the header row in `rows`; −1 when there is none (a mapping was given). */
  headerRow: number;
  lines: StatementLine[];
  errors: StatementError[];
};

/**
 * The header names banks use, as `squashHeader` writes them. Date columns are
 * ranked: a transaction (posting) date wins over a plain "date", and either
 * over the value date, whatever order the bank puts them in.
 */
const DATE_RANKS = [['txndate', 'transactiondate', 'trandate', 'transdate', 'postingdate'], ['date'], ['valuedate', 'valuedt']];
const ALIASES: Record<Exclude<StatementField, 'date'>, string[]> = {
  description: ['description', 'narration', 'particulars', 'remarks', 'details', 'transactiondetails', 'transactionremarks', 'transactiondescription'],
  reference: ['ref', 'reference', 'refno', 'chqno', 'chequeno', 'chqrefno', 'refnochequeno', 'chequerefno', 'utr', 'utrno', 'instrumentno', 'chequenumber', 'referenceno'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'withdrawalamt', 'withdrawalamount', 'dr', 'debitamount', 'debitamt'],
  credit: ['credit', 'deposit', 'deposits', 'depositamt', 'depositamount', 'cr', 'creditamount', 'creditamt'],
  amount: ['amount', 'transactionamount', 'txnamount', 'amt'],
  type: ['drcr', 'crdr', 'type', 'debitcredit', 'transactiontype'],
  balance: ['balance', 'closingbalance', 'runningbalance', 'availablebalance', 'bal', 'balanceamt', 'balanceamount'],
};
const RANKED: Record<string, string[]> = { ...ALIASES, date0: DATE_RANKS[0], date1: DATE_RANKS[1], date2: DATE_RANKS[2] };

/** A header as matched: bracketed units dropped ("Withdrawal Amt (INR)"), then squashed. */
export const normalizeHeader = (s: string): string => squashHeader(String(s ?? '').replace(/\([^)]*\)/g, ''));

const FIELD_ORDER: StatementField[] = ['date', 'description', 'reference', 'debit', 'credit', 'amount', 'type', 'balance'];

/** The mapping a header row spells out, and how many distinct fields it names. */
function mappingOf(row: string[]): { mapping: StatementMapping; fields: number } {
  const found = matchColumns(row.map(normalizeHeader), RANKED);
  const { date0, date1, date2, ...rest } = found;
  const mapping: StatementMapping = { ...rest };
  const date = date0 ?? date1 ?? date2;
  if (date !== undefined) mapping.date = date;
  return { mapping, fields: Object.keys(mapping).length };
}

/** The first of the first 60 rows naming at least two known headers, or −1. */
export function findHeaderRow(rows: string[][]): number {
  const n = Math.min(rows.length, 60);
  for (let i = 0; i < n; i++) if (mappingOf(rows[i] ?? []).fields >= 2) return i;
  return -1;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

const pad = (n: number) => String(n).padStart(2, '0');

function isoOf(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2999)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/**
 * A statement date as yyyy-MM-dd, or null. Day first always: dd/mm/yyyy,
 * dd-mm-yyyy, dd.mm.yyyy, dd/mm/yy, dd-MMM-yyyy, dd MMM yyyy, dd-MMM-yy,
 * yyyy-mm-dd (a time after it is ignored), and Excel serial day numbers.
 */
export function parseStatementDate(value: string): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/.exec(s);
  if (m) return isoOf(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?:$|[\s,T])/.exec(s);
  if (m) return isoOf(fullYear(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})[\s\-/]*([A-Za-z]{3,9})\.?[\s\-/,]*(\d{4}|\d{2})(?:$|[\s,T])/.exec(s);
  if (m) {
    const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
    return month ? isoOf(fullYear(m[3]), month, Number(m[1])) : null;
  }
  // Excel's day number: 1 is 1 Jan 1900, with its phantom 29 Feb 1900, so count from 30 Dec 1899.
  m = /^(\d{5})(?:\.\d+)?$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    if (n < 20000 || n > 80000) return null;
    const t = new Date(Date.UTC(1899, 11, 30) + n * 86_400_000);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  return null;
}

export type ParsedAmount = {
  /** Minor units; negative when written negative ("-500", "(500.00)"). */
  minor: number;
  /** A Cr or Dr written on the amount itself. */
  marker?: 'cr' | 'dr';
};

/**
 * An amount as a statement writes it: '1,23,456.78', '1234', '1,234.00 Cr',
 * '500.00 Dr', '(500.00)', '-500', '₹ 1,000'. Blank (or a lone dash) is 0;
 * anything else unreadable is null.
 */
export function parseStatementAmount(value: string): ParsedAmount | null {
  let s = String(value ?? '').trim();
  if (!s || /^[-–—]$/.test(s)) return { minor: 0 };
  let marker: ParsedAmount['marker'];
  const mk = /(?:^|[\s\d.)])(cr|dr)\.?$/i.exec(s) ?? /^(cr|dr)\.?(?=[\s\d(₹$-])/i.exec(s);
  if (mk) {
    marker = mk[1].toLowerCase() as 'cr' | 'dr';
    s = s.replace(/\s*(cr|dr)\.?$/i, '').replace(/^(cr|dr)\.?\s*/i, '');
  }
  // What `cleanAmount` doesn't take: Rs./INR/$, a trailing or leading sign, more than two decimals
  // (an Excel float such as 1234.5600001).
  s = s.replace(/rs\.?|inr|\$/gi, '').replace(/\s/g, '');
  if (s.endsWith('-') && !s.startsWith('-')) s = `-${s.slice(0, -1)}`;
  if (s.startsWith('+')) s = s.slice(1);
  const long = /^(-?[\d,]*)\.(\d{3,})$/.exec(s);
  if (long) {
    const [int, frac] = [long[1].replace(/,/g, ''), long[2]];
    const cents = BigInt(`${int.replace('-', '') || '0'}${frac.slice(0, 2)}`) + (Number(frac[2]) >= 5 ? 1n : 0n);
    s = `${int.startsWith('-') ? '-' : ''}${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  }
  const clean = cleanAmount(s.replace(/^\.(\d)/, '0.$1'));
  if (clean === undefined) return { minor: 0, ...(marker && { marker }) };
  if (clean === null) return null;
  const negative = clean.startsWith('-');
  const [int, frac = ''] = clean.replace('-', '').split('.');
  const minor = Number(int) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(minor)) return null;
  return { minor: negative && minor ? -minor : minor, ...(marker && { marker }) };
}

const cellAt = (row: string[], i: number | undefined) => (i === undefined ? '' : String(row[i] ?? '').trim());

/** Which way a Dr/Cr type cell points: +1 credit, −1 debit, 0 unknown. */
function directionOf(cell: string): 1 | -1 | 0 {
  const t = cell.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (['cr', 'c', 'credit', 'deposit', 'in'].includes(t)) return 1;
  if (['dr', 'd', 'debit', 'withdrawal', 'out'].includes(t)) return -1;
  return 0;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Reads a statement's rows (as parsed from CSV or the first sheet of an
 * Excel file) into lines. The header row is found below whatever account
 * details the bank put above it; `mapping` overrides any column it names.
 * Blank rows, footers and totals (no readable date) and rows that move no
 * money are skipped; a dated row whose amount can't be read is an error.
 */
export function readStatement(rows: string[][], mapping: Partial<StatementMapping> = {}): ReadStatementResult {
  const headerRow = findHeaderRow(rows);
  const detected = headerRow >= 0 ? mappingOf(rows[headerRow]).mapping : {};
  const merged: StatementMapping = { ...detected };
  for (const k of FIELD_ORDER) if (k in mapping) merged[k] = mapping[k];
  // Separate debit and credit columns make an `amount` column a duplicate of them.
  if (merged.amount !== undefined && (merged.debit !== undefined || merged.credit !== undefined) && !('amount' in mapping)) delete merged.amount;

  const errors: StatementError[] = [];
  const lines: StatementLine[] = [];
  const hasAmount = merged.amount !== undefined || merged.debit !== undefined || merged.credit !== undefined;
  if (merged.date === undefined || !hasAmount) {
    errors.push({ row: headerRow + 1, message: headerRow < 0 ? 'No header row with a date and an amount was found' : 'The header row has no date or amount column' });
    return { mapping: merged, headerRow, lines, errors };
  }

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (!row.some((c) => String(c ?? '').trim())) continue;
    const date = parseStatementDate(cellAt(row, merged.date));
    if (!date) continue;
    const rowNo = i + 1;
    let amountMinor: number;
    if (merged.amount !== undefined) {
      const a = parseStatementAmount(cellAt(row, merged.amount));
      if (!a) {
        errors.push({ row: rowNo, message: `Can't read the amount "${cellAt(row, merged.amount)}"` });
        continue;
      }
      const dir = merged.type !== undefined ? directionOf(cellAt(row, merged.type)) : 0;
      const mark = a.marker === 'cr' ? 1 : a.marker === 'dr' ? -1 : 0;
      const sign = dir || mark;
      amountMinor = sign ? sign * Math.abs(a.minor) : a.minor;
    } else {
      const d = parseStatementAmount(cellAt(row, merged.debit));
      const c = parseStatementAmount(cellAt(row, merged.credit));
      if (!d || !c) {
        errors.push({ row: rowNo, message: `Can't read the amount "${!d ? cellAt(row, merged.debit) : cellAt(row, merged.credit)}"` });
        continue;
      }
      amountMinor = Math.abs(c.minor) - Math.abs(d.minor);
    }
    if (!amountMinor) continue;
    let balanceMinor: number | undefined;
    if (merged.balance !== undefined && cellAt(row, merged.balance)) {
      const b = parseStatementAmount(cellAt(row, merged.balance));
      // An overdrawn balance is marked Dr.
      if (b) balanceMinor = b.marker === 'dr' ? -Math.abs(b.minor) : b.minor;
    }
    const reference = squash(cellAt(row, merged.reference));
    lines.push({
      row: rowNo,
      date,
      description: squash(cellAt(row, merged.description)),
      ...(reference && reference !== '-' && { reference }),
      amountMinor,
      ...(balanceMinor !== undefined && { balanceMinor }),
    });
  }
  return { mapping: merged, headerRow, lines, errors };
}

/**
 * A line's identity for spotting it again when an overlapping statement is
 * imported: date, amount, narration and running balance. `occurrence`
 * numbers identical lines within one file (two ₹100 UPI payments to the
 * same shop on the same day, on a statement with no balance column), so
 * both are kept and a re-import still finds each. At most 200 characters.
 */
export function lineKey(line: Pick<StatementLine, 'date' | 'amountMinor' | 'description' | 'balanceMinor'>, occurrence = 1): string {
  const desc = line.description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const head = `${line.date}|${line.amountMinor}|${line.balanceMinor ?? ''}|`;
  const tail = occurrence > 1 ? `#${occurrence}` : '';
  return head + desc.slice(0, 200 - head.length - tail.length) + tail;
}

// ------------------------------------------------------------------ matching

/** A record in the books that a bank line could be. */
export type Candidate = {
  type: 'payment' | 'expense' | 'voucher';
  id: string;
  date: string;
  /** Signed as the bank sees it: + money into the account. */
  amountMinor: number;
  reference?: string;
  number?: string;
  partyName?: string;
};

export type Suggestion = Candidate & {
  /** 0–100. */
  score: number;
  /** Days between the line and the record. */
  days: number;
  /** The record's reference or number is in the line's narration or reference (a UTR, a cheque number). */
  referenceHit: boolean;
  partyHit: boolean;
};

/** What a matcher reads off a bank line. */
export type MatchableLine = Pick<StatementLine, 'date' | 'amountMinor' | 'description' | 'reference'> & { id?: string; row?: number };

export type MatchOptions = { dayTolerance?: number };

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

const token = (s: string | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Whether a record's reference (or number) is in the line. A number (a UTR, a cheque number) must
 * stand on its own, leading zeros aside: cheque 000123 is in "CHQ 123" but not in "1234". Anything
 * else is looked for with case and punctuation ignored. Under four characters is too short to tell.
 */
function refIn(ref: string | undefined, line: MatchableLine): boolean {
  const t = token(ref);
  if (t.length < 4) return false;
  if (/^\d+$/.test(t)) {
    const digits = t.replace(/^0+/, '');
    if (digits.length < 3) return false;
    const re = new RegExp(`(?<!\\d)0*${digits}(?!\\d)`);
    return re.test(line.description) || re.test(line.reference ?? '');
  }
  return token(line.description).includes(t) || token(line.reference).includes(t);
}

const PARTY_NOISE = new Set(['PVT', 'PRIVATE', 'LTD', 'LIMITED', 'LLP', 'THE', 'AND', 'CO', 'COMPANY', 'INDIA', 'ENTERPRISES', 'TRADERS', 'SERVICES', 'SOLUTIONS', 'MS']);

function partyHitOf(name: string | undefined, haystack: string): boolean {
  if (!name) return false;
  const whole = token(name);
  if (whole.length >= 4 && haystack.includes(whole)) return true;
  return name
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .some((w) => w.length >= 4 && !PARTY_NOISE.has(w) && haystack.includes(w));
}

function score(line: MatchableLine, c: Candidate, tolerance: number): Suggestion | null {
  if (c.amountMinor !== line.amountMinor) return null;
  const days = Math.abs(dayNumber(c.date) - dayNumber(line.date));
  if (days > tolerance) return null;
  const referenceHit = refIn(c.reference, line) || refIn(c.number, line);
  const partyHit = partyHitOf(c.partyName, token(line.description) + '|' + token(line.reference));
  const value = 40 + Math.round(30 * (1 - days / (tolerance + 1))) + (referenceHit ? 25 : 0) + (partyHit ? 5 : 0);
  return { ...c, score: Math.min(value, 100), days, referenceHit, partyHit };
}

function rank(line: MatchableLine, candidates: Candidate[], tolerance: number): Suggestion[] {
  return candidates
    .map((c) => score(line, c, tolerance))
    .filter((s): s is Suggestion => !!s)
    .sort((a, b) => b.score - a.score || a.days - b.days || a.id.localeCompare(b.id));
}

/**
 * The records a line could be, best first (at most 5): the same signed
 * amount exactly, dated within `dayTolerance` days, scored higher the
 * closer the date and when the record's reference or number (a UTR, a
 * cheque number) or its party's name is in the line.
 */
export function suggestMatches(line: MatchableLine, candidates: Candidate[], opts: MatchOptions & { limit?: number } = {}): Suggestion[] {
  return rank(line, candidates, opts.dayTolerance ?? 3).slice(0, opts.limit ?? 5);
}

/** How `autoMatch` keys its result: the line's id, else its row. */
const keyOf = (l: MatchableLine, i: number): string | number => l.id ?? l.row ?? i;

/**
 * Pairs lines with records one to one where there is no doubt. A line takes
 * its best record only when that record is the only one with the amount
 * within the tolerance, or the only one whose reference is in the line, and
 * no other line has the same claim on it. Passes repeat over what is left,
 * so once a UTR settles one of two equal payments the other can pair with
 * the remaining line. No record is used twice.
 */
export function autoMatch(lines: MatchableLine[], candidates: Candidate[], opts: MatchOptions = {}): Map<string | number, Candidate> {
  const tolerance = opts.dayTolerance ?? 3;
  const out = new Map<string | number, Candidate>();
  const used = new Set<string>();
  const cid = (c: Candidate) => `${c.type}:${c.id}`;
  let open = lines.map((l, i) => ({ line: l, key: keyOf(l, i) }));
  for (;;) {
    const left = candidates.filter((c) => !used.has(cid(c)));
    const claims = new Map<string, { key: string | number; candidate: Candidate }[]>();
    for (const { line, key } of open) {
      const ranked = rank(line, left, tolerance);
      const hits = ranked.filter((s) => s.referenceHit);
      const pick = hits.length === 1 ? hits[0] : ranked.length === 1 && !hits.length ? ranked[0] : null;
      if (!pick) continue;
      const k = cid(pick);
      claims.set(k, [...(claims.get(k) ?? []), { key, candidate: candidates.find((c) => cid(c) === k)! }]);
    }
    let progressed = false;
    for (const [k, list] of claims) {
      if (list.length !== 1) continue;
      out.set(list[0].key, list[0].candidate);
      used.add(k);
      progressed = true;
    }
    if (!progressed) return out;
    open = open.filter((o) => !out.has(o.key));
  }
}
