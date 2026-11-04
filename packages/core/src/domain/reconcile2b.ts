/**
 * GSTR-2B against the purchase register. Since 2022 a business may claim only the credit its
 * suppliers reported (CGST s.16(2)(aa)), so every bill is matched to a line of 2B, and every line of
 * 2B to a bill. This is the CA's slowest monthly task; the app does the matching and leaves the
 * judgement calls to a person.
 */

/** A line of 2B as the matcher needs it. Amounts in paise. */
export type TwoBLine = {
  id: string;
  supplierGstin: string;
  documentType: 'I' | 'C' | 'D' | 'BOE';
  number: string;
  date: string;
  taxableMinor: number;
  taxMinor: number;
  itcAvailable: boolean;
  /** A person's call, kept across refetches. */
  decision?: 'accepted' | 'notOurs' | 'claimLater';
  /** The bill a person linked it to. */
  linkedDocumentId?: string;
};

/** A purchase bill or supplier note as the matcher needs it. Amounts in base-currency paise. */
export type BookBill = {
  id: string;
  kind: 'purchaseBill' | 'supplierCreditNote' | 'supplierDebitNote';
  supplierGstin: string;
  /** The supplier's own number for it. */
  number: string;
  date: string;
  taxableMinor: number;
  /** GST charged on it (not reverse charge): what 2B would show. */
  taxMinor: number;
  /** The 2B period it was already claimed in, if any. */
  claimedIn?: string;
};

export type MatchStatus =
  /** Same supplier, number, date and amounts (within the tolerance). */
  | 'matched'
  /** Same supplier, number and amounts, dated a few days apart (the bill entered on the day it came). */
  | 'matchedWithinTolerance'
  /** A person linked it to a bill, or accepted the one suggested. */
  | 'manuallyLinked'
  /** Matched to a bill whose credit has already been claimed for this period. */
  | 'claimed'
  /** Same supplier and number, but the amount or date differs: see `reasons`. */
  | 'partial'
  /** Same supplier and amount within days of each other: likely the same bill under another number. */
  | 'probable'
  /** In 2B, not in the books: a bill not entered yet, or not ours. */
  | 'missingInBooks'
  /** A person said it isn't ours. */
  | 'notOurs'
  /** A person put it off to a later month. */
  | 'claimLater';

/** The statuses whose credit the period can claim. */
export const CLAIMABLE: MatchStatus[] = ['matched', 'matchedWithinTolerance', 'manuallyLinked', 'claimed'];

/** Why a line and its bill don't agree. */
export type MismatchReason = 'taxable' | 'tax' | 'date' | 'number';

export type Match = {
  line: TwoBLine;
  status: MatchStatus;
  bill?: BookBill;
  /** What differs from the bill, in paise (2B minus books). */
  difference?: { taxableMinor: number; taxMinor: number; days: number };
  reasons?: MismatchReason[];
};

export type Reconciliation = {
  matches: Match[];
  /** Bills in the books for the period that no line of 2B accounts for: chase the supplier. */
  missingIn2b: BookBill[];
  /** Credit the period can claim: matched, linked and claimed lines that 2B marks available. */
  claimableTaxMinor: number;
};

/** "24-25", "2024-25", "2024/2025": a financial year, when the second year follows the first. */
const YEAR = /(?<!\d)(?:20)?(\d{2})[-/](?:20)?(\d{2})(?!\d)/g;

/**
 * "INV/24-25/0012", "inv-12" and "INV 0012" are one bill: case, separators, leading zeros and a
 * financial-year segment don't count. Other number pairs ("A/12/34") are kept, so they don't collide.
 */
export function normalizeNumber(n: string): string {
  return n
    .toUpperCase()
    .replace(YEAR, (all, a: string, b: string) => ((Number(a) + 1) % 100 === Number(b) ? '' : all))
    .split(/[^A-Z0-9]+/)
    .map((part) => part.replace(/^([A-Z]*)0+(?=\d)/, '$1'))
    .join('');
}

const KIND_OF: Record<TwoBLine['documentType'], BookBill['kind'] | null> = { I: 'purchaseBill', C: 'supplierCreditNote', D: 'supplierDebitNote', BOE: 'purchaseBill' };
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * Matches 2B to the books. `toleranceMinor` absorbs rounding (₹1 by default); `probableDays` is how
 * far apart dates may be, for a probable match and for one within tolerance. A bill matches at most
 * one line. A bill of entry carries the port, not a GSTIN, so it is matched on its number alone.
 * Bills dated after `periodEnd` (entered on the day they came) can match, but aren't chased.
 */
