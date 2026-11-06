import { DocumentKind, NumberingSeries, SeriesDocumentKind } from '../types';
import { financialYearOf } from '../lib/date';

export type SeriesKind = NumberingSeries['kind'];

/** Every series a company can number, in the order the settings screen lists them. */
export const SERIES_KINDS: SeriesKind[] = [
  'quote',
  'proforma',
  'salesOrder',
  'delivery',
  'invoice',
  'salesReturn',
  'purchaseOrder',
  'goodsReceipt',
  'purchaseBill',
  'purchaseReturn',
  'creditNote',
  'debitNote',
  'supplierCreditNote',
  'supplierDebitNote',
  'selfInvoice',
  'payment',
  'expense',
  'journal',
  'contra',
  'gstJournal',
  'tdsChallan',
  'receipt',
  'gstChallan',
];

/**
 * Render the next document number for a series (FRD 17).
 * Format: PREFIX[/BRANCH][/FY]/0001
 */
export function formatNumber(
  series: NumberingSeries,
  opts: { date: string; branchCode?: string; sequence?: number; fiscalYearStartMonth?: number } = { date: new Date().toISOString().slice(0, 10) },
): string {
  const seq = opts.sequence ?? series.nextNumber;
  // A trailing "/" in the prefix would double up with the separator below.
  const parts: string[] = [series.prefix.replace(/\/+$/, '')];
  if (series.includeBranchCode && opts.branchCode) parts.push(opts.branchCode);
  if (series.includeFiscalYear) {
    const fy = financialYearOf(opts.date, opts.fiscalYearStartMonth);
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
  proforma: 'PI',
  salesOrder: 'SO',
  delivery: 'DN',
  salesReturn: 'CRN',
  purchaseOrder: 'PO',
  goodsReceipt: 'GRN',
  purchaseBill: 'BILL',
  purchaseReturn: 'DRN',
  creditNote: 'CN',
  debitNote: 'DBN',
  supplierCreditNote: 'SCN',
  supplierDebitNote: 'SDN',
  selfInvoice: 'SI',
  payment: 'PAY',
  expense: 'EXP',
  journal: 'JV',
  contra: 'CV',
  gstJournal: 'GJV',
  tdsChallan: 'TDS',
  receipt: 'RV',
  gstChallan: 'GCH',
};

/** The series a document numbers from. An opening invoice or bill keeps its own number and has none. */
export function seriesKindForDocument(kind: SeriesDocumentKind): SeriesKind {
  return kind;
}
