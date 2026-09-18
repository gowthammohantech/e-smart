/**
 * Decimal-safe money arithmetic (FRD 6 / FRD 10).
 *
 * Every amount is carried as an integer count of minor units together with its
 * currency, so no binary floating point ever touches a financial value. All
 * multiplication/division rounds explicitly at the point of use.
 */

export type CurrencyCode = string;

export type Money = {
  /** Integer amount in minor units (paise, cents, fils...). */
  minor: number;
  currency: CurrencyCode;
};

export type RoundingMode = 'half-up' | 'half-even' | 'down' | 'up';

const DEFAULT_PRECISION = 2;

/** Minor-unit exponent per ISO 4217. Anything unlisted uses 2. */
const PRECISION: Record<string, number> = {
  INR: 2, USD: 2, EUR: 2, GBP: 2, AED: 2, SGD: 2, AUD: 2, CAD: 2,
  JPY: 0, KWD: 3, BHD: 3, OMR: 3, TND: 3,
};

export function precisionOf(currency: CurrencyCode): number {
  return PRECISION[currency] ?? DEFAULT_PRECISION;
}

export function factorOf(currency: CurrencyCode): number {
  return Math.pow(10, precisionOf(currency));
}

export function money(minor: number, currency: CurrencyCode): Money {
  return { minor: Math.round(minor), currency };
}

export function zero(currency: CurrencyCode): Money {
  return { minor: 0, currency };
}

/** Build Money from a major-unit number or numeric string ("1234.50"). */
export function fromMajor(value: number | string, currency: CurrencyCode): Money {
  const f = factorOf(currency);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return zero(currency);
    return money(roundHalfUp(value * f), currency);
  }
  const trimmed = String(value).trim().replace(/,/g, '');
  if (trimmed === '' || trimmed === '-' || trimmed === '.') return zero(currency);
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return zero(currency);
  return money(roundHalfUp(n * f), currency);
}

export function toMajor(m: Money): number {
  return m.minor / factorOf(m.currency);
}

function assertSame(a: Money, b: Money) {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSame(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSame(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function sum(items: Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency));
}

export function negate(a: Money): Money {
  return money(-a.minor, a.currency);
}

export function abs(a: Money): Money {
  return money(Math.abs(a.minor), a.currency);
}

/** Multiply by a plain quantity/rate, rounding the result to minor units. */
export function multiply(a: Money, factor: number, mode: RoundingMode = 'half-up'): Money {
  return money(round(a.minor * factor, mode), a.currency);
}

export function divide(a: Money, divisor: number, mode: RoundingMode = 'half-up'): Money {
  if (divisor === 0) return zero(a.currency);
  return money(round(a.minor / divisor, mode), a.currency);
}

/** Percentage of an amount, e.g. percent(total, 18) for 18% GST. */
export function percent(a: Money, pct: number, mode: RoundingMode = 'half-up'): Money {
  return money(round((a.minor * pct) / 100, mode), a.currency);
}

/**
 * Extract the tax already baked into an inclusive-priced amount.
 * inclusiveTax(118.00, 18) => 18.00
 */
export function inclusiveTax(gross: Money, pct: number, mode: RoundingMode = 'half-up'): Money {
  if (pct === 0) return zero(gross.currency);
  return money(round((gross.minor * pct) / (100 + pct), mode), gross.currency);
}

export function isZero(a: Money): boolean {
  return a.minor === 0;
}

export function isNegative(a: Money): boolean {
  return a.minor < 0;
}

export function isPositive(a: Money): boolean {
  return a.minor > 0;
}

export function compare(a: Money, b: Money): number {
  assertSame(a, b);
  return a.minor === b.minor ? 0 : a.minor < b.minor ? -1 : 1;
}

export function gte(a: Money, b: Money): boolean {
  return compare(a, b) >= 0;
}

export function lte(a: Money, b: Money): boolean {
  return compare(a, b) <= 0;
}

export function min(a: Money, b: Money): Money {
  return compare(a, b) <= 0 ? a : b;
}

export function max(a: Money, b: Money): Money {
  return compare(a, b) >= 0 ? a : b;
}

export function roundHalfUp(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

function roundHalfEven(n: number): number {
  const floor = Math.floor(n);
  const diff = n - floor;
  if (Math.abs(diff - 0.5) > Number.EPSILON) return Math.round(n);
  return floor % 2 === 0 ? floor : floor + 1;
}

export function round(n: number, mode: RoundingMode = 'half-up'): number {
  switch (mode) {
    case 'down':
      return Math.trunc(n);
    case 'up':
      return n < 0 ? Math.floor(n) : Math.ceil(n);
    case 'half-even':
      return roundHalfEven(n);
    case 'half-up':
    default:
      return roundHalfUp(n);
  }
}

/**
 * Round a document total to the nearest whole major unit and report the
 * adjustment, used for the "rounding off" line on Indian invoices.
 */
export function roundToWholeUnit(a: Money): { rounded: Money; adjustment: Money } {
  const f = factorOf(a.currency);
  const rounded = money(roundHalfUp(a.minor / f) * f, a.currency);
  return { rounded, adjustment: subtract(rounded, a) };
}

/**
 * Split an amount into n parts without losing or inventing minor units.
 * The remainder is distributed one minor unit at a time from the first part.
 */
export function allocate(a: Money, weights: number[]): Money[] {
  const totalWeight = weights.reduce((x, y) => x + y, 0);
  if (totalWeight <= 0) return weights.map(() => zero(a.currency));
  const parts = weights.map((w) => Math.floor((a.minor * w) / totalWeight));
  let remainder = a.minor - parts.reduce((x, y) => x + y, 0);
  let i = 0;
  while (remainder > 0 && parts.length > 0) {
    parts[i % parts.length] += 1;
    remainder -= 1;
    i += 1;
  }
  return parts.map((p) => money(p, a.currency));
}
