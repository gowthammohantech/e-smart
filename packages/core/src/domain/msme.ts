import { addDaysISO, daysBetween, financialYearOf } from '../lib/date';
import { BusinessDocument, Party, Payment } from '../types';
import { outstandingOf, settledBy } from './receivables';

/**
 * Paying micro and small suppliers on time (MSMED Act s.15): by the day agreed, which can't be more
 * than 45 days after the bill, or within 15 days when nothing was agreed. Paid late, the buyer owes
 * interest at three times the bank rate, compounded monthly (s.16), and can't deduct the bill in the
 * year it was bought (Income-tax Act s.43B(h)). Medium enterprises are outside both rules.
 */

/** RBI's bank rate, percent; s.16 interest is three times it. Shown for information; update when RBI changes it. */
export const BANK_RATE_PERCENT = 5.5;
export const MSME_MAX_DAYS = 45;
export const MSME_DEFAULT_DAYS = 15;
/** Days before the due date the business is reminded. */
export const MSME_WARN_DAYS = 7;

const COVERED = ['micro', 'small'];
export const isMsmeCovered = (party?: Pick<Party, 'msmeType'>) => !!party?.msmeType && COVERED.includes(party.msmeType);

/** The last day a covered supplier's bill can be paid on time. */
export function msmeDueDate(bill: Pick<BusinessDocument, 'date' | 'dueDate'>): string {
  const cap = addDaysISO(bill.date, MSME_MAX_DAYS);
  // No terms: a bill due the day it is dated records no agreement.
  if (!bill.dueDate || bill.dueDate <= bill.date) return addDaysISO(bill.date, MSME_DEFAULT_DAYS);
  return bill.dueDate < cap ? bill.dueDate : cap;
}

/** s.16 interest on an amount paid `days` late: monthly rests at three times the bank rate. */
export function msmeInterest(amountMinor: number, days: number, bankRate = BANK_RATE_PERCENT): number {
  if (days <= 0 || amountMinor <= 0) return 0;
  const monthly = (3 * bankRate) / 100 / 12;
  return Math.round(amountMinor * (Math.pow(1 + monthly, days / 30) - 1));
}

export type MsmePayable = {
  documentId: string;
  number: string;
  supplierDocNumber?: string;
  partyId: string;
  msmeType: 'micro' | 'small';
  date: string;
  dueDate: string;
  /** Still owed, in the bill's currency. */
  outstandingMinor: number;
  currency: string;
  /** Negative once overdue. */
  daysLeft: number;
  interestMinor: number;
};

const BILLS = ['purchaseBill'];
const OFF = ['draft', 'requested', 'cancelled', 'rejected'];

/** Covered suppliers' bills still unpaid on `asOf`, most urgent first. */
export function msmePayables(asOf: string, bills: BusinessDocument[], parties: Party[], payments: Payment[]): MsmePayable[] {
  const byId = new Map(parties.map((p) => [p.id, p]));
  const paidBy = payments.filter((p) => p.date <= asOf);
  const out: MsmePayable[] = [];
  for (const b of bills) {
    const party = byId.get(b.partyId);
    if (!BILLS.includes(b.kind) || OFF.includes(b.status) || b.date > asOf || !isMsmeCovered(party)) continue;
    const outstanding = outstandingOf(b, paidBy).minor;
    if (outstanding <= 0) continue;
    const dueDate = msmeDueDate(b);
    const daysLeft = daysBetween(asOf, dueDate);
    out.push({
      documentId: b.id,
      number: b.number,
      supplierDocNumber: b.supplierDocNumber,
      partyId: b.partyId,
      msmeType: party!.msmeType as 'micro' | 'small',
      date: b.date,
      dueDate,
      outstandingMinor: outstanding,
      currency: b.currency,
      daysLeft,
      interestMinor: msmeInterest(outstanding, -daysLeft),
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export type Sec43bhRow = { documentId: string; number: string; partyId: string; date: string; dueDate: string; notPaidInTimeMinor: number; currency: string };

/**
 * For the CA at the year end: covered suppliers' bills of the financial year containing `asOf` whose
 * time limit has passed without them being paid in full. What wasn't paid in time can't be deducted
 * this year (s.43B(h)); it is deducted in the year it is paid.
 */
export function sec43bh(asOf: string, bills: BusinessDocument[], parties: Party[], payments: Payment[], fyStartMonth = 4): Sec43bhRow[] {
  const fy = financialYearOf(asOf, fyStartMonth);
  const byId = new Map(parties.map((p) => [p.id, p]));
  const out: Sec43bhRow[] = [];
  for (const b of bills) {
    if (!BILLS.includes(b.kind) || OFF.includes(b.status) || b.date < fy.start || b.date > fy.end || !isMsmeCovered(byId.get(b.partyId))) continue;
    const dueDate = msmeDueDate(b);
    if (dueDate >= asOf) continue;
    const inTime = payments
      .filter((p) => p.date <= dueDate)
      .reduce((s, p) => s + p.allocations.filter((a) => a.documentId === b.id).reduce((t, a) => t + settledBy(a), 0), 0);
    const owed = b.totals.grandTotal.minor - (b.tds?.amount.minor ?? 0);
    const late = owed - inTime;
    if (late > 0) out.push({ documentId: b.id, number: b.number, partyId: b.partyId, date: b.date, dueDate, notPaidInTimeMinor: late, currency: b.currency });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
