import { schema } from '@esmart/db';
import { invalid } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';

/** HSN codes are 4, 6 or 8 digits; SAC codes are 6 digits starting with 99. */
export const HSN_RE = /^(\d{4}|\d{6}|\d{8})$/;

export function isValidHsn(code: string): boolean {
  return HSN_RE.test(code);
}

/**
 * Makes sure `code` is in the HSN/SAC master before a row points at it.
 * `items.hsn_code` and `tax_categories.hsn_code` are foreign keys to
 * `hsn_codes`, which holds a starter list, and people may type any valid
 * code. An unknown one is added with a placeholder description. Throws 422
 * (on `field`) for a malformed code. Returns the normalised code.
 */
export async function ensureHsn(tx: DbOrTx, code: string, field = 'hsnCode'): Promise<string> {
  const c = code.replace(/\s/g, '');
  if (!isValidHsn(c)) throw invalid(field, 'An HSN or SAC code has 4, 6 or 8 digits');
  await tx
    .insert(schema.hsnCodes)
    .values({ code: c, description: 'Added from catalog', isService: c.startsWith('99') })
    .onConflictDoNothing();
  return c;
}
