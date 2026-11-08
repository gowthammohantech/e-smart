/**
 * A bank statement as an `ImportFlow` reads it: the fields, the detection and
 * the reading are core's `readStatement` (packages/core/src/domain/bankStatement.ts),
 * put into the flow's contract. Pure, so tested on its own.
 */
import { findHeaderRow, readStatement, type StatementField, type StatementLine, type StatementMapping } from '@esmart/core/domain/bankStatement';
import type { ColumnMapping, ImportField, RowIssue } from '../import/importMapping';

export const STATEMENT_FIELDS: StatementField[] = ['date', 'description', 'reference', 'debit', 'credit', 'amount', 'type', 'balance'];

/** What a statement row needs mapped; an amount is either `amount` or debit/credit (see `amountProblem`). */
export const REQUIRED_FIELDS: StatementField[] = ['date', 'description'];

/** The flow's fields, labelled by `label`. */
export function statementFields(label: (f: StatementField) => string): ImportField[] {
  return STATEMENT_FIELDS.map((key) => ({ key, label: label(key), required: REQUIRED_FIELDS.includes(key) }));
}

/** The header row and the columns core finds in it. */
export function detectStatement(rows: string[][]): { headerRow: number; mapping: Partial<ColumnMapping> } {
  const headerRow = findHeaderRow(rows);
  if (headerRow < 0) return { headerRow, mapping: {} };
  // readStatement settles a file with both an amount and debit/credit columns the way it reads it.
  const { mapping } = readStatement(rows.slice(0, headerRow + 1));
  return { headerRow, mapping: { ...mapping } };
}

/** Why the mapping can't read amounts: neither an amount column nor a debit or credit one. */
export function amountProblem(mapping: ColumnMapping): 'noAmount' | undefined {
  return mapping.amount === undefined && mapping.debit === undefined && mapping.credit === undefined ? 'noAmount' : undefined;
}

/** How `toStatementLines` words a row it can't use; the flow shows these. */
export type StatementMessages = {
  badAmount: (value: string) => string;
  noColumns: string;
};

/**
 * The statement's lines with the mapping chosen. Every field is passed, mapped
 * or not, so a column the person unmapped stays unmapped (readStatement
 * otherwise fills it from the header). Rows below `headerRow` only.
 */
export function toStatementLines(rows: string[][], headerRow: number, mapping: ColumnMapping, messages: StatementMessages): { records: StatementLine[]; errors: RowIssue[] } {
  const chosen: Partial<StatementMapping> = {};
  for (const f of STATEMENT_FIELDS) chosen[f] = mapping[f];
  // readStatement finds the header itself; give it the rows from the chosen header on, then number rows as the file does.
  const from = Math.max(headerRow, 0);
  const slice = headerRow >= 0 ? rows.slice(from) : [[], ...rows];
  const offset = headerRow >= 0 ? from : -1;
  const res = readStatement(slice, chosen);
  const records = res.lines.map((l) => ({ ...l, row: l.row + offset }));
  const errors = res.errors.map((e) => {
    const value = /"(.*)"$/.exec(e.message)?.[1];
    return { row: e.row > 0 ? e.row + offset : 0, message: value !== undefined ? messages.badAmount(value) : messages.noColumns };
  });
  return { records, errors };
}

/** The most lines one import request carries; a bigger statement goes in parts (the server takes up to 10,000, the body 5 MB). */
export const IMPORT_CHUNK = 5000;

/**
 * A statement's lines in parts of at most `max`, cut only where the date changes. Identical lines
 * of one day are told apart by their place among their twins within a request, so a day split
 * across two parts would read its second twin as a duplicate of the first. A single day with more
 * than `max` lines stays whole.
 */
export function chunkByDate<T extends { date: string }>(lines: T[], max = IMPORT_CHUNK): T[][] {
  if (lines.length <= max) return [lines];
  const out: T[][] = [];
  let cur: T[] = [];
  let i = 0;
  while (i < lines.length) {
    let j = i;
    while (j < lines.length && lines[j].date === lines[i].date) j++;
    const day = lines.slice(i, j);
    if (cur.length && cur.length + day.length > max) {
      out.push(cur);
      cur = [];
    }
    cur = cur.concat(day);
    i = j;
  }
  if (cur.length) out.push(cur);
  return out;
}
