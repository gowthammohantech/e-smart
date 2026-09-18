import { DocumentKind, NumberingSeries } from '@/types';
import { financialYearOf } from '@/lib/date';

export type SeriesKind = NumberingSeries['kind'];

export const SERIES_LABELS: Record<SeriesKind, string> = {
  quote: 'Quotation',
  salesOrder: 'Sales order',
  delivery: 'Delivery note',
  invoice: 'Invoice',
  salesReturn: 'Sales return',
  purchaseOrder: 'Purchase order',
  goodsReceipt: 'Goods receipt',
  purchaseBill: 'Purchase bill',
  purchaseReturn: 'Purchase return',
  payment: 'Payment',
  expense: 'Expense',
};

/**
 * Render the next document number for a series (FRD 17).
 * Format: PREFIX[/BRANCH][/FY]/0001
 */
export function formatNumber(
  series: NumberingSeries,
  opts: { date: string; branchCode?: string; sequence?: number } = { date: new Date().toISOString().slice(0, 10) },
): string {
  const seq = opts.sequence ?? series.nextNumber;
  const parts: string[] = [series.prefix];
  if (series.includeBranchCode && opts.branchCode) parts.push(opts.branchCode);
  if (series.includeFiscalYear) {
    const fy = financialYearOf(opts.date);
    parts.push(fy.label.replace('FY ', ''));
  }
  parts.push(String(seq).padStart(series.padding, '0'));
  return parts.join('/');
}

export function previewNumber(series: NumberingSeries, branchCode?: string): string {
  return formatNumber(series, { date: new Date().toISOString().slice(0, 10), branchCode });
}

export function defaultSeries(companyId: string, kind: SeriesKind, prefix: string): NumberingSeries {
  return {
    id: `series_${kind}`,
    companyId,
    kind,
    prefix,
    nextNumber: 1,
    padding: 4,
    includeFiscalYear: true,
    includeBranchCode: false,
    resetPolicy: 'yearly',
  };
}

export const DEFAULT_PREFIXES: Record<SeriesKind, string> = {
  invoice: 'INV',
  quote: 'QT',
  salesOrder: 'SO',
  delivery: 'DN',
  salesReturn: 'CRN',
  purchaseOrder: 'PO',
  goodsReceipt: 'GRN',
  purchaseBill: 'BILL',
  purchaseReturn: 'DRN',
  payment: 'PAY',
  expense: 'EXP',
};

export function seriesKindForDocument(kind: DocumentKind): SeriesKind {
  return kind;
}
