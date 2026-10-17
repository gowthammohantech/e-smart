import type { Schema } from '@esmart/api-contract';
import { EWAY_MAX_DISTANCE_KM } from '@esmart/core/domain/ewayBill';
import { isValidGstin, normalizeGstin, panOfGstin, stateCodeOfGstin } from '@esmart/core/domain/gstin';
import { stateNameOf } from '@esmart/core/domain/stateCodes';
import { sql } from 'drizzle-orm';
import type { Db } from '@esmart/db';
import type { Config } from '../config';
import { featureUnavailable } from '../http/errors';

/** What the GST public search returns for a GSTIN. */
export type GstinRecord = {
  gstin: string;
  legalName: string;
  tradeName?: string;
  status: 'Active' | 'Cancelled' | 'Suspended' | 'Inactive';
  registrationType: Schema<'GstRegistrationType'>;
  address?: Schema<'Address'>;
  registeredOn?: string;
};

export type PincodeRecord = { pincode: string; city: string; stateCode: string };
export type RoadDistance = { distanceKm: number; source: 'ewb-portal' | 'maps' };

/**
 * GSTIN verification (GST public search through a GSP), plus the two other
 * lookups the same GSP account serves: PIN codes the local directory lacks,
 * and the EWB portal's road distance between two PIN codes.
 */
export interface GstinProvider {
  readonly name: string;
  /** The registration, or null when the portal has no such GSTIN. Throws on an upstream failure. */
  lookup(gstin: string): Promise<GstinRecord | null>;
  /** City and state for a PIN code the local directory doesn't have yet. */
  pincode(pincode: string): Promise<PincodeRecord | null>;
  /** Approximate road distance between two PIN codes, capped at the e-way bill maximum. */
  distance(fromPincode: string, toPincode: string): Promise<RoadDistance>;
}

// ---------------------------------------------------------------- simulator data

/**
 * Where each GST state's main commercial centre is: a city, a PIN code in it,
 * and rough coordinates. The simulator places a PIN code at its state's
 * centre and measures between centres.
 */
const STATE_CENTRES: Record<string, { city: string; pincode: string; lat: number; lon: number }> = {
  '01': { city: 'Srinagar', pincode: '190001', lat: 34.08, lon: 74.8 },
  '02': { city: 'Shimla', pincode: '171001', lat: 31.1, lon: 77.17 },
  '03': { city: 'Ludhiana', pincode: '141001', lat: 30.9, lon: 75.85 },
  '04': { city: 'Chandigarh', pincode: '160017', lat: 30.73, lon: 76.78 },
  '05': { city: 'Dehradun', pincode: '248001', lat: 30.32, lon: 78.03 },
  '06': { city: 'Gurugram', pincode: '122001', lat: 28.46, lon: 77.03 },
  '07': { city: 'New Delhi', pincode: '110001', lat: 28.61, lon: 77.21 },
  '08': { city: 'Jaipur', pincode: '302001', lat: 26.91, lon: 75.79 },
  '09': { city: 'Lucknow', pincode: '226001', lat: 26.85, lon: 80.95 },
  '10': { city: 'Patna', pincode: '800001', lat: 25.59, lon: 85.14 },
  '11': { city: 'Gangtok', pincode: '737101', lat: 27.33, lon: 88.61 },
  '12': { city: 'Itanagar', pincode: '791111', lat: 27.08, lon: 93.6 },
  '13': { city: 'Kohima', pincode: '797001', lat: 25.67, lon: 94.11 },
  '14': { city: 'Imphal', pincode: '795001', lat: 24.82, lon: 93.94 },
  '15': { city: 'Aizawl', pincode: '796001', lat: 23.73, lon: 92.72 },
  '16': { city: 'Agartala', pincode: '799001', lat: 23.83, lon: 91.29 },
  '17': { city: 'Shillong', pincode: '793001', lat: 25.58, lon: 91.89 },
  '18': { city: 'Guwahati', pincode: '781001', lat: 26.14, lon: 91.74 },
  '19': { city: 'Kolkata', pincode: '700001', lat: 22.57, lon: 88.36 },
  '20': { city: 'Ranchi', pincode: '834001', lat: 23.34, lon: 85.31 },
  '21': { city: 'Bhubaneswar', pincode: '751001', lat: 20.3, lon: 85.82 },
  '22': { city: 'Raipur', pincode: '492001', lat: 21.25, lon: 81.63 },
  '23': { city: 'Bhopal', pincode: '462001', lat: 23.26, lon: 77.41 },
  '24': { city: 'Ahmedabad', pincode: '380001', lat: 23.02, lon: 72.57 },
  '26': { city: 'Silvassa', pincode: '396230', lat: 20.27, lon: 73.01 },
  '27': { city: 'Mumbai', pincode: '400001', lat: 19.08, lon: 72.88 },
  '29': { city: 'Bengaluru', pincode: '560001', lat: 12.97, lon: 77.59 },
  '30': { city: 'Panaji', pincode: '403001', lat: 15.49, lon: 73.83 },
  '31': { city: 'Kavaratti', pincode: '682555', lat: 10.57, lon: 72.64 },
  '32': { city: 'Kochi', pincode: '682001', lat: 9.93, lon: 76.27 },
  '33': { city: 'Chennai', pincode: '600001', lat: 13.08, lon: 80.27 },
  '34': { city: 'Puducherry', pincode: '605001', lat: 11.94, lon: 79.81 },
  '35': { city: 'Port Blair', pincode: '744101', lat: 11.62, lon: 92.73 },
  '36': { city: 'Hyderabad', pincode: '500001', lat: 17.39, lon: 78.49 },
  '37': { city: 'Vijayawada', pincode: '520001', lat: 16.51, lon: 80.65 },
  '38': { city: 'Leh', pincode: '194101', lat: 34.15, lon: 77.58 },
};

