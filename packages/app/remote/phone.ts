/** `+91 98765 43210` → `+919876543210`, the E.164 form the API stores. */
export function toE164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  // A bare ten-digit Indian mobile number.
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  return `+${digits}`;
}
