/**
 * Row ↔ wire helpers. The contract's optional fields are absent, not null,
 * so responses go through `compact`; money is `{ minor, currency }`; and
 * addresses are flattened into prefixed columns in the database.
 */
import type { Schema } from '@esmart/api-contract';
import { PINCODE_RE } from '@esmart/core/lib/validators';
import { invalid } from '../http/errors';

export type Money = Schema<'Money'>;
export type Address = Schema<'Address'>;

export function money(minor: number | string | null | undefined, currency: string): Money {
  return { minor: Number(minor ?? 0), currency };
}

export function maybeMoney(minor: number | string | null | undefined, currency: string): Money | undefined {
  return minor === null || minor === undefined ? undefined : money(minor, currency);
}

export function iso(d: Date | string | null | undefined): string | undefined {
  if (d === null || d === undefined) return undefined;
  return (typeof d === 'string' ? new Date(d) : d).toISOString();
}

/** `T` with every `null` turned into an absent (optional) field. */
export type Compact<T> = T extends Date | Buffer
  ? T
  : T extends (infer U)[]
    ? Compact<U>[]
    : T extends object
      ? { [K in keyof T]: Compact<Exclude<T[K], null>> }
      : T;

/** Drops null and undefined, recursively into plain objects and arrays. */
export function compact<T>(value: T): Compact<T>;
export function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== null && v !== undefined) out[k] = compact(v);
    return out;
  }
  return value;
}

type AddressColumns<P extends string, Req> = {
  [K in `${P}Line1` | `${P}City` | `${P}State` | `${P}PostalCode` | `${P}Country`]: Req;
} & {
  [K in `${P}Line2` | `${P}StateCode`]: string | null;
};

/** Reads `billingLine1`, `billingCity`, … into an Address, or undefined if unset. */
export function addressFrom<P extends string>(row: Record<string, unknown>, prefix: P): Address | undefined {
  const r = row as Record<string, string | null | undefined>;
  if (!r[`${prefix}Line1`]) return undefined;
  return compact({
    line1: r[`${prefix}Line1`] as string,
    line2: r[`${prefix}Line2`] ?? undefined,
    city: r[`${prefix}City`] as string,
    state: r[`${prefix}State`] as string,
    stateCode: r[`${prefix}StateCode`] ?? undefined,
    postalCode: r[`${prefix}PostalCode`] as string,
    country: (r[`${prefix}Country`] as string)?.trim(),
  });
}

/**
 * Writes an Address to prefixed columns; all null when the address is absent.
 * Every stored address passes through here, so an Indian PIN is checked here
 * too: six digits, not starting with 0. Empty is allowed.
 */
export function addressTo<P extends string>(prefix: P, a: Address): AddressColumns<P, string>;
export function addressTo<P extends string>(prefix: P, a: Address | undefined | null): AddressColumns<P, string | null>;
export function addressTo<P extends string>(prefix: P, a: Address | undefined | null): AddressColumns<P, string | null> {
  const pin = a?.postalCode?.trim();
  if (pin && a?.country?.trim() === 'IN' && !PINCODE_RE.test(pin)) {
    throw invalid(prefix === 'address' ? 'address.postalCode' : `${prefix}Address.postalCode`, 'Enter a six-digit PIN code, e.g. 400001');
  }
  return {
    [`${prefix}Line1`]: a?.line1 ?? null,
    [`${prefix}Line2`]: a?.line2 ?? null,
    [`${prefix}City`]: a?.city ?? null,
    [`${prefix}State`]: a?.state ?? null,
    [`${prefix}StateCode`]: a?.stateCode ?? null,
    [`${prefix}PostalCode`]: a?.postalCode ?? null,
    [`${prefix}Country`]: a?.country ?? null,
  } as AddressColumns<P, string | null>;
}

/** `Versioned` fields every mutable resource carries. */
export function versioned(row: { version: number; createdAt?: Date | null; updatedAt?: Date | null }) {
  return { version: row.version, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}
