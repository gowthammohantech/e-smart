import i18n from '@esmart/i18n';

/**
 * Country calling codes the phone field knows. Today the field shows India's
 * code and it can't be changed; a country picker can list these instead.
 * `digits` is the length of a national number there, when it is fixed.
 */
export type DialCode = { code: string; country: string; digits?: number };

export const DIAL_CODES: DialCode[] = [{ code: '+91', country: 'IN', digits: 10 }];

export const DEFAULT_DIAL_CODE = '+91';

/** The longest national number any country uses (E.164 caps the whole at 15). */
const MAX_NATIONAL_DIGITS = 14;
const MIN_NATIONAL_DIGITS = 4;

export function dialCodeInfo(code: string): DialCode | undefined {
  return DIAL_CODES.find((d) => d.code === code);
}

/** How many digits the number after `code` may take. */
export function maxNationalDigits(code: string): number {
  return dialCodeInfo(code)?.digits ?? MAX_NATIONAL_DIGITS;
}

/** As typed: always a leading "+", then up to four digits. */
export function sanitizeDialCode(raw: string): string {
  return `+${raw.replace(/\D/g, '').slice(0, 4)}`;
}

/** As typed: digits only, no longer than `code` allows. */
export function sanitizePhoneNumber(raw: string, code: string): string {
  return raw.replace(/\D/g, '').slice(0, maxNationalDigits(code));
}

/** Blank is fine (the field is optional); otherwise the code and the length must fit. */
export function validPhoneParts(code: string, number: string): string | undefined {
  if (!number) return undefined;
  if (!/^\+\d{1,4}$/.test(code)) return i18n.t('errors:validation.invalidDialCode');
  const fixed = dialCodeInfo(code)?.digits;
  if (fixed) return number.length === fixed ? undefined : i18n.t('errors:validation.phoneDigits', { count: fixed });
  return number.length >= MIN_NATIONAL_DIGITS && number.length <= MAX_NATIONAL_DIGITS
    ? undefined
    : i18n.t('errors:validation.invalidPhone');
}

/**
 * A saved phone back into its code and number: `+91 98765 43210`,
 * `+971 50 442 8890`, or a bare `9876543210` (taken as India's).
 */
export function splitPhone(stored: string | undefined): { code: string; number: string } {
  const raw = (stored ?? '').trim();
  if (!raw) return { code: DEFAULT_DIAL_CODE, number: '' };
  if (raw.startsWith('+')) {
    const known = DIAL_CODES.find((d) => raw.replace(/\s/g, '').startsWith(d.code));
    // Without a known code, the code is what comes before the first space.
    const code = known?.code ?? sanitizeDialCode(raw.split(/\s/)[0]);
    const rest = raw.replace(/\s/g, '').slice(code.length);
    return { code, number: rest.replace(/\D/g, '') };
  }
  // A trunk 0 before a national number (`022 2771 4410`) isn't dialled after a code.
  const digits = raw.replace(/\D/g, '');
  return { code: DEFAULT_DIAL_CODE, number: digits.length > 10 && digits.startsWith('0') ? digits.slice(1) : digits };
}

/** `+91`, `9876543210` → `+91 9876543210`; blank when there is no number. */
export function joinPhone(code: string, number: string): string {
  return number ? `${code} ${number}` : '';
}
