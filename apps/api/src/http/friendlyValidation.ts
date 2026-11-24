import type { ErrorObject } from 'ajv';

/**
 * Turns a request-schema failure (AJV's "must match pattern ^[A-Z]{5}...") into a sentence a
 * business owner can act on ("PAN should look like AABCV1234F"). The `field` path stays in code
 * form for the apps; only the words shown to people change.
 */

/** What people call each field. Anything not listed is spelled out from its camelCase name. */
const LABELS: Record<string, string> = {
  pan: 'PAN',
  tan: 'TAN',
  gstin: 'GSTIN',
  ifsc: 'IFSC code',
  upiId: 'UPI ID',
  accountNumber: 'Account number',
  postalCode: 'PIN code',
  pincode: 'PIN code',
  hsn: 'HSN/SAC code',
  hsnCode: 'HSN/SAC code',
  sac: 'SAC code',
  placeOfSupplyStateCode: 'Place of supply',
  stateCode: 'State',
  period: 'Return month',
  fy: 'Financial year',
  otp: 'Verification code',
  code: 'Code',
  email: 'Email address',
  phone: 'Phone number',
  password: 'Password',
  name: 'Name',
  accentColor: 'Accent colour',
  currency: 'Currency',
  bsrCode: 'BSR code',
  serial: 'Challan serial number',
  cpin: 'Payment reference (CPIN)',
  portCode: 'Port code',
  irn: 'E-invoice reference number (IRN)',
  ackNo: 'Acknowledgement number',
  ewayBillNumber: 'E-way bill number',
  qty: 'Quantity',
  rate: 'Rate',
  mrp: 'MRP',
  sku: 'Item code (SKU)',
  notes: 'Notes',
  reason: 'Reason',
  contentBase64: 'File',
  mimeType: 'File type',
  partyId: 'Party',
  itemId: 'Item',
  accountId: 'Account',
  documentId: 'Document',
  date: 'Date',
  dueDate: 'Due date',
  amount: 'Amount',
  minor: 'Amount',
  upi: 'UPI ID',
  token: 'Code',
};

/** A rule for the shape of a field, in words. Looked up by field name first, then by the pattern itself. */
const FORMAT_HINTS: Record<string, string> = {
  pan: 'PAN should look like AABCV1234F: 5 capital letters, 4 digits, then 1 capital letter',
  tan: 'TAN should look like CHED12345A: 4 capital letters, 5 digits, then 1 capital letter',
  gstin: 'GSTIN should be 15 characters, like 27AABCV1234F1ZO',
  ifsc: 'IFSC code should be 11 characters, like HDFC0001234: 4 letters, a zero, then 6 letters or digits',
  upiId: 'UPI ID should look like name@bank',
  accountNumber: 'Enter your bank account number using letters and digits only',
  postalCode: 'Enter a six-digit PIN code, like 400001',
  pincode: 'Enter a six-digit PIN code, like 400001',
  hsn: 'HSN/SAC code should be 4 to 8 digits, like 9983',
  placeOfSupplyStateCode: 'Choose the state from the list',
  period: 'Choose a return month from the list',
  fy: 'Choose a financial year, like 2026-27',
  month: 'Choose a month from the list',
  otp: 'Enter the 6-digit code',
  code: 'Enter the 6-digit code',
  accentColor: 'Pick a colour from the colour picker',
  currency: 'Choose a currency from the list',
  bsrCode: 'BSR code should be 7 digits',
  serial: 'Challan serial number should be 1 to 5 digits',
  cpin: 'Payment reference (CPIN) should be 14 letters or digits, as printed on your challan',
  portCode: 'Port code should be 6 letters or digits, like INMAA1',
  irn: 'The e-invoice reference number (IRN) should be 64 characters',
  ackNo: 'The acknowledgement number should be 15 or 16 digits',
  ewayBillNumber: 'An e-way bill number has 12 digits',
};

const PATTERN_HINTS: Record<string, string> = {
  '^[0-9]{6}$': 'Enter the 6-digit code',
  '^[1-9][0-9]{5}$': 'Enter a six-digit PIN code, like 400001',
  '^[A-Z]{3}$': 'Choose a currency from the list',
  '^#[0-9A-Fa-f]{6}$': 'Pick a colour from the colour picker',
  '^\\d{2}$': 'Choose the state from the list',
};

/** "placeOfSupply" becomes "Place of supply". */
export function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  const text = words.replace(/\b(id|gst|gstin|pan|tan|hsn|sac|ifsc|upi|pin)\b/g, (w) => (w === 'id' ? 'ID' : w.toUpperCase()));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function singular(word: string): string {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, 'y');
  if (/(ss|us)$/i.test(word)) return word;
  return word.replace(/s$/i, '');
}

