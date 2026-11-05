import type { Money } from '../lib/money';
import { fromMajor } from '../lib/money';
import { INDIAN_STATES } from '../data/masters';
import { isValidGstin, normalizeGstin, panOfGstin, stateCodeOfGstin } from './gstin';

/**
 * Contacts from a spreadsheet: a CSV as Excel, Google Sheets, Tally or another app exports it,
 * read into party records the API's `importParties` takes. Pure, so the app previews exactly
 * what the server will be asked to create.
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

export type ImportField =
  | 'name'
  | 'displayName'
  | 'code'
  | 'kind'
  | 'taxId'
  | 'pan'
  | 'email'
  | 'phone'
  | 'line1'
  | 'line2'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country'
  | 'openingBalance'
  | 'openingSide'
  | 'creditLimit'
  | 'paymentTermsDays'
  | 'notes';

/** Header names each field goes by, lower-cased with spaces and punctuation removed. */
const ALIASES: Record<ImportField, string[]> = {
  name: ['name', 'partyname', 'customername', 'suppliername', 'vendorname', 'contactname', 'companyname', 'ledgername', 'businessname'],
  displayName: ['displayname', 'tradename', 'alias'],
  code: ['code', 'partycode', 'customercode', 'suppliercode', 'id'],
  kind: ['type', 'kind', 'partytype', 'contacttype', 'group', 'under'],
  taxId: ['gstin', 'gst', 'gstno', 'gstnumber', 'gstinuin', 'gstinno', 'taxid'],
  pan: ['pan', 'panno', 'pannumber', 'itpan'],
  email: ['email', 'emailid', 'emailaddress', 'mail'],
  phone: ['phone', 'mobile', 'mobileno', 'phoneno', 'contactno', 'contactnumber', 'telephone', 'whatsapp'],
  line1: ['address', 'address1', 'addressline1', 'billingaddress', 'street'],
  line2: ['address2', 'addressline2', 'area', 'locality'],
  city: ['city', 'town', 'district'],
  state: ['state', 'statename', 'province', 'stateut'],
  postalCode: ['pin', 'pincode', 'postalcode', 'zip', 'zipcode', 'postcode'],
  country: ['country'],
  openingBalance: ['openingbalance', 'opening', 'openingbal', 'balance', 'ob'],
  openingSide: ['drcr', 'openingdrcr', 'balancetype', 'side'],
  creditLimit: ['creditlimit', 'limit'],
  paymentTermsDays: ['creditdays', 'creditperiod', 'paymentterms', 'paymenttermsdays', 'termsdays', 'duedays'],
  notes: ['notes', 'remarks', 'note', 'comments'],
};

const squash = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Which column holds which field, by header; a column with an unknown header is left out. */
export function guessColumns(header: string[]): Partial<Record<ImportField, number>> {
  const map: Partial<Record<ImportField, number>> = {};
  header.forEach((h, i) => {
    const key = squash(h);
    const field = (Object.keys(ALIASES) as ImportField[]).find((f) => ALIASES[f].includes(key));
    if (field && map[field] === undefined) map[field] = i;
  });
  return map;
}

export type ImportKind = 'customer' | 'supplier' | 'both' | 'general';

/** "Sundry Debtors", "Customer", "Vendor"… to a kind; undefined when it says nothing we know. */
export function kindOf(raw: string): ImportKind | undefined {
  const v = squash(raw);
  if (!v) return undefined;
  if (/^(customer|debtor|sundrydebtors?|buyer|client)s?$/.test(v)) return 'customer';
  if (/^(supplier|vendor|creditor|sundrycreditors?|seller)s?$/.test(v)) return 'supplier';
  if (/^(both|customerandsupplier|customersupplier)$/.test(v)) return 'both';
  if (/^(general|other|contact)s?$/.test(v)) return 'general';
  return undefined;
}

/** "Tamil Nadu", "TN", "33" to the GST state code; undefined when it isn't an Indian state. */
export function stateCodeOf(raw: string): string | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  if (/^\d{1,2}$/.test(v)) return INDIAN_STATES.find((s) => s.code === v.padStart(2, '0'))?.code;
  const key = squash(v);
  return INDIAN_STATES.find((s) => squash(s.name) === key)?.code ?? STATE_ABBREVIATIONS[v.toUpperCase()];
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  JK: '01', HP: '02', PB: '03', CH: '04', UK: '05', UT: '05', HR: '06', DL: '07', RJ: '08', UP: '09', BR: '10', SK: '11', AR: '12', NL: '13', MN: '14', MZ: '15', TR: '16', ML: '17', AS: '18', WB: '19', JH: '20', OD: '21', OR: '21', CG: '22', CT: '22', MP: '23', GJ: '24', DN: '26', DD: '26', MH: '27', KA: '29', GA: '30', LD: '31', KL: '32', TN: '33', PY: '34', AN: '35', TS: '36', TG: '36', AP: '37', LA: '38',
};

