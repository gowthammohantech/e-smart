import { useState } from 'react';

/**
 * Whether a form differs from how it opened, so Save can wait until there is something to save.
 *
 * `values` is every field the form edits, in one list; it is compared by value, so putting a field
 * back to what it was makes the form unchanged again. The starting point is taken from the first
 * render of each `key` (the record being edited, `null` while the form is closed), by which time
 * the form's state has been filled in. Pass `rebase` (any value that changes when the record
 * behind the form was reloaded or saved) to start counting again from the fields as they are then.
 */
export function useDirty(values: readonly unknown[], key: unknown = null, rebase: unknown = null): boolean {
  const snapshot = JSON.stringify(values, (_k, v) => (v === undefined ? null : v));
  const [start, setStart] = useState({ key, rebase, snapshot });
  // A new record (or a reload): the form's state has just been filled in, so this is how it opened.
  // Set during render, React's way of keeping something from an earlier render; it renders again at once.
  if (start.key !== key || start.rebase !== rebase) {
    setStart({ key, rebase, snapshot });
    return false;
  }
  return snapshot !== start.snapshot;
}

/** A value as text with its keys in order and its empty fields left out, so two copies of the same settings compare equal. */
export const canonicalJson = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x)
            .filter(([, y]) => y !== undefined && y !== null && y !== '')
            .sort(([a], [b]) => (a < b ? -1 : 1)),
        )
      : x,
  );