/** Exceptions to the two-digit rule below, by three-digit PIN prefix. */
const PIN3_STATE: Record<string, string> = {
  '160': '04', '194': '38', '246': '05', '247': '05', '248': '05', '249': '05', '262': '05', '263': '05',
  '396': '26', '403': '30', '605': '34', '682': '32', '737': '11', '744': '35',
  '790': '12', '791': '12', '792': '12', '793': '17', '794': '17', '795': '14', '796': '15', '797': '13', '798': '13', '799': '16',
  '813': '20', '814': '20', '815': '20', '816': '20', '822': '20', '825': '20', '826': '20', '827': '20', '828': '20', '829': '20',
  '831': '20', '832': '20', '833': '20', '834': '20', '835': '20',
};

/** India Post's postal circles by the first two PIN digits. */
function stateOfPin(pin: string): string | undefined {
  const p3 = PIN3_STATE[pin.slice(0, 3)];
  if (p3) return p3;
  const p2 = Number(pin.slice(0, 2));
  const ranges: [number, number, string][] = [
    [11, 11, '07'], [12, 13, '06'], [14, 16, '03'], [17, 17, '02'], [18, 19, '01'], [20, 28, '09'],
    [30, 34, '08'], [36, 39, '24'], [40, 44, '27'], [45, 48, '23'], [49, 49, '22'], [50, 50, '36'],
    [51, 53, '37'], [56, 59, '29'], [60, 64, '33'], [67, 69, '32'], [70, 74, '19'], [75, 77, '21'],
    [78, 78, '18'], [80, 85, '10'],
  ];
  return ranges.find(([lo, hi]) => p2 >= lo && p2 <= hi)?.[2];
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * The simulator's road distance. Same PIN: a short local hop. Same state:
 * grows with how far apart the sorting districts (first three digits) are.
 * Different states: straight line between the state centres times a road
 * factor. Symmetric and deterministic, so tests can pin the numbers.
 */
export function simulatedDistanceKm(fromPincode: string, toPincode: string): number {
  const [a, b] = [fromPincode, toPincode].sort();
  if (a === b) return 8;
  const sa = stateOfPin(a);
  const sb = stateOfPin(b);
  const district = Math.abs(Number(a.slice(0, 3)) - Number(b.slice(0, 3)));
  const local = Math.abs(Number(a.slice(3)) - Number(b.slice(3))) % 40;
  let km: number;
  if (sa && sa === sb) {
    km = district === 0 ? 10 + local : Math.min(40 + district * 25 + local, 900);
  } else if (sa && sb) {
    km = Math.round(haversineKm(STATE_CENTRES[sa], STATE_CENTRES[sb]) * 1.3) + local;
  } else {
    // Army postal or an unknown circle: go by postal region alone.
    km = 150 + Math.abs(Number(a[0]) - Number(b[0])) * 350 + district;
  }
  return Math.max(1, Math.min(Math.round(km), EWAY_MAX_DISTANCE_KM));
}

type Known = { legalName: string; tradeName?: string; address?: Schema<'Address'> };

type AddressRow = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  state_code: string | null;
  postal_code: string | null;
  country: string | null;
};

