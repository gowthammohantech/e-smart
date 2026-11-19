import { invalid } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';

/** HSN codes are 4, 6 or 8 digits; SAC codes are 6 digits starting with 99. */
export const HSN_RE = /^(\d{4}|\d{6}|\d{8})$/;

export function isValidHsn(code: string): boolean {
  return HSN_RE.test(code);
}

/**
 * Checks an HSN/SAC code before a row keeps it. Any valid code is kept as it is: an item or tax rate
 * isn't tied to the shared hsn_codes list (that is only what search offers, migration 0079), and
 * nothing is added to it, so one business's codes never show in another's search. Throws 422
 * (on `field`) for a malformed code. Returns the normalised code.
 */
export async function ensureHsn(_tx: DbOrTx, code: string, field = 'hsnCode'): Promise<string> {
  const c = code.replace(/\s/g, '');
  if (!isValidHsn(c)) throw invalid(field, 'An HSN or SAC code has 4, 6 or 8 digits');
  return c;
}
