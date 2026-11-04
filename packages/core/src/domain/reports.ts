import {
  BusinessDocument,
  Company,
  Expense,
  ExpenseCategory,
  Item,
  Party,
  Payment,
  StockMovement,
  TaxLine,
  } from '../types';
import { Money, add, money, subtract, sum, zero } from '../lib/money';
import { DateRange, inRange, monthKey } from '../lib/date';
import { claimableTax, expenseCost, expenseTaxComponents } from './expenseTax';
import { GSTR1_KINDS, noteTypeOf } from './gstr1';
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

/** Tax lines to add up, each with the rate it converts at and +1 or −1 (a credit note takes tax back). */
type TaxEntry = { tl: TaxLine; rate: number; sign: 1 | -1 };

function taxRows(entries: TaxEntry[], baseCurrency: string): TaxSummaryRow[] {
  const map = new Map<number, TaxSummaryRow>();
  entries.forEach(({ tl, rate: fx, sign }) => {
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
    row.taxable = add(row.taxable, money(sign * inBase(tl.taxableAmount, fx, baseCurrency).minor, baseCurrency));
    tl.components.forEach((c) => {
      const v = money(sign * inBase(c.amount, fx, baseCurrency).minor, baseCurrency);
      if (c.type === 'CGST') row.cgst = add(row.cgst, v);
      else if (c.type === 'SGST') row.sgst = add(row.sgst, v);
      else if (c.type === 'IGST') row.igst = add(row.igst, v);
      row.total = add(row.total, v);
    });
    map.set(tl.rate, row);
  });
  return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
}

/** Purchase documents that carry input tax; returns and supplier credit notes reverse it. */
const INWARD_KINDS: BusinessDocument['kind'][] = ['purchaseBill', 'supplierDebitNote', 'purchaseReturn', 'supplierCreditNote'];
const INWARD_CREDITS: BusinessDocument['kind'][] = ['purchaseReturn', 'supplierCreditNote'];

function docEntries(docs: BusinessDocument[], filters: ReportFilters, isCredit: (d: BusinessDocument) => boolean): TaxEntry[] {
  return docs
    .filter((d) => isLive(d) && matches(d, filters))
    .flatMap((d) => d.totals.taxLines.map((tl) => ({ tl, rate: d.exchangeRate, sign: isCredit(d) ? (-1 as const) : (1 as const) })));
}

/**
 * Output tax as GSTR-1 reports it (invoices and debit notes, less returns and
 * credit notes) against input tax on purchases and on expenses the business
 * can claim. `company` places an expense's tax in CGST + SGST or IGST.
 */
