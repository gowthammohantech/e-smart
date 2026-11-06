import type { Item } from '@esmart/core/types';

/**
 * An item made from inside a document (New item from its item picker), handed
 * back to the document it was opened from. The form is opened with `?from=document`; on save it leaves the record
 * here and goes back, and the document takes it when it is in front again.
 */
export const FROM_DOCUMENT = 'document';

type HandBack = { kind: 'item'; record: Item };

let pending: HandBack | null = null;

export function handBack(h: HandBack): void {
  pending = h;
}

/** What was handed back since the document was last in front, once. */
export function takeHandBack(): HandBack | null {
  const h = pending;
  pending = null;
  return h;
}
