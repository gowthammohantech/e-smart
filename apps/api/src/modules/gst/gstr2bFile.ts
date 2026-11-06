import ExcelJS from 'exceljs';
import { invalid } from '../../http/errors';
import { parseGstr2b } from '../../providers/gsp/returns';
import type { Gstr2bEntry, Gstr2bResult } from '../../providers/returns';
import { cellText } from '../banking/parse';

/** The most a 2B file may be, decoded: a large business's month runs to a few MB of JSON. */
export const MAX_2B_BYTES = 6 * 1024 * 1024;
const MAX_ROWS = 50_000;
const MAX_COLUMNS = 40;

/** What a downloaded 2B file says it is, and its lines. */
export type Gstr2bFile = { gstin?: string; period?: string; result: Extract<Gstr2bResult, { status: 'generated' }> };

const unreadable = (what: string) => invalid('contentBase64', `This is not a GSTR-2B file from the GST portal: ${what}`, 'UNSUPPORTED_FILE');

/**
 * A GSTR-2B the taxpayer downloaded from the GST portal (Returns → GSTR-2B): the JSON, read as the
 * GSP's answer is (`parseGstr2b`), or the Excel workbook, read sheet by sheet by its column headings.
 */
export async function readGstr2bFile(fileName: string, contentBase64: string): Promise<Gstr2bFile> {
  const buf = Buffer.from(contentBase64, 'base64');
  if (!buf.length) throw invalid('contentBase64', 'The file is empty');
  if (buf.length > MAX_2B_BYTES) throw invalid('contentBase64', 'A GSTR-2B file can be at most 6 MB', 'FILE_TOO_LARGE');
  const zip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  if (zip || fileName.toLowerCase().endsWith('.xlsx')) return readXlsx(buf);
  let json: unknown;
  try {
    json = JSON.parse(buf.toString('utf8').replace(/^﻿/, ''));
  } catch {
    throw unreadable('save the JSON or Excel file the portal gives and upload that');
  }
  // The portal's file is `{ chksum, data: { gstin, rtnprd, gendt, docdata } }`; a bare `data` object is taken too.
  const root = json as { data?: Record<string, unknown>; docdata?: unknown };
  const data = (root?.data ?? (root?.docdata ? root : undefined)) as { gstin?: unknown; rtnprd?: unknown; docdata?: unknown } | undefined;
  const result = parseGstr2b({ data });
  if (result.status !== 'generated') throw unreadable('it has no document details (docdata)');
  return { gstin: typeof data?.gstin === 'string' ? data.gstin : undefined, period: typeof data?.rtnprd === 'string' ? data.rtnprd : undefined, result };
}

/** Rupees as the sheet writes them (a number, or text with commas) to paise. */
const paise = (text: string) => Math.round((Number(text.replace(/[,₹\s]/g, '')) || 0) * 100);