export type ImportedParty = {
  kind: ImportKind;
  name: string;
  displayName?: string;
  code?: string;
  taxId?: string;
  pan?: string;
  email?: string;
  phone?: string;
  currency: string;
  billingAddress: { line1: string; line2?: string; city: string; state: string; stateCode?: string; postalCode: string; country: string };
  openingBalance: Money;
  /** Which side the opening balance is on, when the sheet says (Dr/Cr); otherwise the kind's usual side. */
  openingBalanceSide?: 'dr' | 'cr';
  creditLimit?: Money;
  paymentTermsDays: number;
  notes?: string;
};

export type ImportRow = { line: number; party?: ImportedParty; problems: string[] };

/**
 * Each data row as a party, with what is wrong with it. `line` is the row's line in the sheet
 * (the header is line 1). A GSTIN fills in the PAN and the state when the sheet leaves them out.
 */
export function partiesFromCsv(
  rows: string[][],
  columns: Partial<Record<ImportField, number>>,
  defaults: { kind: ImportKind; currency: string },
): ImportRow[] {
  return rows.slice(1).map((r, i) => {
    const get = (f: ImportField) => (columns[f] !== undefined ? (r[columns[f]!] ?? '').trim() : '');
    const problems: string[] = [];
    const name = get('name');
    if (!name) problems.push('No name');

    const kindRaw = get('kind');
    const kind = kindRaw ? kindOf(kindRaw) : defaults.kind;
    if (!kind) problems.push(`Type "${kindRaw}" is not customer, supplier, both or general`);

    const gstinRaw = get('taxId');
    const taxId = gstinRaw ? normalizeGstin(gstinRaw) : undefined;
    if (taxId && !isValidGstin(taxId)) problems.push(`GSTIN ${gstinRaw} is not valid`);
    const validGstin = taxId && isValidGstin(taxId) ? taxId : undefined;

    const stateRaw = get('state');
    const stateCode = stateCodeOf(stateRaw) ?? (validGstin ? stateCodeOfGstin(validGstin) : undefined);
    if (validGstin && stateCode && stateCode !== stateCodeOfGstin(validGstin)) problems.push(`State ${stateRaw} does not match the GSTIN's state`);
    const stateName = stateCode ? INDIAN_STATES.find((s) => s.code === stateCode)!.name : stateRaw;

    const amount = (f: ImportField): Money | undefined => {
      const v = get(f).replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
      if (!v) return undefined;
      if (!/^-?\d+(\.\d{1,2})?$/.test(v)) {
        problems.push(`${f === 'creditLimit' ? 'Credit limit' : 'Opening balance'} "${get(f)}" is not an amount`);
        return undefined;
      }
      return fromMajor(v, defaults.currency);
    };
    const opening = amount('openingBalance');
    const sideRaw = squash(get('openingSide'));
    const openingBalanceSide = sideRaw.startsWith('dr') || sideRaw === 'debit' ? 'dr' : sideRaw.startsWith('cr') || sideRaw === 'credit' ? 'cr' : undefined;
    const creditLimit = amount('creditLimit');
    const termsRaw = get('paymentTermsDays').replace(/\s*days?$/i, '');
    const paymentTermsDays = termsRaw ? Number(termsRaw) : 0;
    if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0) problems.push(`Credit days "${get('paymentTermsDays')}" is not a whole number of days`);
    const email = get('email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`Email ${email} is not valid`);

    const country = get('country') || 'IN';
    const party: ImportedParty | undefined =
      name && kind
        ? {
            kind,
            name,
            ...(get('displayName') && { displayName: get('displayName') }),
            ...(get('code') && { code: get('code') }),
            ...(validGstin && { taxId: validGstin }),
            ...((get('pan') || validGstin) && { pan: get('pan').toUpperCase() || panOfGstin(validGstin) }),
            ...(email && { email }),
            ...(get('phone') && { phone: get('phone') }),
            currency: defaults.currency,
            billingAddress: {
              line1: get('line1'),
              ...(get('line2') && { line2: get('line2') }),
              city: get('city'),
              state: stateName,
              ...(stateCode && { stateCode }),
              postalCode: get('postalCode'),
              country: country.length === 2 ? country.toUpperCase() : /^india$/i.test(country) ? 'IN' : country,
            },
            // A negative balance on the sheet reads as the other side.
            openingBalance: opening ? { ...opening, minor: Math.abs(opening.minor) } : fromMajor('0', defaults.currency),
            ...((openingBalanceSide || (opening && opening.minor < 0)) && { openingBalanceSide: openingBalanceSide ?? (kind === 'supplier' ? 'dr' : 'cr') }),
            ...(creditLimit && { creditLimit }),
            paymentTermsDays: Number.isInteger(paymentTermsDays) && paymentTermsDays >= 0 ? paymentTermsDays : 0,
            ...(get('notes') && { notes: get('notes') }),
          }
        : undefined;
    return { line: i + 2, party: problems.length ? undefined : party, problems };
  });
}
