import type { Money } from './money';
import { currencyMeta } from './currencies';

/**
 * The amount spelled out, as printed under the total on an invoice or a
 * receipt: "Rupees One Lakh Twenty Thousand and Fifty Paise Only".
 *
 * Always English. Like the GSTIN or the HSN code it is a value on a legal
 * document, read by officers and counterparties in other states, so it is not
 * translated; only its label is (see `bilingual` in `render/documentHtml.ts`).
 *
 * Rupees count in lakhs and crores, as every Indian invoice does; any other
 * currency counts in thousands, millions and billions.
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0–999 in words; '' for zero. */
function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(rest < 20 ? ONES[rest]! : [TENS[Math.floor(rest / 10)], ONES[rest % 10]].filter(Boolean).join(' '));
  return parts.join(' ');
}

/** A whole number in words, Indian (lakh, crore) or western (million, billion) scale. */
export function numberInWords(n: number, scale: 'indian' | 'western' = 'indian'): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`numberInWords: ${n}`);
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  if (scale === 'indian') {
    // Above a crore the crore count is itself read in lakhs and thousands:
    // 1,00,00,00,000 is "One Hundred Crore", 10,00,00,00,00,000 "One Lakh Crore".
    const crores = Math.floor(n / 1e7);
    let rest = n % 1e7;
    if (crores) parts.push(`${numberInWords(crores, 'indian')} Crore`);
    const lakhs = Math.floor(rest / 1e5);
    rest %= 1e5;
    if (lakhs) parts.push(`${belowThousand(lakhs)} Lakh`);
    const thousands = Math.floor(rest / 1e3);
    rest %= 1e3;
    if (thousands) parts.push(`${belowThousand(thousands)} Thousand`);
    if (rest) parts.push(belowThousand(rest));
  } else {
    const units = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
    let i = 0;
    let rest = n;
    while (rest > 0) {
      const chunk = rest % 1000;
      if (chunk) parts.unshift([belowThousand(chunk), units[i]].filter(Boolean).join(' '));
      rest = Math.floor(rest / 1000);
      i += 1;
    }
  }
  return parts.join(' ');
}

/** What the major and minor units are called on a document. Unknown currencies fall back to their code. */
const UNIT_NAMES: Record<string, { major: string; minor?: string }> = {
  INR: { major: 'Rupees', minor: 'Paise' },
  USD: { major: 'US Dollars', minor: 'Cents' },
  EUR: { major: 'Euros', minor: 'Cents' },
  GBP: { major: 'Pounds Sterling', minor: 'Pence' },
  AED: { major: 'UAE Dirhams', minor: 'Fils' },
  SGD: { major: 'Singapore Dollars', minor: 'Cents' },
  AUD: { major: 'Australian Dollars', minor: 'Cents' },
  CAD: { major: 'Canadian Dollars', minor: 'Cents' },
  JPY: { major: 'Japanese Yen' },
  SAR: { major: 'Saudi Riyals', minor: 'Halalas' },
};

export function amountInWords(m: Money): string {
  const meta = currencyMeta(m.currency);
  const names = UNIT_NAMES[m.currency] ?? { major: m.currency, minor: meta.precision ? 'Cents' : undefined };
  const scale = meta.grouping;
  const abs = Math.abs(Math.round(m.minor));
  const factor = 10 ** meta.precision;
  const major = Math.floor(abs / factor);
  const minor = abs % factor;

  const majorText = `${names.major} ${numberInWords(major, scale)}`;
  const minorText = minor && names.minor ? `${numberInWords(minor, scale)} ${names.minor}` : '';
  const body = minorText ? (major ? `${majorText} and ${minorText}` : minorText) : majorText;
  return `${m.minor < 0 ? 'Minus ' : ''}${body} Only`;
}
