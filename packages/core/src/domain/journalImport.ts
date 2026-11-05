import { cleanAmount, matchColumns, squashHeader } from '../lib/csv';
import { fromMajor } from '../lib/money';

/**
 * Journals from a spreadsheet: one row per voucher line (date, reference, account, debit, credit,
 * narration), rows with the same reference making one journal. Accounts are found by name in the
 * chart the app shows (or by key, `sys:rent`), in any case. The server checks each journal as it
 * checks one entered by hand.
 */

export type JournalField = 'date' | 'reference' | 'account' | 'debit' | 'credit' | 'narration';

const ALIASES: Record<JournalField, string[]> = {
  date: ['date', 'voucherdate', 'txndate', 'entrydate'],
  reference: ['reference', 'ref', 'voucherno', 'vouchernumber', 'jvno', 'journalno', 'entryno', 'no'],
  account: ['account', 'ledger', 'ledgername', 'accountname', 'particulars', 'head'],
  debit: ['debit', 'dr', 'debitamount', 'debitamt'],
  credit: ['credit', 'cr', 'creditamount', 'creditamt'],
  narration: ['narration', 'description', 'memo', 'remarks', 'notes'],
};

export function guessJournalColumns(header: string[]): Partial<Record<JournalField, number>> {
  return matchColumns(header, ALIASES);
}

export type ImportedJournal = {
  /** The first sheet line of the journal (the header is line 1). */
  line: number;
  reference: string;
  date: string;
  narration?: string;
  lines: { account: string; debitMinor: number; creditMinor: number; narration?: string }[];
  problems: string[];
};

/** "31/03/2026", "31-03-2026", "2026-03-31" to an ISO date; undefined when it isn't one. */
export function isoDate(raw: string): string | undefined {
  const v = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2].padStart(2, '0'), dmy[1].padStart(2, '0')] : [];
  if (!y) return undefined;
  const date = `${y}-${m}-${d}`;
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).getUTCDate() !== Number(d) ? undefined : date;
}

export function journalsFromCsv(rows: string[][], columns: Partial<Record<JournalField, number>>, accounts: { key: string; name: string }[], currency: string): ImportedJournal[] {
  const byName = new Map(accounts.map((a) => [squashHeader(a.name), a.key]));
  const keys = new Set(accounts.map((a) => a.key));
  const groups = new Map<string, ImportedJournal>();
  rows.slice(1).forEach((r, i) => {
    const get = (f: JournalField) => (columns[f] !== undefined ? (r[columns[f]!] ?? '').trim() : '');
    // Without a reference, a journal runs on until the date changes.
    const reference = get('reference') || `#${get('date')}`;
    const j = groups.get(reference) ?? { line: i + 2, reference: get('reference'), date: '', lines: [], problems: [] };
    groups.set(reference, j);
    const date = isoDate(get('date'));
    if (!date) j.problems.push(`Line ${i + 2}: "${get('date')}" is not a date`);
    else if (j.date && j.date !== date) j.problems.push(`Line ${i + 2}: a journal has one date`);
    else j.date = date;
    const accountRaw = get('account');
    const account = keys.has(accountRaw) ? accountRaw : byName.get(squashHeader(accountRaw));
    if (!account) j.problems.push(`Line ${i + 2}: no account called "${accountRaw}"`);
    const dr = cleanAmount(get('debit'));
    const cr = cleanAmount(get('credit'));
    if (dr === null || cr === null) j.problems.push(`Line ${i + 2}: an amount is not a number`);
    const debitMinor = dr ? fromMajor(dr, currency).minor : 0;
    const creditMinor = cr ? fromMajor(cr, currency).minor : 0;
    if ((debitMinor > 0) === (creditMinor > 0)) j.problems.push(`Line ${i + 2}: each line is a debit or a credit`);
    if (debitMinor < 0 || creditMinor < 0) j.problems.push(`Line ${i + 2}: amounts can't be negative`);
    if (!j.narration && get('narration')) j.narration = get('narration');
    if (account) j.lines.push({ account, debitMinor, creditMinor, ...(get('narration') && { narration: get('narration') }) });
  });
  for (const j of groups.values()) {
    const dr = j.lines.reduce((a, l) => a + l.debitMinor, 0);
    const cr = j.lines.reduce((a, l) => a + l.creditMinor, 0);
    if (j.lines.length < 2) j.problems.push('A journal needs at least two lines');
    if (dr !== cr) j.problems.push(`Debits (${(dr / 100).toFixed(2)}) and credits (${(cr / 100).toFixed(2)}) differ`);
  }
  return [...groups.values()];
}
