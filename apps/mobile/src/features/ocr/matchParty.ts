import { Party } from '@/types';
import { normalizeGstin } from '@/domain/gstin';

/** Find the contact a scanned bill is from: by GSTIN first, then by name. */
export function matchParty(parties: Party[], by: { gstin?: string; name?: string }): string | undefined {
  if (by.gstin) {
    const g = normalizeGstin(by.gstin);
    const hit = parties.find((p) => p.taxId && normalizeGstin(p.taxId) === g);
    if (hit) return hit.id;
  }
  const name = by.name?.trim().toLowerCase();
  if (!name) return undefined;
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((w) => w.length > 2);
  const wanted = words(name);
  return parties.find((p) => {
    const have = words(p.name);
    return p.name.toLowerCase() === name || (wanted.length > 0 && wanted.slice(0, 2).every((w) => have.includes(w)));
  })?.id;
}

/** A scanned date the forms can take (the review screen allows free text). */
export function isoOrUndefined(value: string | undefined): string | undefined {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}
