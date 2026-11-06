import { Money, add, money, subtract, sum, zero } from '../lib/money';
import { BusinessDocument, Payment, PaymentAllocation } from '../types';
import { daysBetween, today } from '../lib/date';
import { CREDIT_KINDS } from './documentStates';

export type AgingBucketKey = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90plus';

export const AGING_BUCKETS: { key: AgingBucketKey; label: string; from: number; to: number }[] = [
  { key: 'current', label: 'Current', from: -99999, to: 0 },
  { key: 'd1_30', label: '1–30', from: 1, to: 30 },
  { key: 'd31_60', label: '31–60', from: 31, to: 60 },
  { key: 'd61_90', label: '61–90', from: 61, to: 90 },
  { key: 'd90plus', label: '90+', from: 91, to: 99999 },
];

export type OutstandingDoc = {
  document: BusinessDocument;
  allocated: Money;
  outstanding: Money;
  daysOverdue: number;
  bucket: AgingBucketKey;
};

/** What one allocation settles: its cash, plus TDS deducted, discount and write-off. */
export function settledBy(a: PaymentAllocation): number {
  return a.amount.minor + (a.tdsDeducted?.minor ?? 0) + (a.discount?.minor ?? 0) + (a.writeOff?.minor ?? 0);
}

/**
 * invoice_total - allocated_payments - adjustments = outstanding  (FRD 18)
 */
export function allocatedTo(documentId: string, payments: Payment[]): Money | null {
  let currency: string | null = null;
  let total = 0;
  payments.forEach((p) => {
    p.allocations.forEach((a) => {
      if (a.documentId === documentId) {
        currency = currency ?? a.amount.currency;
        total += settledBy(a);
      }
    });
  });
  return currency ? money(total, currency) : null;
}

/** A return or note that counts: neither waiting on approval nor voided. */
const LIVE_CREDIT = (d: BusinessDocument) => !['draft', 'requested', 'cancelled', 'rejected'].includes(d.status);

/**
 * What live returns and credit notes against a document take off it, net of
 * the TDS a supplier credit note gives back, which was never owed to the supplier.
 */
export function creditedTo(documentId: string, documents: BusinessDocument[]): number {
  return documents
    .filter((d) => d.sourceDocumentId === documentId && CREDIT_KINDS.includes(d.kind) && LIVE_CREDIT(d))
    .reduce((acc, d) => acc + d.totals.grandTotal.minor - (d.tds?.amount.minor ?? 0), 0);
}

/**
 * Pass `documents` (any superset of the company's documents) so returns and
 * credit notes raised against `doc` count, as the server's settlement does.
 */
export function outstandingOf(doc: BusinessDocument, payments: Payment[], documents: BusinessDocument[] = []): Money {
  if (doc.status === 'cancelled' || doc.status === 'rejected') return zero(doc.currency);
  const allocated = allocatedTo(doc.id, payments) ?? zero(doc.currency);
  // TDS the business deducted is paid to the government, not the supplier.
  const paid = money(allocated.minor + (doc.tds?.amount.minor ?? 0) + creditedTo(doc.id, documents), doc.currency);
  const remaining = subtract(doc.totals.grandTotal, paid);
  return remaining.minor < 0 ? zero(doc.currency) : remaining;
}

export function bucketFor(daysOverdue: number): AgingBucketKey {
  const found = AGING_BUCKETS.find((b) => daysOverdue >= b.from && daysOverdue <= b.to);
  return found?.key ?? 'current';
}

export function buildOutstanding(
  docs: BusinessDocument[],
  payments: Payment[],
  asOf: string = today(),
  documents: BusinessDocument[] = [],
): OutstandingDoc[] {
  return docs
    .filter((d) => !['draft', 'cancelled', 'rejected'].includes(d.status))
    .map((document) => {
      const allocated = allocatedTo(document.id, payments) ?? zero(document.currency);
      const outstanding = outstandingOf(document, payments, documents);
      const daysOverdue = document.dueDate ? daysBetween(document.dueDate, asOf) : 0;
      return {
        document,
        allocated: money(allocated.minor, document.currency),
        outstanding,
        daysOverdue,
        bucket: bucketFor(daysOverdue),
      };
    })
    .filter((o) => o.outstanding.minor > 0);
}

