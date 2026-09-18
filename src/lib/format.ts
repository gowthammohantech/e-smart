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

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens}-${ones}` : tens;
}

/**
 * Amounts in words, on the Indian scale — a statutory line on a tax invoice,
 * and the reason it reads "one lakh twenty thousand" rather than "120 thousand".
 */
export function amountInWords(m: Money): string {
  const whole = Math.floor(Math.abs(m.minor) / 100);
  const paise = Math.abs(m.minor) % 100;

  const say = (n: number): string => {
    if (n === 0) return '';
    const parts: string[] = [];
    const crore = Math.floor(n / 10_000_000);
    const lakh = Math.floor((n % 10_000_000) / 100_000);
    const thousand = Math.floor((n % 100_000) / 1000);
    const hundred = Math.floor((n % 1000) / 100);
    const rest = n % 100;

    if (crore) parts.push(`${say(crore)} crore`);
    if (lakh) parts.push(`${twoDigits(lakh)} lakh`);
    if (thousand) parts.push(`${twoDigits(thousand)} thousand`);
    if (hundred) parts.push(`${ONES[hundred]} hundred`);
    if (rest) parts.push(`${parts.length ? 'and ' : ''}${twoDigits(rest)}`);
    return parts.join(' ');
  };

  const unit = m.currency === 'INR' ? 'rupees' : m.currency;
  const sub = m.currency === 'INR' ? 'paise' : 'cents';
  const head = whole === 0 ? 'zero' : say(whole);
  const tail = paise > 0 ? ` and ${twoDigits(paise)} ${sub}` : '';
  const sentence = `${head} ${unit}${tail} only`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
