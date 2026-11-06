import ExcelJS from 'exceljs';
import { parseCsv } from '@esmart/core/lib/csv';
import { invalid } from '../../http/errors';

/** The most a statement file may be, decoded. */
export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20_000;
const MAX_COLUMNS = 60;

const pad = (n: number) => String(n).padStart(2, '0');

/** One Excel cell as the text a CSV of it would hold: dates dd/mm/yyyy, numbers plain. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('').trim();
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('text' in value) return String(value.text).trim();
    if ('error' in value) return '';
  }
  return String(value).trim();
}

async function xlsxRows(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw invalid('contentBase64', 'This Excel file could not be read. Save it again as .xlsx or .csv', 'UNSUPPORTED_FILE');
  }
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  const width = Math.min(ws.columnCount, MAX_COLUMNS);
  for (let r = 1; r <= Math.min(ws.rowCount, MAX_ROWS); r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value));
    while (cells.length && !cells[cells.length - 1]) cells.pop();
    rows.push(cells);
  }
  return rows;
}

/** A CSV (or a tab-separated export) as rows. */
function textRows(buf: Buffer): string[][] {
  const text = buf.toString('utf8').replace(/^﻿/, '');
  const head = text.slice(0, 4096);
  const tabs = (head.match(/\t/g) ?? []).length;
  const commas = (head.match(/,/g) ?? []).length;
  const rows = tabs > commas ? text.split(/\r\n|\n|\r/).map((l) => l.split('\t')) : parseCsv(text);
  return rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLUMNS).map((c) => c.trim()));
}

/**
 * The rows of a bank statement file: the first worksheet of an .xlsx, or a
 * CSV. A legacy .xls (the binary Excel 97 format) is refused with the way
 * out: save it as .xlsx or .csv.
 */
export async function statementRows(fileName: string, contentBase64: string): Promise<string[][]> {
  const buf = Buffer.from(contentBase64, 'base64');
  if (!buf.length) throw invalid('contentBase64', 'The file is empty');
  if (buf.length > MAX_STATEMENT_BYTES) throw invalid('contentBase64', 'A statement file can be at most 5 MB', 'FILE_TOO_LARGE');
  const zip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  const ole = buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
  const name = fileName.toLowerCase();
  if (ole || (name.endsWith('.xls') && !zip)) throw invalid('contentBase64', 'This is an old Excel file (.xls). Save it as .xlsx or .csv', 'UNSUPPORTED_FILE');
  if (zip) return xlsxRows(buf);
  if (buf.subarray(0, 4096).includes(0)) throw invalid('contentBase64', 'This is not a CSV or Excel file. Save it as .xlsx or .csv', 'UNSUPPORTED_FILE');
  return textRows(buf);
}