export type AgingSummary = {
  currency: string;
  total: Money;
  overdue: Money;
  dueSoon: Money;
  buckets: { key: AgingBucketKey; label: string; amount: Money; count: number }[];
};

export function summarizeAging(
  outstanding: OutstandingDoc[],
  baseCurrency: string,
  dueSoonDays = 7,
): AgingSummary {
  const toBase = (o: OutstandingDoc) =>
    money(Math.round(o.outstanding.minor * (o.document.exchangeRate || 1)), baseCurrency);

  const buckets = AGING_BUCKETS.map((b) => {
    const rows = outstanding.filter((o) => o.bucket === b.key);
    return {
      key: b.key,
      label: b.label,
      amount: sum(rows.map(toBase), baseCurrency),
      count: rows.length,
    };
  });

  const overdueRows = outstanding.filter((o) => o.daysOverdue > 0);
  const dueSoonRows = outstanding.filter((o) => o.daysOverdue <= 0 && o.daysOverdue >= -dueSoonDays);

  return {
    currency: baseCurrency,
    total: sum(outstanding.map(toBase), baseCurrency),
    overdue: sum(overdueRows.map(toBase), baseCurrency),
    dueSoon: sum(dueSoonRows.map(toBase), baseCurrency),
    buckets,
  };
}

/** Running balance for a party statement. */
export function partyBalance(
  docs: BusinessDocument[],
  payments: Payment[],
  openingBalance: Money,
  baseCurrency: string,
): Money {
  const invoiced = sum(
    docs
      .filter((d) => !['draft', 'cancelled', 'rejected'].includes(d.status))
      .map((d) => money(Math.round(d.totals.grandTotal.minor * (d.exchangeRate || 1)), baseCurrency)),
    baseCurrency,
  );
  const received = sum(
    payments.map((p) => money(Math.round(p.amount.minor * (p.exchangeRate || 1)), baseCurrency)),
    baseCurrency,
  );
  return subtract(add(money(openingBalance.minor, baseCurrency), invoiced), received);
}

export function statusForOutstanding(
  doc: BusinessDocument,
  outstanding: Money,
  asOf: string = today(),
): BusinessDocument['status'] {
  if (doc.status === 'draft' || doc.status === 'cancelled') return doc.status;
  if (outstanding.minor <= 0) return 'paid';
  const partly = outstanding.minor < doc.totals.grandTotal.minor;
  if (doc.dueDate && daysBetween(doc.dueDate, asOf) > 0) return 'overdue';
  return partly ? 'partiallyPaid' : 'issued';
}

/** Credit a party holds (an advance, a direct note) and a document it still owes, for FIFO matching. */
export type FifoCredit = { id: string; date: string; left: number; currency?: string };
export type FifoOpen = { id: string; date: string; outstanding: number; currency?: string };
export type FifoMatch = { creditId: string; documentId: string; amount: number };

/**
 * Oldest credit first against the oldest document first, same currency only. Credits are taken in
 * the order given when their dates are equal (so callers can put notes before payments). Pure: the
 * app and the server both use it, so an adjustment comes out the same on either.
 */
export function fifoAllocate(credits: FifoCredit[], open: FifoOpen[]): FifoMatch[] {
  const docs = open.map((o, i) => ({ ...o, i })).sort((a, b) => a.date.localeCompare(b.date) || a.i - b.i);
  const left = new Map(docs.map((d) => [d.id, d.outstanding]));
  const out: FifoMatch[] = [];
  credits
    .map((c, i) => ({ ...c, i }))
    .filter((c) => c.left > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.i - b.i)
    .forEach((c) => {
      let remaining = c.left;
      for (const d of docs) {
        if (remaining <= 0) break;
        if (c.currency && d.currency && c.currency !== d.currency) continue;
        const take = Math.min(remaining, left.get(d.id) ?? 0);
        if (take <= 0) continue;
        out.push({ creditId: c.id, documentId: d.id, amount: take });
        left.set(d.id, (left.get(d.id) ?? 0) - take);
        remaining -= take;
      }
    });
  return out;
}

