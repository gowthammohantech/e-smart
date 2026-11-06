import { utilizeItc, type TaxKind } from './gstr3b';
import type { Posting } from './ledger/postings';

/**
 * The GST set-off (utilization) a business records itself, for a GSTIN and return period
 * (RULES 6.21, pending CA). The tax comes from the GSTR-3B data, never from the Output ledger:
 * forward-charge tax (3.1 a and b) may be paid by credit in the rule 88A order, reverse-charge tax
 * (3.1 d), interest and the late fee only in cash from the electronic cash ledger. Older reverse-charge
 * tax still in Reverse charge payable (before RCM_OUTPUT_FROM) can be paid from the cash ledger too.
 * Amounts are paise, by head.
 */

export type Heads = Record<TaxKind, number>;
export const HEADS: TaxKind[] = ['igst', 'cgst', 'sgst', 'cess'];
export const zeroHeads = (): Heads => ({ igst: 0, cgst: 0, sgst: 0, cess: 0 });
const cap = (k: TaxKind) => k.charAt(0).toUpperCase() + k.slice(1);
const sum = (h: Heads) => h.igst + h.cgst + h.sgst + h.cess;

export type SetOff = {
  /** Credit used: credit[from][to]. */
  credit: Record<TaxKind, Heads>;
  /** Forward-charge tax paid in cash, by head. */
  cash: Heads;
  /** Reverse-charge tax of the period, paid in cash. */
  reverseCharge: Heads;
  /** Older reverse-charge tax (Reverse charge payable) paid now from the cash ledger. */
  oldReverseCharge: Heads;
  interest: Heads;
  lateFee: Heads;
};

export type SetOffInput = {
  /** 3.1(a) and (b): may be paid by credit. */
  forward: Heads;
  /** 3.1(d): cash only. */
  reverseCharge: Heads;
  /** Credit to use: this period's net (4C) plus what the last return carried forward. */
  available: Heads;
  /** The electronic cash ledger, as the books hold it on the set-off date. */
  cashBalance: Heads;
  /** Open Reverse charge payable from before the change, payable from the cash ledger. */
  oldReverseChargeOpen: Heads;
  interest: Heads;
  lateFee: Heads;
};

/** The set-off as the law orders it (utilizeItc), with interest and the late fee in cash. Old reverse charge is left for the user to choose. */
export function prefillSetOff(i: SetOffInput): SetOff {
  const u = utilizeItc(i.forward, zeroHeads(), i.available);
  const cash = zeroHeads();
  for (const k of HEADS) cash[k] = Math.max(i.forward[k], 0) - HEADS.reduce((a, from) => a + u.credit[from][k], 0);
  return {
    credit: u.credit,
    cash,
    reverseCharge: { ...i.reverseCharge },
    oldReverseCharge: zeroHeads(),
    interest: { ...i.interest },
    lateFee: { ...i.lateFee },
  };
}

/** What the set-off takes from the cash ledger, by head. */
export function cashUsed(s: SetOff): Heads {
  const out = zeroHeads();
  for (const k of HEADS) out[k] = s.cash[k] + s.reverseCharge[k] + s.oldReverseCharge[k] + s.interest[k] + s.lateFee[k];
  return out;
}

export type SetOffIssue = { field: string; message: string; code?: 'CASH_LEDGER_SHORT' };

/** Credit may pay: IGST any head but cess, CGST CGST or IGST, SGST SGST or IGST, cess only cess. */
export const creditMayPay = (from: TaxKind, to: TaxKind): boolean =>
  from === 'cess' || to === 'cess' ? from === to : from === to || from === 'igst' || to === 'igst';

/** Everything wrong with a set-off: the rule 88A order, credit and cash it doesn't have, tax left unpaid. */
export function setOffIssues(i: SetOffInput, s: SetOff): SetOffIssue[] {
  const issues: SetOffIssue[] = [];
  const all: [string, Heads][] = [['cash', s.cash], ['reverseCharge', s.reverseCharge], ['oldReverseCharge', s.oldReverseCharge], ['interest', s.interest], ['lateFee', s.lateFee], ...HEADS.map((k): [string, Heads] => [`credit.${k}`, s.credit[k]])];
  for (const [field, h] of all) for (const k of HEADS) if (!Number.isInteger(h[k]) || h[k] < 0) issues.push({ field: `${field}.${k}`, message: 'Amounts cannot be negative' });
  if (issues.length) return issues;
  for (const from of HEADS) {
    for (const to of HEADS) if (s.credit[from][to] && !creditMayPay(from, to)) issues.push({ field: `credit.${from}.${to}`, message: `${from.toUpperCase()} credit cannot pay ${to.toUpperCase()}` });
    const used = sum(s.credit[from]);
    if (used > Math.max(i.available[from], 0)) issues.push({ field: `credit.${from}`, message: `Only ${(i.available[from] / 100).toFixed(2)} of ${from.toUpperCase()} credit is available` });
  }
  // Rule 88A: IGST credit is used up (on IGST, then CGST and SGST) before CGST or SGST credit.
  const igstLeft = Math.max(i.available.igst, 0) - sum(s.credit.igst);
  const ownUsed = s.credit.cgst.cgst + s.credit.cgst.igst + s.credit.sgst.sgst + s.credit.sgst.igst;
  if (igstLeft > 0 && ownUsed > 0) issues.push({ field: 'credit.igst', message: 'Use IGST credit first, before CGST or SGST credit (rule 88A)' });
  // IGST tax is paid from IGST credit before CGST or SGST credit pays it.
  if ((s.credit.cgst.igst || s.credit.sgst.igst) && s.credit.igst.igst < Math.min(Math.max(i.available.igst, 0), Math.max(i.forward.igst, 0))) {
    issues.push({ field: 'credit.igst.igst', message: 'IGST tax is paid from IGST credit first' });
  }
  for (const k of HEADS) {
    const paid = HEADS.reduce((a, from) => a + s.credit[from][k], 0) + s.cash[k];
    const owed = Math.max(i.forward[k], 0);
    if (paid !== owed) issues.push({ field: `cash.${k}`, message: `${k.toUpperCase()} payable is ${(owed / 100).toFixed(2)}; credit and cash pay ${(paid / 100).toFixed(2)}` });
    if (s.reverseCharge[k] !== Math.max(i.reverseCharge[k], 0)) issues.push({ field: `reverseCharge.${k}`, message: 'Reverse-charge tax is paid in full, in cash' });
    if (s.oldReverseCharge[k] > Math.max(i.oldReverseChargeOpen[k], 0)) issues.push({ field: `oldReverseCharge.${k}`, message: `Only ${(i.oldReverseChargeOpen[k] / 100).toFixed(2)} of older reverse charge is open` });
  }
  const needed = cashUsed(s);
  const short = HEADS.filter((k) => needed[k] > Math.max(i.cashBalance[k], 0));
  for (const k of short) issues.push({ field: `cashBalance.${k}`, message: `The GST cash ledger holds ${(Math.max(i.cashBalance[k], 0) / 100).toFixed(2)} of ${k.toUpperCase()}; this set-off needs ${(needed[k] / 100).toFixed(2)}. Record a challan first`, code: 'CASH_LEDGER_SHORT' });
  return issues;
}

