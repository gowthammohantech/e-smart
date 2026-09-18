import { Money, add, money, subtract, sum, zero } from '@/lib/money';
import { BusinessDocument, Payment } from '@/types';
import { daysBetween, today } from '@/lib/date';

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
        total += a.amount.minor;
      }
    });
  });
  return currency ? money(total, currency) : null;
}

export function outstandingOf(doc: BusinessDocument, payments: Payment[]): Money {
  const currency = doc.totals.grandTotal.currency;
  const allocated = allocatedTo(doc.id, payments) ?? zero(currency);
  const paid = money(allocated.minor, currency);
  const remaining = subtract(doc.totals.grandTotal, paid);
  return remaining.minor < 0 ? zero(currency) : remaining;
}

export function bucketFor(daysOverdue: number): AgingBucketKey {
  const found = AGING_BUCKETS.find((b) => daysOverdue >= b.from && daysOverdue <= b.to);
  return found?.key ?? 'current';
}

export function buildOutstanding(
  docs: BusinessDocument[],
  payments: Payment[],
  asOf: string = today(),
): OutstandingDoc[] {
  return docs
    .filter((d) => !['draft', 'cancelled', 'rejected'].includes(d.status))
    .map((document) => {
      const currency = document.totals.grandTotal.currency;
      const allocated = allocatedTo(document.id, payments) ?? zero(currency);
      const outstanding = outstandingOf(document, payments);
      const daysOverdue = document.dueDate ? daysBetween(document.dueDate, asOf) : 0;
      return {
        document,
        allocated: money(allocated.minor, currency),
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