/**
 * Adjust a party's advances (the unallocated part of earlier payments) against
 * its open documents: oldest advance first, oldest document first. Only
 * same-currency pairs are matched. Returns the payments that changed, with
 * their allocations extended and `unallocated` reduced.
 */
export function allocateAdvances(docs: BusinessDocument[], payments: Payment[]): Payment[] {
  const open = buildOutstanding(docs, payments);
  const matches = fifoAllocate(
    payments.map((p) => ({ id: p.id, date: p.date, left: p.unallocated.minor, currency: p.currency })),
    open.map((o) => ({ id: o.document.id, date: o.document.date, outstanding: o.outstanding.minor, currency: o.document.currency })),
  );
  const changed: Payment[] = [];
  for (const p of payments) {
    const mine = matches.filter((m) => m.creditId === p.id);
    if (!mine.length) continue;
    const allocations = p.allocations.map((a) => ({ ...a }));
    for (const m of mine) {
      const existing = allocations.find((a) => a.documentId === m.documentId);
      if (existing) existing.amount = money(existing.amount.minor + m.amount, p.currency);
      else allocations.push({ documentId: m.documentId, documentNumber: open.find((o) => o.document.id === m.documentId)!.document.number, amount: money(m.amount, p.currency) });
    }
    changed.push({ ...p, allocations, unallocated: money(p.unallocated.minor - mine.reduce((a, m) => a + m.amount, 0), p.currency) });
  }
  return changed;
}

/**
 * A party's opening balance is its oldest debt, so its advances settle that
 * first. A positive opening is owed in the party's direction (a customer owes
 * the business, the business owes a supplier); a negative one is an advance.
 */
export function applyOpening(openingMinor: number, advanceMinor: number): { opening: number; advance: number } {
  if (openingMinor <= 0) return { opening: 0, advance: advanceMinor - openingMinor };
  return { opening: Math.max(openingMinor - advanceMinor, 0), advance: Math.max(advanceMinor - openingMinor, 0) };
}

/** Total advance a party holds, in one currency. */
export function availableAdvance(payments: Payment[], currency: string): Money {
  return money(
    payments.filter((p) => p.currency === currency).reduce((acc, p) => acc + p.unallocated.minor, 0),
    currency,
  );
}

export type CreditCheck = {
  /** Open invoices plus the new one, in the limit's currency. */
  exposure: Money;
  limit: Money;
  exceeds: boolean;
};

/**
 * Would a new invoice take the party past its credit limit? Everything is
 * converted into the limit's currency through base, using `rateToBase`.
 * `excludeDocumentId` keeps a draft being re-finalised from counting twice.
 */
export function checkCreditLimit(opts: {
  limit: Money;
  partyId: string;
  documents: BusinessDocument[];
  payments: Payment[];
  newTotal: Money;
  excludeDocumentId?: string;
  rateToBase: (currency: string) => number;
}): CreditCheck {
  const { limit, partyId, documents, payments, newTotal, excludeDocumentId, rateToBase } = opts;
  const limitRate = rateToBase(limit.currency) || 1;
  const inLimit = (m: Money) =>
    m.currency === limit.currency ? m.minor : Math.round((m.minor * (rateToBase(m.currency) || 1)) / limitRate);
  const open = buildOutstanding(
    documents.filter((d) => d.kind === 'invoice' && d.partyId === partyId && d.id !== excludeDocumentId),
    payments,
  );
  const exposureMinor = open.reduce((acc, o) => acc + inLimit(o.outstanding), 0) + inLimit(newTotal);
  const exposure = money(exposureMinor, limit.currency);
  return { exposure, limit, exceeds: limit.minor > 0 && exposureMinor > limit.minor };
}