/** dd/mm/yyyy, dd-mm-yyyy or dd-MMM-yyyy to yyyy-mm-dd; '' when it isn't a date. */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function isoDate(text: string): string {
  const m = /^(\d{1,2})[/-](\d{1,2}|[A-Za-z]{3})[/-](\d{4})$/.exec(text.trim());
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  const month = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS.indexOf(m[2].toLowerCase()) + 1;
  if (month < 1 || month > 12) return '';
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

const GSTIN = /^[0-9]{2}[A-Z0-9]{13}$/;

/** The sheets of the portal's 2B workbook read here, and what each holds. */
const SHEETS: { match: RegExp; section: Gstr2bEntry['section']; kind: 'invoice' | 'note' | 'boe' }[] = [
  { match: /^b2b$/i, section: 'b2b', kind: 'invoice' },
  { match: /^b2ba$/i, section: 'b2ba', kind: 'invoice' },
  { match: /^b2b[- ]?cdnr$/i, section: 'cdnr', kind: 'note' },
  { match: /^b2b[- ]?cdnra$/i, section: 'cdnra', kind: 'note' },
  { match: /^impg(sez)?$/i, section: 'impg', kind: 'boe' },
];

/**
 * The portal's 2B workbook: B2B, B2BA, B2B-CDNR, B2B-CDNRA and IMPG/IMPGSEZ sheets, each with a two-row
 * heading (a group such as "Invoice details" over "Invoice number", "Invoice Date" …). Columns are
 * found by their heading, not their place, and an invoice on several rows (one per rate) is added up.
 */
async function readXlsx(buf: Buffer): Promise<Gstr2bFile> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw invalid('contentBase64', 'This Excel file could not be read. Download it again from the GST portal', 'UNSUPPORTED_FILE');
  }
  const entries = new Map<string, Gstr2bEntry>();
  let sheetsRead = 0;
  for (const ws of wb.worksheets) {
    const spec = SHEETS.find((s) => s.match.test(ws.name.trim()));
    if (!spec) continue;
    const rows: string[][] = [];
    const width = Math.min(ws.columnCount, MAX_COLUMNS);
    for (let r = 1; r <= Math.min(ws.rowCount, MAX_ROWS); r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value));
      rows.push(cells);
    }
    const anchor = spec.kind === 'boe' ? /bill of entry number/i : /gstin of supplier/i;
    const at = rows.findIndex((r) => r.some((c) => anchor.test(c)));
    if (at < 0) continue;
    sheetsRead++;
    // A column's heading is its group over its own name; a merged group repeats along the row.
    const heads = rows[at].map((top, i) => `${top} ${rows[at + 1]?.[i] ?? ''}`.toLowerCase().replace(/\s+/g, ' '));
    const all = (re: RegExp) => heads.flatMap((h, i) => (re.test(h) ? [i] : []));
    const col = (re: RegExp, last = true) => {
      const found = all(re);
      return found.length ? found[last ? found.length - 1 : 0] : -1;
    };
    const c = {
      gstin: col(/gstin of supplier/),
      name: col(/trade\/legal name|trade name|legal name/),
      number: col(spec.kind === 'note' ? /note number/ : spec.kind === 'boe' ? /bill of entry number/ : /invoice number/),
      original: spec.section === 'b2ba' || spec.section === 'cdnra' ? col(spec.kind === 'note' ? /note number/ : /invoice number/, false) : -1,
      date: col(spec.kind === 'note' ? /note date/ : spec.kind === 'boe' ? /bill of entry date/ : /invoice date/),
      noteType: col(/note type/),
      pos: col(/place of supply/),
      rev: col(/reverse charge/),
      taxable: col(/taxable value/),
      igst: col(/integrated tax/),
      cgst: col(/central tax/),
      sgst: col(/state\/ut tax|state tax/),
      cess: col(/cess/),
      filed: col(/filing date/),
      itc: col(/itc availability|itc available/),
      reason: col(/reason/),
      port: col(/port code/),
    };
    if (c.number < 0 || c.taxable < 0) continue;
    const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    for (const r of rows.slice(at + 1)) {
      const number = cell(r, c.number);
      const date = isoDate(cell(r, c.date));
      if (!number || !date) continue;
      const supplier = spec.kind === 'boe' ? cell(r, c.port) : cell(r, c.gstin).toUpperCase();
      if (spec.kind !== 'boe' && !GSTIN.test(supplier)) continue;
      const type: Gstr2bEntry['documentType'] = spec.kind === 'boe' ? 'BOE' : spec.kind === 'note' ? (/debit/i.test(cell(r, c.noteType)) ? 'D' : 'C') : 'I';
      const pos = cell(r, c.pos);
      const key = `${spec.section}|${supplier}|${type}|${number}`;
      const had = entries.get(key);
      const amounts = { taxableMinor: paise(cell(r, c.taxable)), igstMinor: paise(cell(r, c.igst)), cgstMinor: paise(cell(r, c.cgst)), sgstMinor: paise(cell(r, c.sgst)), cessMinor: paise(cell(r, c.cess)) };
      if (had) {
        had.taxableMinor += amounts.taxableMinor;
        had.igstMinor += amounts.igstMinor;
        had.cgstMinor += amounts.cgstMinor;
        had.sgstMinor += amounts.sgstMinor;
        had.cessMinor += amounts.cessMinor;
        continue;
      }
      const filed = isoDate(cell(r, c.filed));
      const original = c.original >= 0 && c.original !== c.number ? cell(r, c.original) : '';
      entries.set(key, {
        section: spec.section,
        supplierGstin: supplier,
        supplierName: cell(r, c.name) || undefined,
        documentType: type,
        number,
        date,
        // The sheet names the state; only a code is kept.
        placeOfSupply: /^\d{2}$/.test(pos) ? pos : undefined,
        reverseCharge: /^y/i.test(cell(r, c.rev)),
        ...amounts,
        itcAvailable: !/^n/i.test(cell(r, c.itc)),
        itcReason: cell(r, c.reason).slice(0, 40) || undefined,
        supplierFiledOn: filed || undefined,
        originalNumber: original || undefined,
      });
    }
  }
  if (!sheetsRead) throw unreadable('it has no B2B, B2B-CDNR or IMPG sheet');
  return { result: { status: 'generated', generatedAt: '', entries: [...entries.values()] } };
}
