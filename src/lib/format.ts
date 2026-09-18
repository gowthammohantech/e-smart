import { Money, toMajor, factorOf } from './money';
import { currencyMeta } from './currencies';

function groupWestern(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1234567 -> 12,34,567 */
function groupIndian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}

export function formatNumber(value: number, precision = 2, grouping: 'indian' | 'western' = 'western'): string {
  const neg = value < 0;
  const fixed = Math.abs(value).toFixed(precision);
  const [intPart, decPart] = fixed.split('.');
  const grouped = grouping === 'indian' ? groupIndian(intPart) : groupWestern(intPart);
  const body = decPart ? `${grouped}.${decPart}` : grouped;
  return neg ? `-${body}` : body;
}

export type MoneyFormatOptions = {
  /** Show the currency symbol (default true). */
  symbol?: boolean;
  /** Append the ISO code, e.g. "$1,200.00 USD". */
  showCode?: boolean;
  /** Drop the decimal part for compact display. */
  noDecimals?: boolean;
  /** Always show a leading +/-. */
  signed?: boolean;
};

export function formatMoney(m: Money, opts: MoneyFormatOptions = {}): string {
  const meta = currencyMeta(m.currency);
  const { symbol = true, showCode = false, noDecimals = false, signed = false } = opts;
  const value = toMajor(m);
  const precision = noDecimals ? 0 : meta.precision;
  const body = formatNumber(Math.abs(value), precision, meta.grouping);
  const sign = value < 0 ? '-' : signed && value > 0 ? '+' : '';
  const head = symbol ? `${sign}${meta.symbol}${body}` : `${sign}${body}`;
  return showCode ? `${head} ${m.currency}` : head;
}

/** 1,25,00,000 -> "1.25 Cr" for INR; 1,200,000 -> "1.2M" otherwise. */
export function formatCompactMoney(m: Money): string {
  const meta = currencyMeta(m.currency);
  const v = toMajor(m);
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (meta.grouping === 'indian') {
    if (a >= 1e7) return `${sign}${meta.symbol}${(a / 1e7).toFixed(2)} Cr`;
    if (a >= 1e5) return `${sign}${meta.symbol}${(a / 1e5).toFixed(2)} L`;
    if (a >= 1e3) return `${sign}${meta.symbol}${(a / 1e3).toFixed(1)}K`;
  } else {
    if (a >= 1e9) return `${sign}${meta.symbol}${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${sign}${meta.symbol}${(a / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${sign}${meta.symbol}${(a / 1e3).toFixed(1)}K`;
  }
  return formatMoney(m);
}

/** Convert user keyboard input into a clean numeric string for a currency. */
export function sanitizeAmountInput(raw: string, currency: string): string {
  const precision = Math.log10(factorOf(currency));
  let s = raw.replace(/[^0-9.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  }
  if (precision === 0) return s.split('.')[0];
  const [i, d] = s.split('.');
  return d === undefined ? i : `${i}.${d.slice(0, precision)}`;
}

export function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : String(Number(qty.toFixed(3)));
}

export function formatPercent(pct: number): string {
  return `${Number.isInteger(pct) ? pct : Number(pct.toFixed(2))}%`;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return `${n} ${n === 1 ? singular : plural ?? `${singular}s`}`;
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
