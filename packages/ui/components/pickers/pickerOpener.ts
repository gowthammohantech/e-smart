import { useSyncExternalStore } from 'react';

/**
 * The picker field a list was just opened from, on a desktop browser: where it sits, so a short
 * list can drop down under it instead of opening as a dialog, and the element, so focus goes back
 * to it when the list closes. A screen wires a PickerField and its SelectSheet separately; this is
 * what links the two without the screen passing anything.
 */
export type PickerOpener = { x: number; y: number; width: number; height: number; element: HTMLElement | null };

let current: PickerOpener | null = null;
let claimed = false;
let expiry: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

/**
 * Called by a picker field as it is pressed, before it opens its list. A list that opens claims
 * it; one nobody claims soon after (the field went somewhere else) is dropped.
 */
export function notePickerOpener(opener: PickerOpener) {
  current = opener;
  claimed = false;
  clearTimeout(expiry);
  expiry = setTimeout(() => {
    if (!claimed) clearPickerOpener();
  }, 1000);
  notify();
}

/** The open list holds on to the field it came from until it closes. */
export function claimPickerOpener() {
  claimed = true;
}

/** Forgets the field; any sheet closing calls it, so a later list never hangs from an old field. */
export function clearPickerOpener() {
  clearTimeout(expiry);
  claimed = false;
  if (!current) return;
  current = null;
  notify();
}

/** The field the open list came from, if it came from one. */
export function usePickerOpener(): PickerOpener | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}
