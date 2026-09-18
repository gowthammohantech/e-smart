import {
  BusinessDocument,
  Expense,
  ExpenseCategory,
  Item,
  Party,
  Payment,
  StockMovement,
  TaxCategory,
} from '@/types';
import { Money, add, money, subtract, sum, zero } from '@/lib/money';
import { DateRange, inRange, monthKey } from '@/lib/date';
import { stockOnHand, stockValue } from './stockLedger';

export type ReportFilters = {
  range: DateRange;
  branchId?: string | null;
  partyId?: string | null;
  currency?: string | null;
};

const LIVE_STATUSES = ['issued', 'partiallyPaid', 'paid', 'overdue', 'sent', 'confirmed', 'delivered', 'fulfilled', 'received', 'billed', 'accepted', 'approved', 'processed'];

function isLive(d: BusinessDocument): boolean {
  return LIVE_STATUSES.includes(d.status);
}

function inBase(amount: Money, rate: number, baseCurrency: string): Money {
  return money(Math.round(amount.minor * (rate || 1)), baseCurrency);
}

function matches(d: BusinessDocument, f: ReportFilters): boolean {
  if (!inRange(d.date, f.range)) return false;
  if (f.branchId && d.branchId !== f.branchId) return false;
  if (f.partyId && d.partyId !== f.partyId) return false;
  if (f.currency && d.currency !== f.currency) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Sales / purchase summary                                            */
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

  const total = sum(selected.map((d) => inBase(d.totals.grandTotal, d.exchangeRate, baseCurrency)), baseCurrency);
  const taxable = sum(selected.map((d) => inBase(d.totals.taxableAmount, d.exchangeRate, baseCurrency)), baseCurrency);
  const tax = sum(selected.map((d) => inBase(d.totals.totalTax, d.exchangeRate, baseCurrency)), baseCurrency);
  const discount = sum(
    selected.map((d) =>
      inBase(add(d.totals.lineDiscount, d.totals.documentDiscount), d.exchangeRate, baseCurrency),
    ),
    baseCurrency,
  );

  const monthMap = new Map<string, Money>();
  selected.forEach((d) => {
    const k = monthKey(d.date);
    const v = inBase(d.totals.grandTotal, d.exchangeRate, baseCurrency);
    monthMap.set(k, add(monthMap.get(k) ?? zero(baseCurrency), v));
  });

  const partyMap = new Map<string, { value: Money; count: number }>();
  selected.forEach((d) => {
    const cur = partyMap.get(d.partyId) ?? { value: zero(baseCurrency), count: 0 };
    partyMap.set(d.partyId, {
      value: add(cur.value, inBase(d.totals.grandTotal, d.exchangeRate, baseCurrency)),
      count: cur.count + 1,
    });
  });

  const itemMap = new Map<string, { value: Money; count: number }>();
  selected.forEach((d) => {
    d.lines.forEach((l) => {
      if (!l.itemId) return;
      const lineValue = inBase(money(l.unitPrice.minor * l.quantity, d.currency), d.exchangeRate, baseCurrency);
      const cur = itemMap.get(l.itemId) ?? { value: zero(baseCurrency), count: 0 };
      itemMap.set(l.itemId, { value: add(cur.value, lineValue), count: cur.count + l.quantity });
    });
  });

  const branchMap = new Map<string, { value: Money; count: number }>();
  selected.forEach((d) => {
    const cur = branchMap.get(d.branchId) ?? { value: zero(baseCurrency), count: 0 };
    branchMap.set(d.branchId, {
      value: add(cur.value, inBase(d.totals.grandTotal, d.exchangeRate, baseCurrency)),
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
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

export type ExpenseSummary = {
  total: Money;
  tax: Money;
  count: number;
  byCategory: SummaryRow[];
  byMonth: { key: string; value: Money }[];
  expenses: Expense[];
};

export function summarizeExpenses(
  expenses: Expense[],
  categories: ExpenseCategory[],
  baseCurrency: string,
  filters: ReportFilters,
): ExpenseSummary {
  const selected = expenses.filter(
    (e) => inRange(e.date, filters.range) && (!filters.branchId || e.branchId === filters.branchId),
  );

  const catMap = new Map<string, { value: Money; count: number }>();
  const monthMap = new Map<string, Money>();

  selected.forEach((e) => {
    const v = inBase(e.amount, e.exchangeRate, baseCurrency);
    const cur = catMap.get(e.categoryId) ?? { value: zero(baseCurrency), count: 0 };
    catMap.set(e.categoryId, { value: add(cur.value, v), count: cur.count + 1 });
    const k = monthKey(e.date);
    monthMap.set(k, add(monthMap.get(k) ?? zero(baseCurrency), v));
  });

  return {
    total: sum(selected.map((e) => inBase(e.amount, e.exchangeRate, baseCurrency)), baseCurrency),
    tax: sum(selected.map((e) => inBase(e.taxAmount, e.exchangeRate, baseCurrency)), baseCurrency),
    count: selected.length,
    byCategory: Array.from(catMap.entries())
      .map(([id, v]) => ({
        label: categories.find((c) => c.id === id)?.name ?? 'Uncategorised',
        value: v.value,
        count: v.count,
      }))
      .sort((a, b) => b.value.minor - a.value.minor),
    byMonth: Array.from(monthMap.entries())
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    expenses: selected,
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
  inward: TaxSummaryRow[];
  outwardTotal: Money;
  inwardTotal: Money;
  netPayable: Money;
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
        row.taxable = add(row.taxable, inBase(tl.taxableAmount, d.exchangeRate, baseCurrency));
        tl.components.forEach((c) => {
          const v = inBase(c.amount, d.exchangeRate, baseCurrency);
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
  const inward = taxRows(documents.filter((d) => d.kind === 'purchaseBill'), baseCurrency, filters);
  const outwardTotal = sum(outward.map((r) => r.total), baseCurrency);
  const inwardTotal = sum(inward.map((r) => r.total), baseCurrency);
  return {
    outward,
    inward,
    outwardTotal,
    inwardTotal,
    netPayable: subtract(outwardTotal, inwardTotal),
  };
}

/* ------------------------------------------------------------------ */
/* Payments / cash                                                     */
/* ------------------------------------------------------------------ */

export type PaymentSummary = {
  received: Money;
  paid: Money;
  net: Money;
  byMethod: SummaryRow[];
  byAccount: SummaryRow[];
  byMonth: { key: string; received: Money; paid: Money }[];
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

  const received = sum(
    selected.filter((p) => p.direction === 'received').map((p) => inBase(p.amount, p.exchangeRate, baseCurrency)),
    baseCurrency,
  );
  const paid = sum(
    selected.filter((p) => p.direction === 'paid').map((p) => inBase(p.amount, p.exchangeRate, baseCurrency)),
    baseCurrency,
  );

  const methodMap = new Map<string, { value: Money; count: number }>();
  const accountMap = new Map<string, { value: Money; count: number }>();
  const monthMap = new Map<string, { received: Money; paid: Money }>();

  selected.forEach((p) => {
    const v = inBase(p.amount, p.exchangeRate, baseCurrency);
    const m = methodMap.get(p.method) ?? { value: zero(baseCurrency), count: 0 };
    methodMap.set(p.method, { value: add(m.value, v), count: m.count + 1 });
    const a = accountMap.get(p.accountId) ?? { value: zero(baseCurrency), count: 0 };
    accountMap.set(p.accountId, { value: add(a.value, v), count: a.count + 1 });
    const k = monthKey(p.date);
    const cur = monthMap.get(k) ?? { received: zero(baseCurrency), paid: zero(baseCurrency) };
    if (p.direction === 'received') cur.received = add(cur.received, v);
    else cur.paid = add(cur.paid, v);
    monthMap.set(k, cur);
  });

  return {
    received,
    paid,
    net: subtract(received, paid),
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

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

export type StockReportRow = {
  item: Item;
  onHand: number;
  value: Money;
  low: boolean;
};

export type StockReport = {
  rows: StockReportRow[];
  totalValue: Money;
  lowCount: number;
  outCount: number;
  trackedCount: number;
};

export function summarizeStock(
  items: Item[],
  movements: StockMovement[],
  baseCurrency: string,
  branchId?: string | null,
): StockReport {
  const tracked = items.filter((i) => i.trackInventory);
  const rows: StockReportRow[] = tracked.map((item) => {
    const onHand = stockOnHand(item.id, movements, branchId ?? undefined);
    return {
      item,
      onHand,
      value: stockValue(item, movements, baseCurrency),
      low: item.reorderLevel > 0 && onHand <= item.reorderLevel,
    };
  });
  return {
    rows: rows.sort((a, b) => b.value.minor - a.value.minor),
    totalValue: sum(rows.map((r) => r.value), baseCurrency),
    lowCount: rows.filter((r) => r.low && r.onHand > 0).length,
    outCount: rows.filter((r) => r.onHand <= 0).length,
    trackedCount: tracked.length,
  };
}

/* ------------------------------------------------------------------ */
/* Profit snapshot                                                     */
/* ------------------------------------------------------------------ */

export type ProfitSnapshot = {
  revenue: Money;
  costOfGoods: Money;
  grossProfit: Money;
  expenses: Money;
  netProfit: Money;
  margin: number;
  byMonth: { key: string; revenue: Money; cost: Money; expenses: Money; profit: Money }[];
};

export function profitSnapshot(
  documents: BusinessDocument[],
  expenses: Expense[],
  items: Item[],
  baseCurrency: string,
  filters: ReportFilters,
): ProfitSnapshot {
  const invoices = documents.filter((d) => d.kind === 'invoice' && isLive(d) && matches(d, filters));
  const selectedExpenses = expenses.filter(
    (e) => inRange(e.date, filters.range) && (!filters.branchId || e.branchId === filters.branchId),
  );

  const revenue = sum(invoices.map((d) => inBase(d.totals.taxableAmount, d.exchangeRate, baseCurrency)), baseCurrency);

  const costOf = (d: BusinessDocument): Money =>
    sum(
      d.lines.map((l) => {
        const item = items.find((i) => i.id === l.itemId);
        const cost = item?.purchasePrice.minor ?? 0;
        return inBase(money(cost * l.quantity, d.currency), d.exchangeRate, baseCurrency);
      }),
      baseCurrency,
    );

  const costOfGoods = sum(invoices.map(costOf), baseCurrency);
  const grossProfit = subtract(revenue, costOfGoods);
  const expenseTotal = sum(
    selectedExpenses.map((e) => inBase(subtract(e.amount, e.taxAmount), e.exchangeRate, baseCurrency)),
    baseCurrency,
  );
  const netProfit = subtract(grossProfit, expenseTotal);

  const monthMap = new Map<string, { revenue: Money; cost: Money; expenses: Money }>();
  invoices.forEach((d) => {
    const k = monthKey(d.date);
    const cur = monthMap.get(k) ?? { revenue: zero(baseCurrency), cost: zero(baseCurrency), expenses: zero(baseCurrency) };
    cur.revenue = add(cur.revenue, inBase(d.totals.taxableAmount, d.exchangeRate, baseCurrency));
    cur.cost = add(cur.cost, costOf(d));
    monthMap.set(k, cur);
  });
  selectedExpenses.forEach((e) => {
    const k = monthKey(e.date);
    const cur = monthMap.get(k) ?? { revenue: zero(baseCurrency), cost: zero(baseCurrency), expenses: zero(baseCurrency) };
    cur.expenses = add(cur.expenses, inBase(subtract(e.amount, e.taxAmount), e.exchangeRate, baseCurrency));
    monthMap.set(k, cur);
  });

  return {
    revenue,
    costOfGoods,
    grossProfit,
    expenses: expenseTotal,
    netProfit,
    margin: revenue.minor === 0 ? 0 : (netProfit.minor / revenue.minor) * 100,
    byMonth: Array.from(monthMap.entries())
      .map(([key, v]) => ({
        key,
        revenue: v.revenue,
        cost: v.cost,
        expenses: v.expenses,
        profit: subtract(subtract(v.revenue, v.cost), v.expenses),
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
}