export function summarizeTax(
  documents: BusinessDocument[],
  baseCurrency: string,
  filters: ReportFilters,
  expenses: Expense[] = [],
  company?: Company,
): TaxSummary {
  const outward = taxRows(
    docEntries(documents.filter((d) => GSTR1_KINDS.includes(d.kind)), filters, (d) => noteTypeOf(d.kind) === 'C'),
    baseCurrency,
  );
  const expenseEntries: TaxEntry[] = expenses
    .filter((e) => inRange(e.date, filters.range) && (!filters.branchId || e.branchId === filters.branchId))
    .filter((e) => claimableTax(e).minor > 0)
    .map((e) => {
      // `amount` is what was paid, tax included, except under reverse charge where the tax was paid apart.
      const taxable = e.reverseCharge ? e.amount : subtract(e.amount, e.taxAmount);
      // The rate isn't stored on the expense; what it charged on its taxable value gives it back.
      const rate = taxable.minor > 0 ? Math.round((e.taxAmount.minor / taxable.minor) * 10000) / 100 : 0;
      const tl: TaxLine = {
        categoryId: e.taxCategoryId ?? '',
        categoryName: '',
        rate,
        taxableAmount: taxable,
        components: expenseTaxComponents(e, rate, company),
        totalTax: e.taxAmount,
      };
      return { tl, rate: e.exchangeRate, sign: 1 as const };
    });
  const inward = taxRows(
    [...docEntries(documents.filter((d) => INWARD_KINDS.includes(d.kind)), filters, (d) => INWARD_CREDITS.includes(d.kind)), ...expenseEntries],
    baseCurrency,
  );
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
/* Advances                                                            */
/* ------------------------------------------------------------------ */

/** A payment with money not yet set against any document: an advance. */
export type AdvanceRow = {
  id: string;
  number: string;
  date: string;
  partyId: string;
  direction: Payment['direction'];
  amount: Money;
  /** What is still to adjust, in the base currency. */
  unallocated: Money;
};

export type AdvanceSummary = {
  /** Advances received from customers, still to adjust against their invoices. */
  received: Money;
  /** Advances paid to suppliers, still to adjust against their bills. */
  paid: Money;
  rows: AdvanceRow[];
};

/** Open advances, received and paid, from payments dated in the range. */
export function summarizeAdvances(payments: Payment[], baseCurrency: string, filters: ReportFilters): AdvanceSummary {
  const rows: AdvanceRow[] = payments
    .filter(
      (p) =>
        p.unallocated.minor > 0 &&
        inRange(p.date, filters.range) &&
        (!filters.branchId || p.branchId === filters.branchId) &&
        (!filters.partyId || p.partyId === filters.partyId),
    )
    .map((p) => ({
      id: p.id,
      number: p.number,
      date: p.date,
      partyId: p.partyId,
      direction: p.direction,
      amount: inBase(p.amount, p.exchangeRate, baseCurrency),
      unallocated: inBase(p.unallocated, p.exchangeRate, baseCurrency),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = (direction: Payment['direction']) =>
    sum(rows.filter((r) => r.direction === direction).map((r) => r.unallocated), baseCurrency);
  return { received: total('received'), paid: total('paid'), rows };
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
  // Sales and debit notes add to revenue; returns and credit notes take it back.
  const invoices = documents.filter(
    (d) => (d.kind === 'invoice' || d.kind === 'debitNote' || d.kind === 'salesReturn' || d.kind === 'creditNote') && isLive(d) && matches(d, filters),
  );
  const signOf = (d: BusinessDocument) => (d.kind === 'salesReturn' || d.kind === 'creditNote' ? -1 : 1);
  // A billable expense is the customer's cost, recovered at cost on an invoice: it isn't the business's (Rule 33).
  const selectedExpenses = expenses.filter(
    (e) => !e.billable && inRange(e.date, filters.range) && (!filters.branchId || e.branchId === filters.branchId),
  );

  const revenueOf = (d: BusinessDocument): Money =>
    money(signOf(d) * inBase(d.totals.taxableAmount, d.exchangeRate, baseCurrency).minor, baseCurrency);
  const revenue = sum(invoices.map(revenueOf), baseCurrency);

  // What a unit cost: the average the business paid on its bills, else the item's purchase price (in base).
  const bought = new Map<string, { cost: number; qty: number }>();
  documents
    .filter((d) => d.kind === 'purchaseBill' && isLive(d))
    .forEach((d) =>
      d.lines.forEach((l) => {
        if (!l.itemId || !(l.quantity > 0)) return;
        const b = bought.get(l.itemId) ?? { cost: 0, qty: 0 };
        b.cost += l.unitPrice.minor * l.quantity * (d.exchangeRate || 1);
        b.qty += l.quantity;
        bought.set(l.itemId, b);
      }),
    );
  const unitCost = (itemId: string | undefined): number => {
    if (!itemId) return 0;
    const b = bought.get(itemId);
    if (b && b.qty > 0) return b.cost / b.qty;
    return items.find((i) => i.id === itemId)?.purchasePrice.minor ?? 0;
  };
  // Only goods move cost: an invoice sells them, a return brings them back; notes move none.
  const costOf = (d: BusinessDocument): Money =>
    d.kind === 'invoice' || d.kind === 'salesReturn'
      ? money(signOf(d) * Math.round(d.lines.reduce((acc, l) => acc + unitCost(l.itemId) * l.quantity, 0)), baseCurrency)
      : zero(baseCurrency);

  const costOfGoods = sum(invoices.map(costOf), baseCurrency);
  const grossProfit = subtract(revenue, costOfGoods);
  const expenseTotal = sum(
    selectedExpenses.map((e) => inBase(expenseCost(e), e.exchangeRate, baseCurrency)),
    baseCurrency,
  );
  const netProfit = subtract(grossProfit, expenseTotal);

  const monthMap = new Map<string, { revenue: Money; cost: Money; expenses: Money }>();
  invoices.forEach((d) => {
    const k = monthKey(d.date);
    const cur = monthMap.get(k) ?? { revenue: zero(baseCurrency), cost: zero(baseCurrency), expenses: zero(baseCurrency) };
    cur.revenue = add(cur.revenue, revenueOf(d));
    cur.cost = add(cur.cost, costOf(d));
    monthMap.set(k, cur);
  });
  selectedExpenses.forEach((e) => {
    const k = monthKey(e.date);
    const cur = monthMap.get(k) ?? { revenue: zero(baseCurrency), cost: zero(baseCurrency), expenses: zero(baseCurrency) };
    cur.expenses = add(cur.expenses, inBase(expenseCost(e), e.exchangeRate, baseCurrency));
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