function toAddress(r: AddressRow): Schema<'Address'> | undefined {
  if (!r.line1 || !r.city || !r.postal_code || !r.country) return undefined;
  return {
    line1: r.line1,
    ...(r.line2 ? { line2: r.line2 } : {}),
    city: r.city,
    ...(r.state ? { state: r.state } : {}),
    ...(r.state_code ? { stateCode: r.state_code } : {}),
    postalCode: r.postal_code,
    country: r.country,
  } as Schema<'Address'>;
}

/**
 * A GSTIN some business on this server already recorded: a company's own
 * registration first, then a transporter, then a party. The simulator answers
 * with that name, so seeded and hand-entered GSTINs autofill consistently.
 */
async function knownGstin(db: Db, gstin: string): Promise<Known | null> {
  const company = await db.execute<{ legal_name: string | null; name: string } & AddressRow>(sql`
    select legal_name, name, address_line1 as line1, address_line2 as line2, address_city as city, address_state as state,
           address_state_code as state_code, address_postal_code as postal_code, address_country as country
      from companies where upper(tax_identifier) = ${gstin} order by created_at limit 1`);
  const c = company.rows[0];
  if (c) return { legalName: c.legal_name ?? c.name, tradeName: c.name, address: toAddress(c) };

  const transporter = await db.execute<{ name: string }>(sql`select name from transporters where upper(transporter_id) = ${gstin} order by created_at limit 1`);
  if (transporter.rows[0]) return { legalName: transporter.rows[0].name };

  const party = await db.execute<{ name: string; display_name: string | null } & AddressRow>(sql`
    select name, display_name, billing_line1 as line1, billing_line2 as line2, billing_city as city, billing_state as state,
           billing_state_code as state_code, billing_postal_code as postal_code, billing_country as country
      from parties where upper(tax_id) = ${gstin} order by created_at limit 1`);
  const p = party.rows[0];
  if (p) return { legalName: p.name, tradeName: p.display_name ? undefined : p.name, address: toAddress(p) };
  return null;
}

/** A PIN code from the state centres, or from any address already recorded on this server. */
async function knownPincode(db: Db, pincode: string): Promise<PincodeRecord | null> {
  for (const [stateCode, c] of Object.entries(STATE_CENTRES)) if (c.pincode === pincode) return { pincode, city: c.city, stateCode };
  const found = await db.execute<{ city: string; state_code: string }>(sql`
    select city, state_code from (
      select address_city as city, address_state_code as state_code, address_country as country from companies where address_postal_code = ${pincode}
      union all
      select address_city, address_state_code, address_country from branches where address_postal_code = ${pincode}
      union all
      select billing_city, billing_state_code, billing_country from parties where billing_postal_code = ${pincode}
    ) a where country = 'IN' and state_code is not null and city is not null limit 1`);
  const r = found.rows[0];
  return r ? { pincode, city: r.city, stateCode: r.state_code } : null;
}

const NAME_WORDS = [
  'Shree', 'Ganesh', 'Laxmi', 'Sai', 'Om', 'Balaji', 'Krishna', 'Surya', 'Navkar', 'Jai', 'Mahalaxmi', 'Siddhi',
  'Vijay', 'Annapurna', 'Kaveri', 'Ganga', 'Sagar', 'Pooja', 'Tirupati', 'Ambika', 'Royal', 'National', 'Bharat', 'Everest',
];
const TRADE_WORDS = ['Traders', 'Enterprises', 'Industries', 'Distributors', 'Agencies', 'Suppliers', 'Exports', 'Polymers', 'Steels', 'Textiles'];

