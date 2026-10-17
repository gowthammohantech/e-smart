import type { Schema } from '@esmart/api-contract';
import { toMajor } from '@esmart/core/lib/money';
import type { CompanyRow } from '../../context';
import { toCsv } from '../exports/build';

export type ReportKey = 'sales-summary' | 'purchase-summary' | 'expense-summary' | 'receivables' | 'payables' | 'stock' | 'tax-summary' | 'payments' | 'profit';

export type ReportBody =
  | Schema<'TransactionSummary'>
  | Schema<'ExpenseSummary'>
  | Schema<'AgingReport'>
  | Schema<'StockReport'>
  | Schema<'TaxSummary'>
  | Schema<'PaymentSummary'>
  | Schema<'ProfitSnapshot'>;

type Cell = string | number | boolean | undefined;
/** A report flattened for CSV and PDF: its detail rows plus a few headline figures. */
export type Table = { title: string; columns: string[]; rows: Cell[][]; totals: [string, Cell][] };

type M = Schema<'Money'> | undefined;
const amt = (m: M): Cell => (m ? toMajor({ minor: m.minor, currency: m.currency }) : undefined);

export const TITLES: Record<ReportKey, string> = {
  'sales-summary': 'Sales summary',
  'purchase-summary': 'Purchase summary',
  'expense-summary': 'Expense summary',
  receivables: 'Receivables',
  payables: 'Payables',
  stock: 'Stock',
  'tax-summary': 'Tax summary',
  payments: 'Payments',
  profit: 'Profit snapshot',
};

/** The detail rows each report exports; the JSON response stays the full schema. */
export function tableOf(key: ReportKey, body: ReportBody, names: { category: Record<string, string> }): Table {
  const title = TITLES[key];
  switch (key) {
    case 'sales-summary':
    case 'purchase-summary': {
      const r = body as Schema<'TransactionSummary'>;
      return {
        title,
        columns: ['number', 'date', 'party', 'status', 'total', 'currency'],
        rows: (r.documents ?? []).map((d) => [d.number, d.date, d.partyName, d.status, amt(d.grandTotal), d.grandTotal?.currency]),
        totals: [['Documents', r.count], ['Taxable', amt(r.taxable)], ['Tax', amt(r.tax)], ['Discount', amt(r.discount)], ['Total', amt(r.total)]],
      };
    }
    case 'expense-summary': {
      const r = body as Schema<'ExpenseSummary'>;
      return {
        title,
        columns: ['number', 'date', 'category', 'amount', 'tax', 'currency'],
        rows: (r.expenses ?? []).map((e) => [e.number, e.date, names.category[e.categoryId] ?? e.categoryId, amt(e.amount), amt(e.taxAmount), e.currency]),
        totals: [['Expenses', r.count], ['Tax', amt(r.tax)], ['Total', amt(r.total)]],
      };
    }
    case 'receivables':
    case 'payables': {
      const r = body as Schema<'AgingReport'>;
      return {
        title,
        columns: ['number', 'party', 'date', 'dueDate', 'daysOverdue', 'bucket', 'outstanding', 'currency'],
        rows: (r.documents ?? []).map((o) => [o.document?.number, o.document?.partyName, o.document?.date, o.document?.dueDate, o.daysOverdue, o.bucket, amt(o.outstanding), o.outstanding?.currency]),
        totals: [['As of', r.asOf], ...(r.buckets ?? []).map((b): [string, Cell] => [b.key ?? '', amt(b.amount)]), ['Total', amt(r.total)]],
      };
    }
    case 'stock': {
      const r = body as Schema<'StockReport'>;
      return {
        title,
        columns: ['sku', 'item', 'onHand', 'unit', 'value', 'low'],
        rows: (r.rows ?? []).map((row) => [row.item?.sku, row.item?.name, row.onHand, row.item?.unit, amt(row.value), row.low]),
        totals: [['Tracked items', r.trackedCount], ['Low', r.lowCount], ['Out of stock', r.outCount], ['Total value', amt(r.totalValue)]],
      };
    }
    case 'tax-summary': {
      const r = body as Schema<'TaxSummary'>;
      const rows = (side: string, list: Schema<'TaxSummaryRow'>[] = []) => list.map((t): Cell[] => [side, t.rate, amt(t.taxable), amt(t.cgst), amt(t.sgst), amt(t.igst), amt(t.total)]);
      return {
        title,
        columns: ['direction', 'rate', 'taxable', 'cgst', 'sgst', 'igst', 'total'],
        rows: [...rows('outward', r.outward), ...rows('inward', r.inward)],
        totals: [['Outward tax', amt(r.outwardTotal)], ['Inward tax', amt(r.inwardTotal)], ['Net payable', amt(r.netPayable)]],
      };
    }
    case 'payments': {
      const r = body as Schema<'PaymentSummary'>;
      return {
        title,
        columns: ['number', 'date', 'direction', 'method', 'amount', 'currency'],
        rows: (r.payments ?? []).map((p) => [p.number, p.date, p.direction, p.method, amt(p.amount), p.currency]),
        totals: [['Received', amt(r.received)], ['Paid', amt(r.paid)], ['Net', amt(r.net)]],
      };
    }
    case 'profit': {
      const r = body as Schema<'ProfitSnapshot'>;
      return {
        title,
        columns: ['month', 'revenue', 'cost', 'expenses', 'profit'],
        rows: (r.byMonth ?? []).map((m) => [m.key, amt(m.revenue), amt(m.cost), amt(m.expenses), amt(m.profit)]),
        totals: [['Revenue', amt(r.revenue)], ['Cost of goods', amt(r.costOfGoods)], ['Gross profit', amt(r.grossProfit)], ['Expenses', amt(r.expenses)], ['Net profit', amt(r.netProfit)], ['Margin %', r.margin === undefined ? undefined : Math.round(r.margin * 100) / 100]],
      };
    }
  }
}

export function tableCsv(t: Table): string {
  return toCsv(t.columns, t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i]]))));
}

const esc = (v: Cell) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A plain printable page: headline figures, then the detail table. */
export function tableHtml(company: CompanyRow, t: Table, range: { from: string; to: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.title)}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#111;margin:24px}h1{font-size:16px;margin:0}p{margin:2px 0 12px;color:#555}
table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}th{background:#f4f4f4}</style></head>
<body><h1>${esc(company.name)}: ${esc(t.title)}</h1><p>${esc(range.from)} to ${esc(range.to)} (${esc(company.baseCurrency.trim())})</p>
<table><tbody>${t.totals.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
<table><thead><tr>${t.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
<tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
}
