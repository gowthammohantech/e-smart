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

export function positiveNumber(value: string | number | undefined, label: string): string | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return i18n.t('errors:validation.mustBeNumber', { field: label });
  return n > 0 ? undefined : i18n.t('errors:validation.mustBePositive', { field: label });
}

export function minLength(value: string | undefined, len: number, label: string): string | undefined {
  if (!value || value.length < len) return i18n.t('errors:validation.minLength', { field: label, count: len });
  return undefined;
}

export type Errors<T extends string> = Partial<Record<T, string>>;

export function firstError<T extends string>(errors: Errors<T>): string | undefined {
  return Object.values(errors).find((e): e is string => typeof e === 'string' && e.length > 0);
}

export function hasErrors<T extends string>(errors: Errors<T>): boolean {
  return Object.values(errors).some((e) => typeof e === 'string' && e.length > 0);
}
