import type { OcrField, OcrResult } from './ocrStore';

const GSTIN_IN_TEXT = /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** 1,23,456.78 / 123456.78 / 4,720 — Indian or western grouping. */
const AMOUNT = /(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d+)/gi;
/** Words that head a bill rather than name the seller. */
const HEADINGS = /^(tax\s+invoice|invoice|bill|bill of supply|receipt|cash memo|estimate|original|duplicate|gst\s*invoice)$/i;

function amountsIn(line: string): number[] {
  return [...line.matchAll(AMOUNT)]
    .map((m) => Number(m[1].replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
}

const pad = (n: number) => String(n).padStart(2, '0');

function isoDate(y: number, m: number, d: number): string | undefined {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** The first date on the bill, as ISO. Indian bills write day first. */
export function findDate(text: string): string | undefined {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (dmy) return isoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const named = text.match(/\b(\d{1,2})[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,-]*(\d{2,4})\b/i);
  if (named) return isoDate(Number(named[3]), MONTHS.indexOf(named[2].toLowerCase()) + 1, Number(named[1]));
  return undefined;
}

/** The amount on the best "total" line, else the largest amount on the bill. */
export function findTotal(lines: string[]): { value: number; confidence: number } | undefined {
  const ranked = [
    /grand\s*total|total\s*amount|amount\s*payable|net\s*(amount|payable)|total\s*payable|invoice\s*(total|value)/i,
    /\btotal\b/i,
  ];
  for (const [i, re] of ranked.entries()) {
    const hits = lines.filter((l) => re.test(l) && !/sub\s*-?\s*total|total\s*(tax|gst|qty|quantity|items)/i.test(l));
    const values = hits.flatMap(amountsIn);
    if (values.length) return { value: Math.max(...values), confidence: i === 0 ? 0.9 : 0.8 };
  }
  const all = lines.flatMap(amountsIn).filter((n) => n < 1e8);
  return all.length ? { value: Math.max(...all), confidence: 0.55 } : undefined;
}

/** GST on the bill: a "total tax" line, else CGST + SGST, else IGST. */
export function findTax(lines: string[]): { value: number; confidence: number } | undefined {
  const last = (re: RegExp) => {
    const hit = lines.filter((l) => re.test(l)).pop();
    const values = hit ? amountsIn(hit.replace(/\d{1,2}(\.\d+)?\s*%/g, '')) : [];
    return values.length ? values[values.length - 1] : undefined;
  };
  const total = last(/total\s*(tax|gst)|gst\s*amount|tax\s*amount/i);
  if (total !== undefined) return { value: total, confidence: 0.85 };
  const cgst = last(/\bcgst\b/i);
  const sgst = last(/\b(sgst|utgst)\b/i);
  if (cgst !== undefined && sgst !== undefined) return { value: cgst + sgst, confidence: 0.8 };
  const igst = last(/\bigst\b/i);
  if (igst !== undefined) return { value: igst, confidence: 0.8 };
  return undefined;
}

export function findBillNumber(text: string): string | undefined {
  const m = text.match(/(?:invoice|inv|bill|receipt)\s*(?:no|number|#)\.?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{1,24})/i);
  return m?.[1];
}

/** The seller is usually the first real line: not a heading, number, GSTIN or phone. */
export function findVendor(lines: string[]): string | undefined {
  return lines.find(
    (l) =>
      l.length >= 3 &&
      /[a-z]{3}/i.test(l) &&
      !HEADINGS.test(l) &&
      !GSTIN_IN_TEXT.test(l) &&
      !/(gstin|phone|ph\.|mob|tel|email|@|www\.|date|invoice\s*no|bill\s*no)/i.test(l),
  );
}

/** "Item name   2   450.00   900.00": a line whose qty × rate matches its amount. */
export function findLineItems(lines: string[]): OcrResult['lines'] {
  const out: OcrResult['lines'] = [];
  const re = /^(.*?[a-z].*?)\s+(\d+(?:\.\d+)?)\s*(?:x|×|nos|pcs|kg|no)?\s+(?:₹|rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)\s+(?:₹|rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)$/i;
  lines.forEach((l) => {
    const m = l.match(re);
    if (!m || /total|gst|tax|discount|round/i.test(m[1])) return;
    const quantity = Number(m[2]);
    const unitPrice = Number(m[3].replace(/,/g, ''));
    const amount = Number(m[4].replace(/,/g, ''));
    if (!quantity || !unitPrice) return;
    const close = Math.abs(quantity * unitPrice - amount) <= Math.max(1, amount * 0.02);
    // Only keep lines whose arithmetic checks out; the rest stay for the person to add.
    if (close) out.push({ name: m[1].replace(/^\d+[.)]?\s+/, '').trim(), quantity, unitPrice, confidence: 0.8 });
  });
  return out;
}

/** Turn the raw text ML Kit read into the fields the review screen confirms. */
export function parseReceiptText(text: string, kind: OcrResult['kind'], imageUri?: string): OcrResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const upper = text.toUpperCase();
  const fields: OcrField[] = [];
  const add = (key: string, label: string, value: string | undefined, confidence: number) =>
    fields.push({ key, label, value: value ?? '', confidence: value ? confidence : 0 });

  const expense = kind === 'expense';
  const total = findTotal(lines);
  const tax = findTax(lines);
  add('vendor', expense ? 'Vendor' : 'Supplier', findVendor(lines), 0.7);
  if (!expense) add('gstin', 'Supplier GSTIN', upper.match(GSTIN_IN_TEXT)?.[0], 0.9);
  add('date', expense ? 'Date' : 'Invoice date', findDate(text), 0.85);
  add('reference', expense ? 'Bill number' : 'Invoice number', findBillNumber(text), 0.75);
  add('amount', expense ? 'Total amount' : 'Invoice total', total?.value.toFixed(2), total?.confidence ?? 0);
  add('tax', expense ? 'Tax amount' : 'GST', tax?.value.toFixed(2), tax?.confidence ?? 0);

  return { imageUri, kind, fields, lines: expense ? [] : findLineItems(lines) };
}
