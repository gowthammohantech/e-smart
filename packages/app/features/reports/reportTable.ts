/**
 * Report exports as files: the table a report hands over, and the CSV, Excel
 * and printable HTML built from it. Pure, so it runs (and is tested) without
 * the native file and print modules; `exportFiles` delivers the result.
 */
import { strToU8, zipSync } from 'fflate';

/** What a report hands over for export: one header row and its data rows. */
export type ReportTable = { headers: string[]; rows: (string | number)[][] };

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A1-style column letters: 0 → A, 26 → AA. */
function column(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * A one-sheet .xlsx: numbers stay numbers so Excel can total them, text is
 * written inline (no shared-strings table), and the header row is bold.
 */
export function xlsxBytes(sheetName: string, table: ReportTable): Uint8Array {
  const cell = (v: string | number, ref: string, header: boolean) =>
    typeof v === 'number' && Number.isFinite(v)
      ? `<c r="${ref}"${header ? ' s="1"' : ''}><v>${v}</v></c>`
      : `<c r="${ref}" t="inlineStr"${header ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(String(v ?? ''))}</t></is></c>`;
  const rows = [table.headers, ...table.rows]
    .map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(v, `${column(j)}${i + 1}`, i === 0)).join('')}</row>`)
    .join('');
  // Sheet names: at most 31 characters, none of []:*?/\
  const name = xml(sheetName.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Report');

  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border/></borders>' +
        '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
        '<cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs>' +
        '</styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        `<sheetData>${rows}</sheetData></worksheet>`,
    ),
  });
}

export function toCsv(table: ReportTable): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [table.headers.map(escape).join(','), ...table.rows.map((r) => r.map(escape).join(','))].join('\n');
}

/** The report as a printable page: title, the basis line, and the table. */
export function tableHtml(title: string, basis: string, table: ReportTable): string {
  const num = (v: string | number) => typeof v === 'number';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; margin: 24px; font-size: 11px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p { color: #666; margin: 0 0 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; font-weight: 600; }
    td.n { text-align: right; font-variant-numeric: tabular-nums; }
  </style></head><body>
    <h1>${xml(title)}</h1><p>${xml(basis)}</p>
    <table><thead><tr>${table.headers.map((h) => `<th>${xml(h)}</th>`).join('')}</tr></thead>
    <tbody>${table.rows.map((r) => `<tr>${r.map((v) => `<td${num(v) ? ' class="n"' : ''}>${xml(String(v ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table>
  </body></html>`;
}

/** `GSTR-1` → `GSTR-1_2026-09-01_2026-09-30`, safe as a file name. */
export const exportName = (title: string, from: string, to: string) => `${title.replace(/[^\w-]+/g, '_')}_${from}_${to}`;
