/**
 * Reading spreadsheets exported as CSV (Excel, Google Sheets, Tally, a bank's
 * statement download): the rows, which column is which field by its header,
 * and amounts written the Indian way. Pure, so an import previews on the device
 * exactly what the server will be asked to save. Contacts, items and bank
 * statements all read through here.
 */

/** RFC 4180: commas, quoted fields with doubled quotes and line breaks inside, CRLF or LF, a BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
      continue;
    }
    if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines (a trailing newline, spacer rows) carry nothing.
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** A header compared loosely: lower case, no spaces or punctuation ("GSTIN / UIN" → "gstinuin"). */
export const squashHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Which column holds which field, by header. `aliases` lists the names each
 * field goes by, already squashed. The first column a field matches wins; a
 * column with an unknown header is left out.
 */
export function matchColumns<F extends string>(header: string[], aliases: Record<F, string[]>): Partial<Record<F, number>> {
  const map: Partial<Record<F, number>> = {};
  const fields = Object.keys(aliases) as F[];
  header.forEach((h, i) => {
    const key = squashHeader(h);
    const field = fields.find((f) => aliases[f].includes(key));
    if (field && map[field] === undefined) map[field] = i;
  });
  return map;
}

/**
 * An amount as a plain decimal string, from how spreadsheets write it: a rupee
 * sign, Indian or Western grouping, spaces, and a negative in brackets
 * ("(1,20,000.50)" → "-120000.50"). Undefined when the cell is empty, null when
 * it isn't an amount.
 */
export function cleanAmount(raw: string): string | undefined | null {
  const v = raw.replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!v) return undefined;
  return /^-?\d+(\.\d{1,2})?$/.test(v) ? v : null;
}
