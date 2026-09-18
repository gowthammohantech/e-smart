import { isValidGstin } from '@/domain/gst/gstin';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^[+]?[0-9\s-]{7,16}$/;

export function required(value: string | undefined | null, label: string): string | undefined {
  return value && value.trim().length > 0 ? undefined : `${label} is required`;
}

export function validEmail(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return EMAIL_RE.test(value.trim()) ? undefined : 'Enter a valid email address';
}

export function validPhone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return PHONE_RE.test(value.trim()) ? undefined : 'Enter a valid phone number';
}

/** Shape and check digit. A typo in a GSTIN is caught here, not at the IRP. */
export function validGstin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return isValidGstin(value) ? undefined : 'That GSTIN is not valid — check the digits';
}

export function positiveNumber(value: string | number | undefined, label: string): string | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return `${label} must be a number`;
  return n > 0 ? undefined : `${label} must be greater than zero`;
}

export function minLength(value: string | undefined, len: number, label: string): string | undefined {
  if (!value || value.length < len) return `${label} must be at least ${len} characters`;
  return undefined;
}

export type Errors<T extends string> = Partial<Record<T, string>>;

export function firstError<T extends string>(errors: Errors<T>): string | undefined {
  return Object.values(errors).find((e): e is string => typeof e === 'string' && e.length > 0);
}

export function hasErrors<T extends string>(errors: Errors<T>): boolean {
  return Object.values(errors).some((e) => typeof e === 'string' && e.length > 0);
}
