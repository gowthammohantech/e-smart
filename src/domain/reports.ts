import { BusinessDocument, Item, Party, Payment } from '@/types';
import { Money, add, money, sum, zero } from '@/lib/money';
import { DateRange, inRange, monthKey } from '@/lib/date';

export type ReportFilters = {
  range: DateRange;
  branchId?: string | null;
  partyId?: string | null;
};

const LIVE_STATUSES = ['issued', 'partiallyPaid', 'paid', 'overdue', 'sent', 'confirmed', 'delivered', 'fulfilled', 'accepted', 'approved', 'processed'];

function isLive(d: BusinessDocument): boolean {
  return LIVE_STATUSES.includes(d.status);
}

function inBase(amount: Money, baseCurrency: string): Money {
  return money(amount.minor, baseCurrency);
}

function matches(d: BusinessDocument, f: ReportFilters): boolean {
  if (!inRange(d.date, f.range)) return false;
  if (f.branchId && d.branchId !== f.branchId) return false;
  if (f.partyId && d.partyId !== f.partyId) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Sales summary                                                       */
/* ------------------------------------------------------------------ */

export type SummaryRow = { label: string; value: Money; count: number };

export type TransactionSummary = {
  total: Money;
  taxable: Money;
  tax: Money;
  discount: Money;
  count: number;
  byMonth: { key: string; value: Money }[];
  byParty: SummaryRow[];
  byItem: SummaryRow[];
  byBranch: SummaryRow[];
  documents: BusinessDocument[];
};

export function summarizeDocuments(
  docs: BusinessDocument[],
  parties: Party[],
  items: Item[],
  branchNames: Record<string, string>,
  baseCurrency: string,
  filters: ReportFilters,
): TransactionSummary {
  const selected = docs.filter((d) => isLive(d) && matches(d, filters));

  const total = sum(selected.map((d) => inBase(d.totals.grandTotal, baseCurrency)), baseCurrency);
  const taxable = sum(selected.map((d) => inBase(d.totals.taxableAmount, baseCurrency)), baseCurrency);
  const tax = sum(selected.map((d) => inBase(d.totals.totalTax, baseCurrency)), baseCurrency);
  const discount = sum(
    selected.map((d) => inBase(add(d.totals.lineDiscount, d.totals.documentDiscount), baseCurrency)),
    baseCurrency,
  );

  const monthMap = new Map<string, Money>();
  selected.forEach((d) => {
    const k = monthKey(d.date);
    const v = inBase(d.totals.grandTotal, baseCurrency);
    monthMap.set(k, add(monthMap.get(k) ?? zero(baseCurrency), v));
  });

  const partyMap = new Map<string, { value: Money; count: number }>();
  selected.forEach((d) => {
    const cur = partyMap.get(d.partyId) ?? { value: zero(baseCurrency), count: 0 };
    partyMap.set(d.partyId, {
      value: add(cur.value, inBase(d.totals.grandTotal, baseCurrency)),
      count: cur.count + 1,
    });
  });

  const itemMap = new Map<string, { value: Money; count: number }>();
  selected.forEach((d) => {
    d.lines.forEach((l) => {
      if (!l.itemId) return;
      const lineValue = money(Math.round(l.unitPrice.minor * l.quantity), baseCurrency);
      const cur = itemMap.get(l.itemId) ?? { value: zero(baseCurrency), count: 0 };
      itemMap.set(l.itemId, { value: add(cur.value, lineValue), count: cur.count + l.quantity });
    });
  });

  const branchMap = new Map<string, { value: Money; count: number }>();
  selected.forEach((d) => {
    const cur = branchMap.get(d.branchId) ?? { value: zero(baseCurrency), count: 0 };
    branchMap.set(d.branchId, {
      value: add(cur.value, inBase(d.totals.grandTotal, baseCurrency)),
      count: cur.count + 1,
    });
  });

  const toRows = (
    map: Map<string, { value: Money; count: number }>,
    nameOf: (id: string) => string,
  ): SummaryRow[] =>
    Array.from(map.entries())
      .map(([id, v]) => ({ label: nameOf(id), value: v.value, count: v.count }))
      .sort((a, b) => b.value.minor - a.value.minor);

  return {
    total,
    taxable,
    tax,
    discount,
    count: selected.length,
    byMonth: Array.from(monthMap.entries())
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    byParty: toRows(partyMap, (id) => parties.find((p) => p.id === id)?.name ?? 'Unknown'),
    byItem: toRows(itemMap, (id) => items.find((i) => i.id === id)?.name ?? 'Unknown'),
    byBranch: toRows(branchMap, (id) => branchNames[id] ?? 'Unknown'),
    documents: selected,
  };
}

/* ------------------------------------------------------------------ */
/* Tax summary (GSTR-style)                                            */
/* ------------------------------------------------------------------ */

export type TaxSummaryRow = {
  rate: number;
  taxable: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  total: Money;
};

export type TaxSummary = {
  outward: TaxSummaryRow[];
  outwardTotal: Money;
};

function taxRows(docs: BusinessDocument[], baseCurrency: string, filters: ReportFilters): TaxSummaryRow[] {
  const map = new Map<number, TaxSummaryRow>();
  docs
    .filter((d) => isLive(d) && matches(d, filters))
    .forEach((d) => {
      d.totals.taxLines.forEach((tl) => {
        const row =
          map.get(tl.rate) ??
          {
            rate: tl.rate,
            taxable: zero(baseCurrency),
            cgst: zero(baseCurrency),
            sgst: zero(baseCurrency),
            igst: zero(baseCurrency),
            total: zero(baseCurrency),
          };
        row.taxable = add(row.taxable, inBase(tl.taxableAmount, baseCurrency));
        tl.components.forEach((c) => {
          const v = inBase(c.amount, baseCurrency);
          if (c.type === 'CGST') row.cgst = add(row.cgst, v);
          else if (c.type === 'SGST') row.sgst = add(row.sgst, v);
          else if (c.type === 'IGST') row.igst = add(row.igst, v);
          row.total = add(row.total, v);
        });
        map.set(tl.rate, row);
      });
    });
  return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
}

export function summarizeTax(
  documents: BusinessDocument[],
  baseCurrency: string,
  filters: ReportFilters,
): TaxSummary {
  const outward = taxRows(documents.filter((d) => d.kind === 'invoice'), baseCurrency, filters);
  return { outward, outwardTotal: sum(outward.map((r) => r.total), baseCurrency) };
}

/* ------------------------------------------------------------------ */
/* Payments / cash                                                     */
/* ------------------------------------------------------------------ */

export type PaymentSummary = {
  received: Money;
  byMethod: SummaryRow[];
  byAccount: SummaryRow[];
  byMonth: { key: string; received: Money }[];
  payments: Payment[];
};

export function summarizePayments(
  payments: Payment[],
  accountNames: Record<string, string>,
  methodLabels: Record<string, string>,
  baseCurrency: string,
  filters: ReportFilters,
): PaymentSummary {
  const selected = payments.filter(
    (p) =>
      inRange(p.date, filters.range) &&
      (!filters.branchId || p.branchId === filters.branchId) &&
      (!filters.partyId || p.partyId === filters.partyId),
  );

  const received = sum(selected.map((p) => inBase(p.amount, baseCurrency)), baseCurrency);

  const methodMap = new Map<string, { value: Money; count: number }>();
  const accountMap = new Map<string, { value: Money; count: number }>();
  const monthMap = new Map<string, { received: Money }>();

  selected.forEach((p) => {
    const v = inBase(p.amount, baseCurrency);
    const m = methodMap.get(p.method) ?? { value: zero(baseCurrency), count: 0 };
    methodMap.set(p.method, { value: add(m.value, v), count: m.count + 1 });
    const a = accountMap.get(p.accountId) ?? { value: zero(baseCurrency), count: 0 };
    accountMap.set(p.accountId, { value: add(a.value, v), count: a.count + 1 });
    const k = monthKey(p.date);
    const cur = monthMap.get(k) ?? { received: zero(baseCurrency) };
    cur.received = add(cur.received, v);
    monthMap.set(k, cur);
  });

  return {
    received,
    byMethod: Array.from(methodMap.entries())
      .map(([id, v]) => ({ label: methodLabels[id] ?? id, value: v.value, count: v.count }))
      .sort((a, b) => b.value.minor - a.value.minor),
    byAccount: Array.from(accountMap.entries())
      .map(([id, v]) => ({ label: accountNames[id] ?? id, value: v.value, count: v.count }))
      .sort((a, b) => b.value.minor - a.value.minor),
    byMonth: Array.from(monthMap.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    payments: selected,
  };
}
