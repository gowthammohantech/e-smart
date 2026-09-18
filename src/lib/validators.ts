export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
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

/** Structural GSTIN check — the checksum digit is validated server-side. */
export function validGstin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return GSTIN_RE.test(value.trim().toUpperCase())
    ? undefined
    : 'GSTIN should look like 27AABCV1234F1Z5';
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