/** The PAN's fourth letter says what kind of holder it is. */
function entitySuffix(holder: string): string {
  switch (holder) {
    case 'C':
      return 'Private Limited';
    case 'F':
      return 'LLP';
    case 'H':
      return '(HUF)';
    case 'T':
      return 'Trust';
    case 'A':
    case 'B':
      return 'Association';
    default:
      return '';
  }
}

function hashOf(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** A plausible, stable registration for any GSTIN the database doesn't know. */
function synthesize(gstin: string): GstinRecord {
  const pan = panOfGstin(gstin);
  const h = hashOf(pan);
  const first = NAME_WORDS[h % NAME_WORDS.length];
  const second = NAME_WORDS[(h >>> 8) % NAME_WORDS.length];
  const trade = TRADE_WORDS[(h >>> 16) % TRADE_WORDS.length];
  const tradeName = `${first === second ? first : `${first} ${second}`} ${trade}`;
  const suffix = entitySuffix(pan[3]);
  const stateCode = stateCodeOfGstin(gstin);
  const centre = STATE_CENTRES[stateCode];
  const registeredOn = new Date(Date.UTC(2017, 6, 1) + (h % 2400) * 86_400_000).toISOString().slice(0, 10);
  return {
    gstin,
    legalName: suffix ? `${tradeName} ${suffix}` : tradeName,
    tradeName,
    status: 'Active',
    registrationType: (h >>> 4) % 9 === 0 ? 'composition' : 'regular',
    address: centre
      ? { line1: `${1 + (h % 180)}, ${['Market Road', 'Industrial Area', 'Station Road', 'MG Road'][(h >>> 12) % 4]}`, city: centre.city, state: stateNameOf(stateCode), stateCode, postalCode: centre.pincode, country: 'IN' }
      : undefined,
    registeredOn,
  };
}

/**
 * In-process stand-in for the GSP: validates, answers from what the database
 * already holds, and makes up the rest consistently. Development and tests only.
 */
class SimulatedGstinProvider implements GstinProvider {
  readonly name = 'simulator';

  constructor(private readonly db: Db) {}

  async lookup(raw: string): Promise<GstinRecord | null> {
    const gstin = normalizeGstin(raw);
    if (!isValidGstin(gstin)) return null;
    // Entity number 0 is never issued; the simulator treats it as unregistered.
    if (gstin[12] === '0') return null;
    const base = synthesize(gstin);
    const known = await knownGstin(this.db, gstin);
    if (!known) return base;
    return { ...base, legalName: known.legalName, tradeName: known.tradeName ?? known.legalName, address: known.address ?? base.address, registrationType: 'regular' };
  }

  async pincode(pincode: string): Promise<PincodeRecord | null> {
    return knownPincode(this.db, pincode);
  }

  async distance(fromPincode: string, toPincode: string): Promise<RoadDistance> {
    return { distanceKm: simulatedDistanceKm(fromPincode, toPincode), source: 'ewb-portal' };
  }
}

/**
 * No GSTIN lookup at all. GSTINs are still checked locally (check digit, state
 * code) by the callers; lookups, PIN codes the directory lacks and portal
 * distances answer 503 FEATURE_UNAVAILABLE so the apps can fall back to
 * manual entry. Allowed in production until a GSP adapter exists.
 */
class DisabledGstinProvider implements GstinProvider {
  readonly name = 'disabled';
  private unavailable(): never {
    throw featureUnavailable('GSTIN lookup is not available yet. Enter the details by hand.');
  }
  async lookup(): Promise<GstinRecord | null> {
    this.unavailable();
  }
  async pincode(): Promise<PincodeRecord | null> {
    this.unavailable();
  }
  async distance(): Promise<RoadDistance> {
    this.unavailable();
  }
}

/**
 * GSP adapters differ per vendor in URL shape and auth, so none is wired in
 * yet: `GSTIN_PROVIDER=gsp` fails at boot rather than at the first lookup.
 */
export function createGstinProvider(config: Config, db: Db): GstinProvider {
  switch (config.GSTIN_PROVIDER) {
    case 'gsp':
      throw new Error('GSTIN_PROVIDER=gsp has no adapter yet; use disabled (or simulator outside production).');
    case 'disabled':
      return new DisabledGstinProvider();
    case 'simulator':
      return new SimulatedGstinProvider(db);
  }
}