export function reconcile2b(lines: TwoBLine[], bills: BookBill[], opts: { toleranceMinor?: number; probableDays?: number; periodEnd?: string } = {}): Reconciliation {
  const tolerance = opts.toleranceMinor ?? 100;
  const probableDays = opts.probableDays ?? 3;
  const used = new Set<string>();
  const byKey = new Map<string, BookBill[]>();
  const keyOf = (kind: BookBill['kind'] | null, gstin: string, number: string, boe = false) => `${kind}|${boe ? '' : gstin}|${normalizeNumber(number)}`;
  for (const b of bills) {
    for (const key of [keyOf(b.kind, b.supplierGstin, b.number), keyOf(b.kind, '', b.number, true)]) byKey.set(key, [...(byKey.get(key) ?? []), b]);
  }
  const compare = (line: TwoBLine, bill: BookBill): Pick<Match, 'difference' | 'reasons'> & { same: boolean; close: boolean } => {
    const difference = { taxableMinor: line.taxableMinor - bill.taxableMinor, taxMinor: line.taxMinor - bill.taxMinor, days: Math.round(daysApart(line.date, bill.date)) };
    const reasons: MismatchReason[] = [];
    if (Math.abs(difference.taxableMinor) > tolerance) reasons.push('taxable');
    if (Math.abs(difference.taxMinor) > tolerance) reasons.push('tax');
    if (difference.days > 0) reasons.push('date');
    const amounts = !reasons.includes('taxable') && !reasons.includes('tax');
    return { same: amounts && difference.days === 0, close: amounts && difference.days <= probableDays, ...(reasons.length ? { difference, reasons } : {}) };
  };
  const matches: Match[] = lines.map((line) => {
    if (line.decision === 'notOurs') return { line, status: 'notOurs' as const };
    if (line.decision === 'claimLater') return { line, status: 'claimLater' as const };
    const kind = KIND_OF[line.documentType];
    const boe = line.documentType === 'BOE';
    // A person's link wins.
    const linked = line.linkedDocumentId ? bills.find((b) => b.id === line.linkedDocumentId && !used.has(b.id)) : undefined;
    const exact = linked ?? byKey.get(keyOf(kind, line.supplierGstin, line.number, boe))?.find((b) => !used.has(b.id));
    if (!exact) return { line, status: 'missingInBooks' as const };
    used.add(exact.id);
    const { same, close, ...diff } = compare(line, exact);
    if (linked || line.decision === 'accepted') {
      const reasons = normalizeNumber(exact.number) === normalizeNumber(line.number) ? diff.reasons : [...(diff.reasons ?? []), 'number' as const];
      return { line, bill: exact, status: exact.claimedIn ? 'claimed' : 'manuallyLinked', ...diff, ...(reasons?.length ? { reasons } : {}) };
    }
    const status: MatchStatus = !close ? 'partial' : exact.claimedIn ? 'claimed' : same ? 'matched' : 'matchedWithinTolerance';
    return { line, bill: exact, status, ...diff };
  });
  // Second pass: an unmatched line and an unmatched bill of one supplier with the same tax, days apart.
  for (const m of matches) {
    if (m.status !== 'missingInBooks') continue;
    const kind = KIND_OF[m.line.documentType];
    const near = bills.find(
      (b) => !used.has(b.id) && b.kind === kind && b.supplierGstin === m.line.supplierGstin && Math.abs(b.taxMinor - m.line.taxMinor) <= tolerance && daysApart(b.date, m.line.date) <= probableDays,
    );
    if (near) {
      used.add(near.id);
      const { difference, reasons = [] } = compare(m.line, near);
      Object.assign(m, { bill: near, status: 'probable', difference, reasons: [...reasons, 'number'] });
    }
  }
  const missingIn2b = bills.filter((b) => !used.has(b.id) && !b.claimedIn && (!opts.periodEnd || b.date <= opts.periodEnd));
  const claimableTaxMinor = matches
    .filter((m) => CLAIMABLE.includes(m.status) && m.line.itcAvailable)
    .reduce((a, m) => a + (m.line.documentType === 'C' ? -m.line.taxMinor : m.line.taxMinor), 0);
  return { matches, missingIn2b, claimableTaxMinor };
}
