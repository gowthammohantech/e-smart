import ExcelJS from 'exceljs';
import { parseCsv } from '@esmart/core/lib/csv';

/** One sheet of a file, as rows of text. The first row is the header. */
export type Sheet = { name: string; rows: string[][] };

/** What a spreadsheet cell holds, as the text a person sees. */
export function cellText(v: ExcelJS.CellValue | undefined): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const d = v.getUTCDate().toString().padStart(2, '0');
    const m = (v.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${d}/${m}/${v.getUTCFullYear()}`;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim();
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text).trim();
    return '';
  }
  return String(v).trim();
}

function sheetRows(ws: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    const last = Math.max(row.cellCount, row.actualCellCount);
    for (let c = 1; c <= last; c++) cells.push(cellText(row.getCell(c).value));
    rows.push(cells);
  });
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => [...r, ...Array(width - r.length).fill('')]).filter((r) => r.some((c) => c !== ''));
}

/** Reads an .xlsx or .csv into its sheets. Throws a sentence a person can act on. */
export async function readFile(file: File): Promise<Sheet[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const rows = parseCsv(await file.text());
    if (!rows.length) throw new Error('That file is empty.');
    return [{ name: file.name.replace(/\.[^.]+$/, ''), rows }];
  }
  if (lower.endsWith('.xls')) throw new Error('This is an old Excel (.xls) file. Open it in Excel, choose Save As → Excel Workbook (.xlsx), then pick that file.');
  if (!lower.endsWith('.xlsx')) throw new Error('Choose an Excel (.xlsx) or CSV (.csv) file.');
  return readWorkbook(await file.arrayBuffer());
}

export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as ArrayBuffer);
  } catch {
    throw new Error('That Excel file couldn’t be read. If it has a password, remove it and try again.');
  }
  const sheets = wb.worksheets.map((ws) => ({ name: ws.name, rows: sheetRows(ws) })).filter((s) => s.rows.length > 0);
  if (!sheets.length) throw new Error('That file has no data in it.');
  return sheets;
}

/** What a template sheet holds: its columns, one example row, and the choices a column allows. */
export type TemplateSheet = {
  name: string;
  columns: { label: string; required?: boolean; sample: string; hint: string; options?: string[]; width?: number }[];
};

const BRAND = 'FF0E7C66';
const REQUIRED = 'FFFDECC8';

/** One workbook: an Instructions sheet, then a sheet for each thing to import, with drop-downs where a value has a fixed set. */
export async function buildTemplate(sheets: TemplateSheet[], version: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Elixir Books Smart Migrator';
  wb.created = new Date();

  const info = wb.addWorksheet('Instructions', { properties: { tabColor: { argb: BRAND } } });
  info.columns = [{ width: 100 }];
  const lines = [
    'Elixir Books Smart: data import template',
    '',
    '1. Fill each sheet below its header row. Keep the header row as it is.',
    '2. The example row on each sheet shows how a row looks. Delete it before you import.',
    '3. Columns with an orange header are required. Leave the others blank if you do not have the data.',
    '4. Where a cell has a drop-down arrow, choose one of the values.',
    '5. Save the file and choose it in the Migrator. You see every problem before anything is imported.',
    '',
    'Tips',
    '• GSTIN is 15 characters, like 27AABCV1234F1ZO. State and PAN fill in from it when left blank.',
    '• Amounts can be written 1,20,000.50 or 120000.50. Use Dr/Cr to say who owes whom for an opening balance.',
    '• One sheet per kind of data. You can leave out any sheet you do not need.',
    `Template version ${version}`,
  ];
  lines.forEach((l, i) => {
    const cell = info.getCell(i + 1, 1);
    cell.value = l;
    if (i === 0) cell.font = { bold: true, size: 16, color: { argb: BRAND } };
    else if (l === 'Tips') cell.font = { bold: true };
    cell.alignment = { wrapText: true, vertical: 'top' };
  });

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = sheet.columns.map((c) => ({ width: c.width ?? Math.max(14, c.label.length + 4) }));
    const header = ws.getRow(1);
    sheet.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.label;
      cell.font = { bold: true, color: { argb: c.required ? 'FF000000' : 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? REQUIRED : BRAND } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.note = c.hint;
      const sample = ws.getCell(2, i + 1);
      sample.value = c.sample;
      sample.font = { italic: true, color: { argb: 'FF7A8699' } };
      if (c.options?.length) {
        for (let r = 2; r <= 1001; r++) {
          ws.getCell(r, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${c.options.join(',')}"`], showErrorMessage: false };
        }
      }
    });
    header.height = 28;
  }
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

/** Rows as an .xlsx: the list of problems a person fixes and imports again. */
export async function buildProblemsFile(sheets: { name: string; header: string[]; rows: string[][] }[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.addRow(s.header).font = { bold: true };
    s.rows.forEach((r) => ws.addRow(r));
    ws.columns = s.header.map((h, i) => ({ width: i === s.header.length - 1 ? 60 : Math.max(14, h.length + 4) }));
  }
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
