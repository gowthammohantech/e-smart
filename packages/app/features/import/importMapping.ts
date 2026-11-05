/**
 * The pure half of `ImportFlow`: which file columns there are to pick from,
 * the field → column mapping and its edits, and whether a mapping is complete
 * enough to read records with. No React, so it is tested on its own.
 */

/** One thing an import reads from each row: a date, a name, an amount… */
export type ImportField = { key: string; label: string; required?: boolean };

/** Which column (0-based) each field is read from; undefined when the file has none. */
export type ColumnMapping = Record<string, number | undefined>;

/** A row the import can't use, numbered as a spreadsheet numbers it (1-based). */
export type RowIssue = { row: number; message: string };

/** A column a field can be mapped to. */
export type FileColumn = { index: number; label: string };

/** How many rows below the header are looked at to see how wide the file is. */
const WIDTH_SAMPLE = 50;

/**
 * The columns a mapping picks from: the header row's names, or `untitled(n)`
 * ("Column 3") for a column with no name, or for every column of a file with
 * no header row (`headerRow` −1). As wide as the widest of the header and the
 * first rows under it, since a bank may leave a header cell blank.
 */
export function fileColumns(rows: string[][], headerRow: number, untitled: (n: number) => string): FileColumn[] {
  const header = headerRow >= 0 ? (rows[headerRow] ?? []) : [];
  const start = headerRow + 1;
  let width = header.length;
  for (let i = start; i < Math.min(rows.length, start + WIDTH_SAMPLE); i++) width = Math.max(width, rows[i]?.length ?? 0);
  return Array.from({ length: width }, (_, index) => {
    const name = String(header[index] ?? '').replace(/\s+/g, ' ').trim();
    return { index, label: name || untitled(index + 1) };
  });
}

/**
 * The mapping to start from: what `detect` found, for the fields asked for,
 * and only columns the file has. Every field gets a key, so a field left
 * unmapped is told apart from one not asked about.
 */
export function initialMapping(fields: ImportField[], detected: Partial<ColumnMapping>, width: number): ColumnMapping {
  const out: ColumnMapping = {};
  const taken = new Set<number>();
  for (const f of fields) {
    const i = detected[f.key];
    // A column is one field's: the first field that claims it keeps it.
    out[f.key] = i !== undefined && i >= 0 && i < width && !taken.has(i) ? i : undefined;
    if (out[f.key] !== undefined) taken.add(out[f.key]!);
  }
  return out;
}

/**
 * Maps `key` to column `index` (undefined clears it). A column is read as one
 * field only, so another field that had it lets go.
 */
export function assignColumn(mapping: ColumnMapping, key: string, index: number | undefined): ColumnMapping {
  const out: ColumnMapping = {};
  for (const [k, v] of Object.entries(mapping)) out[k] = index !== undefined && v === index && k !== key ? undefined : v;
  out[key] = index;
  return out;
}

/** The required fields with no column yet, in field order. */
export function missingRequired(fields: ImportField[], mapping: ColumnMapping): ImportField[] {
  return fields.filter((f) => f.required && mapping[f.key] === undefined);
}

/** The file name's extension, lower case with its dot (".csv"), or "". */
export function extensionOf(fileName: string): string {
  const m = /\.[^./\\]+$/.exec(fileName.trim());
  return m ? m[0].toLowerCase() : '';
}

/** Whether a file is one of the kinds an import takes (`accept` as ['.csv', '.xlsx']). */
export function accepts(fileName: string, accept: string[]): boolean {
  const ext = extensionOf(fileName);
  return !!ext && accept.some((a) => a.toLowerCase() === ext);
}

/** A CSV is read on the device; any other kind goes to the server to be turned into rows. */
export const readsOnDevice = (fileName: string): boolean => extensionOf(fileName) === '.csv';

/** The base64 payload of a `data:` URL, as FileReader.readAsDataURL gives it. */
export function base64OfDataUrl(url: string): string {
  const comma = url.indexOf(',');
  return comma >= 0 ? url.slice(comma + 1) : url;
}

/** The rows that hold anything, so a sheet's trailing blank lines don't count as rows. */
export function trimRows(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && !(rows[end - 1] ?? []).some((c) => String(c ?? '').trim())) end--;
  return rows.slice(0, end);
}
