/**
 * A company's own fields on its contacts, items and documents: a vehicle number on a delivery, a
 * drug licence on a customer, a warranty period on an item. Defined once, filled in on each record,
 * kept as `{ [fieldId]: value }` so a relabelled field keeps its values. Checked the same way on the
 * device and on the server.
 */

export type CustomFieldEntity = 'party' | 'item' | 'document';
export type CustomFieldKind = 'text' | 'number' | 'date' | 'select' | 'checkbox';
export type CustomValue = string | number | boolean | null;
export type CustomValues = Record<string, CustomValue>;

export type CustomField = {
  id: string;
  companyId?: string;
  entity: CustomFieldEntity;
  label: string;
  kind: CustomFieldKind;
  /** A select's choices, in order. */
  options?: string[];
  required?: boolean;
  /** Printed on documents: a document field on its own PDF, a party field on documents to that party. */
  showOnPdf?: boolean;
  position?: number;
  status?: 'active' | 'inactive';
  version?: number;
};

export type CustomProblem = { fieldId: string; message: string };

const empty = (v: CustomValue | undefined) => v === undefined || v === null || v === '';

/**
 * The values a record may keep, and what is wrong with them. Values of fields that no longer exist are
 * dropped; an inactive field keeps what it had but is no longer required. Numbers arrive as numbers or
 * numeric text, dates as YYYY-MM-DD, a checkbox as true or false.
 */
export function checkCustomValues(fields: CustomField[], entity: CustomFieldEntity, values: CustomValues | null | undefined): { values: CustomValues; problems: CustomProblem[] } {
  const out: CustomValues = {};
  const problems: CustomProblem[] = [];
  for (const f of fields.filter((x) => x.entity === entity)) {
    const raw = values?.[f.id];
    const active = (f.status ?? 'active') === 'active';
    if (empty(raw)) {
      if (active && f.required && f.kind !== 'checkbox') problems.push({ fieldId: f.id, message: `${f.label} is required` });
      continue;
    }
    switch (f.kind) {
      case 'text': {
        const text = String(raw).trim();
        if (text.length > 500) problems.push({ fieldId: f.id, message: `${f.label} is at most 500 characters` });
        else if (text) out[f.id] = text;
        break;
      }
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
        if (!Number.isFinite(n)) problems.push({ fieldId: f.id, message: `${f.label} must be a number` });
        else out[f.id] = n;
        break;
      }
      case 'date':
        if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) problems.push({ fieldId: f.id, message: `${f.label} must be a date` });
        else out[f.id] = raw;
        break;
      case 'select':
        if (!(f.options ?? []).includes(String(raw))) problems.push({ fieldId: f.id, message: `${f.label} must be one of ${(f.options ?? []).join(', ')}` });
        else out[f.id] = String(raw);
        break;
      case 'checkbox':
        out[f.id] = raw === true || raw === 'true';
        break;
    }
  }
  return { values: out, problems };
}

/** A value as it reads on screen and on paper. */
export function customValueText(f: Pick<CustomField, 'kind'>, v: CustomValue | undefined, words: { yes: string; no: string } = { yes: 'Yes', no: 'No' }): string {
  if (empty(v)) return '';
  if (f.kind === 'checkbox') return v ? words.yes : words.no;
  if (f.kind === 'date' && typeof v === 'string') {
    const [y, m, d] = v.split('-');
    return `${d}/${m}/${y}`;
  }
  return String(v);
}

/** The fields to print, in order, with their values: only those marked for print and filled in. */
export function printableFields(fields: CustomField[], entity: CustomFieldEntity, values: CustomValues | null | undefined): { label: string; text: string }[] {
  return fields
    .filter((f) => f.entity === entity && f.showOnPdf && !empty(values?.[f.id]) && (f.kind !== 'checkbox' || values?.[f.id] === true))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.label.localeCompare(b.label))
    .map((f) => ({ label: f.label, text: customValueText(f, values?.[f.id]) }));
}