export type JournalLine = { account: string; debitMinor: number; creditMinor: number };

/**
 * The GST journal for a set-off: Dr Output / Cr Input for credit used; Dr Output (forward cash and
 * reverse charge), Dr Reverse charge payable (older), Dr Interest on GST and Late fee / Cr GST cash
 * ledger for cash used. One line per account and side.
 */
export function setOffLines(s: SetOff): JournalLine[] {
  const dr = new Map<string, number>();
  const cr = new Map<string, number>();
  const add = (m: Map<string, number>, account: string, v: number) => v && m.set(account, (m.get(account) ?? 0) + v);
  for (const from of HEADS) for (const to of HEADS) {
    add(dr, `sys:output${cap(to)}`, s.credit[from][to]);
    add(cr, `sys:input${cap(from)}`, s.credit[from][to]);
  }
  const cash = cashUsed(s);
  for (const k of HEADS) {
    add(dr, `sys:output${cap(k)}`, s.cash[k] + s.reverseCharge[k]);
    add(dr, `sys:rcmPayable${cap(k)}`, s.oldReverseCharge[k]);
    add(dr, 'sys:gstInterest', s.interest[k]);
    add(dr, 'sys:gstLateFee', s.lateFee[k]);
    add(cr, `sys:gstCashLedger:${k}`, cash[k]);
  }
  return [...[...dr].map(([account, v]) => ({ account, debitMinor: v, creditMinor: 0 })), ...[...cr].map(([account, v]) => ({ account, debitMinor: 0, creditMinor: v }))];
}

/** A key's balance (debit positive) over postings on or before `asOf`, of the given branches when listed. */
function balance(postings: Posting[], account: string, asOf: string, branchIds?: string[], from?: string, skip?: (p: Posting) => boolean): number {
  let b = 0;
  for (const p of postings) {
    if (p.account !== account || p.date > asOf || (from && p.date < from)) continue;
    if (branchIds?.length && p.branchId && !branchIds.includes(p.branchId)) continue;
    if (skip?.(p)) continue;
    b += p.debit - p.credit;
  }
  return b;
}

/** The electronic cash ledger by head on `asOf` (a debit balance is money there). */
export function cashLedgerBalance(postings: Posting[], asOf: string, branchIds?: string[]): Heads {
  const out = zeroHeads();
  for (const k of HEADS) out[k] = balance(postings, `sys:gstCashLedger:${k}`, asOf, branchIds);
  return out;
}

/** Reverse charge payable from before the change still owed on `asOf` (a credit balance). */
export function oldReverseChargeOpen(postings: Posting[], asOf: string, branchIds?: string[]): Heads {
  const out = zeroHeads();
  for (const k of HEADS) out[k] = Math.max(-balance(postings, `sys:rcmPayable${cap(k)}`, asOf, branchIds), 0);
  return out;
}

export type OutputCheck = { books: Heads; expected: Heads; difference: Heads; ok: boolean };

/**
 * The Output ledger should carry what 3B says is owed: the tax credited to Output over the period
 * (set-off journals left out) against forward plus reverse-charge liability. Off by more than a
 * rupee a head means something is in one and not the other (a document dated in another month, a
 * journal to Output by hand, an amendment); the screen warns, nothing is blocked.
 */
export function outputCheck(postings: Posting[], range: { from: string; to: string }, liability: { forward: Heads; reverseCharge: Heads }, opts: { branchIds?: string[]; isSetOff?: (p: Posting) => boolean } = {}): OutputCheck {
  const books = zeroHeads();
  const expected = zeroHeads();
  const difference = zeroHeads();
  for (const k of HEADS) {
    books[k] = -balance(postings, `sys:output${cap(k)}`, range.to, opts.branchIds, range.from, opts.isSetOff);
    expected[k] = liability.forward[k] + liability.reverseCharge[k];
    difference[k] = books[k] - expected[k];
  }
  return { books, expected, difference, ok: HEADS.every((k) => Math.abs(difference[k]) <= 100) };
}
