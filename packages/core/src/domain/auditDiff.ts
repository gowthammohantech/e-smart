/**
 * What an audit event changed, field by field, from its `before` and `after`
 * snapshots. The server stores snapshots as JSON; events recorded on the
 * device may carry a plain value (an IRN, a date) instead, which reads as a
 * single "value" change.
 *
 * Nested objects flatten to dotted paths (`billingAddress.postalCode`),
 * money reads as money, and string lists (a document's lines) show what was
 * removed and what was added rather than the whole list twice.
 */

import { formatMoney } from '../lib/format';
import { Money } from '../lib/money';
import { BusinessDocument } from '../types';

export type FieldChange = { field: string; from?: string; to?: string };

/** Bookkeeping the server changes on every save; never worth showing. */
const IGNORED = new Set(['id', 'companyId', 'version', 'createdAt', 'updatedAt', 'createdBy']);

type Flat = Record<string, unknown>;

function parse(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const isMoney = (v: unknown): v is Money =>
  !!v && typeof v === 'object' && typeof (v as Money).minor === 'number' && typeof (v as Money).currency === 'string';

const isPlainObject = (v: unknown): v is Flat => !!v && typeof v === 'object' && !Array.isArray(v) && !isMoney(v);

function flatten(obj: Flat, prefix = '', out: Flat = {}): Flat {
  Object.entries(obj).forEach(([k, v]) => {
    if (IGNORED.has(k)) return;
    const path = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) flatten(v, path, out);
    else out[path] = v;
  });
  return out;
}

function show(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (isMoney(v)) return formatMoney(v);
  if (Array.isArray(v)) return v.map((x) => show(x) ?? '').join('; ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function auditChanges(before: string | undefined, after: string | undefined): FieldChange[] {
  const b = parse(before);
  const a = parse(after);
  if (b === undefined && a === undefined) return [];
  if (!isPlainObject(b) || !isPlainObject(a)) {
    // A plain value, or a create/delete with only one side: nothing to compare field by field.
    if (isPlainObject(b) || isPlainObject(a)) return [];
    const from = show(b);
    const to = show(a);
    return from === to ? [] : [{ field: 'value', from, to }];
  }

  const fb = flatten(b);
  const fa = flatten(a);
  const changes: FieldChange[] = [];
  new Set([...Object.keys(fb), ...Object.keys(fa)]).forEach((field) => {
    const x = fb[field];
    const y = fa[field];
    if (Array.isArray(x) && Array.isArray(y) && [...x, ...y].every((v) => typeof v === 'string')) {
      const removed = (x as string[]).filter((v) => !y.includes(v));
      const added = (y as string[]).filter((v) => !x.includes(v));
      if (removed.length || added.length) changes.push({ field, from: show(removed), to: show(added) });
      return;
    }
    const from = show(x);
    const to = show(y);
    if (from !== to) changes.push({ field, from, to });
  });
  return changes;
}

/**
 * A document as the audit trail keeps it on the device, in the same shape
 * the server records: the fields a person edits, one readable string per line.
 */
export function documentAuditSnapshot(doc: BusinessDocument, partyName?: string): string {
  return JSON.stringify({
    status: doc.status,
    party: partyName ?? doc.partyId,
    date: doc.date,
    dueDate: doc.dueDate,
    reference: doc.reference,
    notes: doc.notes,
    terms: doc.terms,
    total: doc.totals.grandTotal,
    lines: doc.lines.map((l) => `${l.name} × ${l.quantity} ${l.unit} @ ${(l.unitPrice.minor / 100).toFixed(2)}, ${l.taxRate}%`),
  });
}