/** The field's name for people, and the row it sits in ("Line 2") when it is inside a list. */
function describeField(path: string[]): { label: string; row: string } {
  let last = path.length - 1;
  while (last >= 0 && /^\d+$/.test(path[last]!)) last -= 1;
  const own = last >= 0 ? path[last]! : '';
  const label = LABELS[own] ?? (own ? humanize(own) : 'This field');
  // Walk back to the nearest list: "lines/1/qty" is row 2 of "lines".
  let row = '';
  for (let i = path.length - 2; i >= 0; i -= 1) {
    if (/^\d+$/.test(path[i]!) && i > 0) {
      const list = path[i - 1]!;
      row = `${humanize(singular(list))} ${Number(path[i]) + 1}`;
      break;
    }
  }
  return { label, row };
}

const TYPE_WORDS: Record<string, string> = {
  string: 'text',
  number: 'a number',
  integer: 'a whole number',
  boolean: 'yes or no',
  array: 'a list',
  object: 'a set of details',
};

const lower = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

function messageFor(e: ErrorObject, label: string, own: string): string {
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case 'required': {
      const missing = String(p.missingProperty ?? '');
      return `${LABELS[missing] ?? (missing ? humanize(missing) : 'This field')} is required`;
    }
    case 'pattern':
      return FORMAT_HINTS[own] ?? PATTERN_HINTS[String(p.pattern)] ?? `${label} isn't in the expected format. Check what you typed and try again`;
    case 'minLength':
      return Number(p.limit) <= 1 ? `${label} can't be empty` : `${label} needs at least ${p.limit} characters`;
    case 'maxLength':
      return `${label} can have at most ${p.limit} characters`;
    case 'minimum':
      return Number(p.limit) === 0 ? `${label} can't be negative` : `${label} must be at least ${p.limit}`;
    case 'exclusiveMinimum':
      return Number(p.limit) === 0 ? `${label} must be greater than zero` : `${label} must be more than ${p.limit}`;
    case 'maximum':
      return `${label} can be at most ${p.limit}`;
    case 'exclusiveMaximum':
      return `${label} must be less than ${p.limit}`;
    case 'multipleOf':
      return `${label} isn't a valid amount`;
    case 'minItems':
      return Number(p.limit) <= 1 ? `Add at least one ${lower(singular(label))}` : `Add at least ${p.limit} ${lower(label)}`;
    case 'maxItems':
      return `${label} can have at most ${p.limit} entries`;
    case 'enum': {
      const allowed = Array.isArray(p.allowedValues) ? (p.allowedValues as unknown[]).map(String) : [];
      return allowed.length > 0 && allowed.length <= 6 && allowed.every((a) => a.length <= 20)
        ? `${label} must be one of: ${allowed.join(', ')}`
        : `Choose ${lower(label)} from the list`;
    }
    case 'const':
      return `${label} isn't valid`;
    case 'format':
      switch (p.format) {
        case 'email':
          return 'Enter a valid email address, like name@example.com';
        case 'date':
          return `${label} must be a valid date`;
        case 'date-time':
          return `${label} must be a valid date and time`;
        case 'uuid':
          return `${label} isn't valid. Refresh the page and try again`;
        case 'uri':
        case 'url':
          return `${label} must be a valid web address`;
        default:
          return `${label} isn't in the expected format`;
      }
    case 'type': {
      const t = Array.isArray(p.type) ? String(p.type[0]) : String(p.type);
      return `${label} must be ${TYPE_WORDS[t] ?? 'a different kind of value'}`;
    }
    case 'additionalProperties':
    case 'unevaluatedProperties':
      return 'Something in this request was not recognised. Refresh the app and try again';
    default:
      return `${label} isn't valid. Check it and try again`;
  }
}

/** Wrapper errors that only say "one of these alternatives failed"; the failing detail comes with them. */
const WRAPPERS = new Set(['anyOf', 'oneOf', 'if', 'not']);

export type FriendlyIssue = { field: string; message: string };

/** One plain issue per failed rule, in the order they were found, without repeats. */
export function friendlyIssues(errors: ErrorObject[], context?: string): FriendlyIssue[] {
  const informative = errors.some((e) => !WRAPPERS.has(e.keyword)) ? errors.filter((e) => !WRAPPERS.has(e.keyword)) : errors;
  const seen = new Set<string>();
  const out: FriendlyIssue[] = [];
  for (const e of informative) {
    const path = e.instancePath.split('/').filter(Boolean);
    const missing = e.keyword === 'required' ? String((e.params as { missingProperty?: string }).missingProperty ?? '') : '';
    const fullPath = missing ? [...path, missing] : path;
    const field = [context, ...fullPath].filter(Boolean).join('.');
    let message: string;
    if (context === 'headers') {
      message = "This request couldn't be completed. Refresh the app and try again";
    } else {
      const { label, row } = describeField(path);
      const own = missing || [...path].reverse().find((s) => !/^\d+$/.test(s)) || '';
      const sentence = messageFor(e, label, own);
      message = row ? `${row}: ${sentence}` : sentence;
    }
    const key = `${field}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ field, message });
  }
  return out;
}

/** The one line shown to the person: the first problem, and how many more there are. */
export function friendlyDetail(issues: FriendlyIssue[]): string {
  const first = issues[0]?.message ?? 'Some details are not valid. Check the form and try again';
  const more = issues.length - 1;
  return more > 0 ? `${first} (and ${more} more ${more === 1 ? 'problem' : 'problems'})` : first;
}
