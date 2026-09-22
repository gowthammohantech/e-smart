import { isValidGstin, normalizeGstin } from '@/domain/gstin';
import i18n from '@/i18n';

/**
 * Messages are resolved when validation runs. `field` is passed in already
 * translated by the caller, because the same validator serves fields whose
 * names live in different namespaces.
 */

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^[+]?[0-9\s-]{7,16}$/;

export function required(value: string | undefined | null, label: string): string | undefined {
  return value && value.trim().length > 0 ? undefined : i18n.t('errors:validation.required', { field: label });
}

export function validEmail(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return EMAIL_RE.test(value.trim()) ? undefined : i18n.t('errors:validation.invalidEmail');
}

export function validPhone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return PHONE_RE.test(value.trim()) ? undefined : i18n.t('errors:validation.invalidPhone');
}

/** Shape, state code and check digit — a typo is caught here, not at the portal. */
export function validGstin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!GSTIN_RE.test(normalizeGstin(value))) return i18n.t('errors:validation.gstinShape');
  return isValidGstin(value) ? undefined : i18n.t('errors:validation.gstinCheckDigit');
}

export const HSN_RE = /^\d{4}(\d{2})?(\d{2})?$/;

/**
 * HSN/SAC: 4, 6 or 8 digits. Mandatory only for a GST-registered business —
 * the caller decides `required` from the company's registration.
 */
export function validHsn(value: string | undefined, opts: { required: boolean }): string | undefined {
  const v = (value ?? '').trim();
  if (!v) return opts.required ? i18n.t('errors:validation.hsnRequired') : undefined;
  return HSN_RE.test(v) ? undefined : i18n.t('errors:validation.hsnShape');
}

/** Is HSN/SAC mandatory on items for this registration? */
export function hsnMandatory(reg: { regime: string; registered: boolean } | undefined): boolean {
  return !!reg && reg.regime === 'GST' && reg.registered;
}

export function positiveNumber(value: string | number | undefined, label: string): string | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return i18n.t('errors:validation.mustBeNumber', { field: label });
  return n > 0 ? undefined : i18n.t('errors:validation.mustBePositive', { field: label });
}

export function minLength(value: string | undefined, len: number, label: string): string | undefined {
  if (!value || value.length < len) return i18n.t('errors:validation.minLength', { field: label, count: len });
  return undefined;
}

/**
 * Clean a document-number prefix as it is typed. Letters, digits, "-" and "/"
 * are allowed ("INV/A"); it may not start with a separator, and doubled
 * slashes collapse, since the number itself is joined with "/".
 */
export function sanitizePrefix(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9/-]/g, '')
    .replace(/\/{2,}/g, '/')
    .replace(/^[/-]+/, '');
}

/** The e-invoice portal caps the document number at 16 characters. */
export const E_INVOICE_DOC_NUMBER_MAX = 16;

export type Errors<T extends string> = Partial<Record<T, string>>;

export function firstError<T extends string>(errors: Errors<T>): string | undefined {
  return Object.values(errors).find((e): e is string => typeof e === 'string' && e.length > 0);
}

export function hasErrors<T extends string>(errors: Errors<T>): boolean {
  return Object.values(errors).some((e) => typeof e === 'string' && e.length > 0);
}
