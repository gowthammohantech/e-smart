import { money, type Money } from '../lib/money';
import type { Gstr1Row, Gstr1Table } from './gstr1';

/**
 * GSTR-1 amendments: a document reported in an earlier, filed return that has changed since (or was
 * cancelled) is reported again in the matching amendment table of the next return, with the original
 * number, date and period, and its revised figures (zero when cancelled). Business-to-consumer small
 * supplies are amended by original month, place of supply and rate (B2CSA): the month's revised rows.
 *
 * `reported` is what earlier filed returns carried, each row tagged with the period it was reported
 * in; a later report of the same document (an earlier amendment) supersedes an earlier one.
 * `current` is each of those documents worked out again today (none for one since cancelled).
 */
export type ReportedRow = Gstr1Row & { period: string };
export type AmendedRow = Gstr1Row & { originalNumber: string; originalDate: string; originalPeriod: string };
export type AmendTable = 'b2ba' | 'b2cla' | 'expa' | 'cdnra' | 'cdnura';
export type Gstr1Amendments = Record<AmendTable, AmendedRow[]> & {
  /** Per original month: every B2CS row of that month as it now stands. */
  b2csa: { originalPeriod: string; rows: Gstr1Row[] }[];
  /** Revised less reported, for 3B 3.1(a) of this month (credit notes counted negative). */
  delta: { taxable: number; igst: number; cgst: number; sgst: number; cess: number };
  /** The same, document by document, for the 3B breakup. */
  changes: { documentId: string; kind: Gstr1Row['kind']; number: string; date: string; taxable: number; igst: number; cgst: number; sgst: number; cess: number }[];
  /** The documents amended, and the rows this return reports for them (to keep as reported). */
  rows: Gstr1Row[];
};

export const AMEND_TABLE: Partial<Record<Gstr1Table, AmendTable>> = { b2b: 'b2ba', b2cl: 'b2cla', exp: 'expa', cdnr: 'cdnra', cdnur: 'cdnura' };

/** YYYYMM from the return's MMYYYY, for ordering periods. */
const order = (period: string) => `${period.slice(2)}${period.slice(0, 2)}`;

/** What a document's rows say, for telling a change from none. */
function signature(rows: Gstr1Row[]): string {
  return JSON.stringify(
    [...rows]
      .sort((a, b) => a.rate - b.rate)
      .map((r) => [r.table, r.gstin ?? '', r.number, r.date, r.placeOfSupply, r.rate, r.taxableValue.minor, r.igst.minor, r.cgst.minor, r.sgst.minor, r.cess.minor, r.invoiceValue.minor, !!r.reverseCharge]),
  );
}

const sign = (r: Gstr1Row) => (r.noteType === 'C' ? -1 : 1);
const zeroed = (r: Gstr1Row): Gstr1Row => {
  const z = (m: Money) => money(0, m.currency);
  return { ...r, taxableValue: z(r.taxableValue), igst: z(r.igst), cgst: z(r.cgst), sgst: z(r.sgst), cess: z(r.cess), invoiceValue: z(r.invoiceValue) };
};

export function gstr1Amendments(reported: ReportedRow[], current: Gstr1Row[], period: string): Gstr1Amendments {
  const out: Gstr1Amendments = { b2ba: [], b2cla: [], expa: [], cdnra: [], cdnura: [], b2csa: [], delta: { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 }, changes: [], rows: [] };
  // The latest report of each document from an earlier period.
  const latest = new Map<string, ReportedRow[]>();
  for (const r of reported) {
    if (order(r.period) >= order(period)) continue;
    const had = latest.get(r.documentId);
    if (!had || order(had[0].period) < order(r.period)) latest.set(r.documentId, [r]);
    else if (had[0].period === r.period) had.push(r);
  }
  const now = new Map<string, Gstr1Row[]>();
  for (const r of current) now.set(r.documentId, [...(now.get(r.documentId) ?? []), r]);

  const add = (into: { taxable: number; igst: number; cgst: number; sgst: number; cess: number }, rows: Gstr1Row[], s: number) => {
    for (const r of rows) {
      if (r.reverseCharge) continue;
      const k = sign(r) * s;
      into.taxable += k * r.taxableValue.minor;
      into.igst += k * r.igst.minor;
      into.cgst += k * r.cgst.minor;
      into.sgst += k * r.sgst.minor;
      into.cess += k * r.cess.minor;
    }
  };

  const b2csMonths = new Set<string>();
  for (const [id, was] of latest) {
    const is = now.get(id) ?? [];
    if (signature(was) === signature(is)) continue;
    const original = was[0];
    // Cancelled since: reported again at nil, so the portal takes it back.
    const revised = is.length ? is : was.map(zeroed);
    const change = { documentId: id, kind: original.kind, number: original.number, date: original.date, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
    add(change, was, -1);
    add(change, revised, 1);
    out.changes.push(change);
    for (const k of ['taxable', 'igst', 'cgst', 'sgst', 'cess'] as const) out.delta[k] += change[k];
    out.rows.push(...revised);
    if (original.table === 'b2cs') {
      b2csMonths.add(original.period);
      continue;
    }
    const table = AMEND_TABLE[original.table];
    if (!table) continue;
    for (const r of revised) out[table].push({ ...r, originalNumber: original.number, originalDate: original.date, originalPeriod: original.period });
  }

  // B2CSA restates the whole month's consumer supplies by place and rate: its rows as reported, the amended ones as they now are.
  for (const month of b2csMonths) {
    const rows: Gstr1Row[] = [];
    for (const [id, was] of latest) {
      if (was[0].period !== month || was[0].table !== 'b2cs') continue;
      const is = now.get(id);
      // `current` holds every reported document worked out again; one missing was cancelled and adds nothing.
      rows.push(...(is ?? []).filter((r) => r.table === 'b2cs'));
    }
    out.b2csa.push({ originalPeriod: month, rows });
  }
  return out;
}
