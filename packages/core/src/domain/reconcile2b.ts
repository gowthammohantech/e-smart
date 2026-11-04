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
  /** Same supplier and number, but the amount or date differs. */
  | 'partial'
  /** Same supplier and amount within days of each other: likely the same bill under another number. */
  | 'probable'
  /** In 2B, not in the books: a bill not entered yet, or not ours. */
  | 'missingInBooks'
  /** A person said it isn't ours. */
  | 'notOurs'
  /** A person put it off to a later month. */
  | 'claimLater';

export type Match = {
  line: TwoBLine;
  status: MatchStatus;
  bill?: BookBill;
  /** What differs on a partial match, in paise (2B minus books). */
  difference?: { taxableMinor: number; taxMinor: number; days: number };
};

export type Reconciliation = {
  matches: Match[];
  /** Bills in the books for the period that no line of 2B accounts for: chase the supplier. */
  missingIn2b: BookBill[];
  /** Credit the period can claim: matched and accepted lines that 2B marks available. */
  claimableTaxMinor: number;
};

/**
 * "INV/24-25/0012", "inv-12" and "INV 0012" are one bill: case, separators, leading zeros and a
 * financial-year segment don't count.
 */
export function normalizeNumber(n: string): string {
  return n
    .toUpperCase()
    .replace(/\b(20)?\d{2}[-/](20)?\d{2}\b/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^([A-Z]*)0+(?=\d)/, '$1');
}

const KIND_OF: Record<TwoBLine['documentType'], BookBill['kind'] | null> = { I: 'purchaseBill', C: 'supplierCreditNote', D: 'supplierDebitNote', BOE: 'purchaseBill' };
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * Matches 2B to the books. `toleranceMinor` absorbs rounding (₹1 by default); `probableDays` is how
 * far apart a probable match's dates may be. A bill matches at most one line.
 */
export function reconcile2b(lines: TwoBLine[], bills: BookBill[], opts: { toleranceMinor?: number; probableDays?: number } = {}): Reconciliation {
  const tolerance = opts.toleranceMinor ?? 100;
  const probableDays = opts.probableDays ?? 3;
  const used = new Set<string>();
  const byKey = new Map<string, BookBill[]>();
  for (const b of bills) {
    const key = `${b.kind}|${b.supplierGstin}|${normalizeNumber(b.number)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), b]);
  }
  const matches: Match[] = lines.map((line) => {
    if (line.decision === 'notOurs') return { line, status: 'notOurs' as const };
    if (line.decision === 'claimLater') return { line, status: 'claimLater' as const };
    const kind = KIND_OF[line.documentType];
    // A person's link wins.
    const linked = line.linkedDocumentId ? bills.find((b) => b.id === line.linkedDocumentId) : undefined;
    const exact = linked ?? byKey.get(`${kind}|${line.supplierGstin}|${normalizeNumber(line.number)}`)?.find((b) => !used.has(b.id));
    if (exact) {
      used.add(exact.id);
      const difference = { taxableMinor: line.taxableMinor - exact.taxableMinor, taxMinor: line.taxMinor - exact.taxMinor, days: Math.round(daysApart(line.date, exact.date)) };
      const same = Math.abs(difference.taxableMinor) <= tolerance && Math.abs(difference.taxMinor) <= tolerance && difference.days === 0;
      return { line, bill: exact, status: same || line.decision === 'accepted' ? 'matched' : 'partial', ...(same ? {} : { difference }) };
    }
    return { line, status: 'missingInBooks' as const };
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
      m.bill = near;
      m.status = 'probable';
    }
  }
  const missingIn2b = bills.filter((b) => !used.has(b.id) && !b.claimedIn);
  const claimableTaxMinor = matches
    .filter((m) => m.status === 'matched' && m.line.itcAvailable)
    .reduce((a, m) => a + (m.line.documentType === 'C' ? -m.line.taxMinor : m.line.taxMinor), 0);
  return { matches, missingIn2b, claimableTaxMinor };
}
