import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Errors } from '@esmart/core/lib/validators';

const same = (a: unknown, b: unknown) => Object.is(a, b) || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));

/**
 * A form's errors from its last save (the checks on Save, or what the server said), each shown
 * only until its field is changed: fix the field and its message goes, without saving again.
 * Used as `useState` is: `const [errors, setErrors] = useSavedErrors({ name, email })`, naming each
 * field by its error key. An error on a key with no field here (the whole form, say) stays until
 * the next set.
 */
export function useSavedErrors<K extends string>(values: Partial<Record<K, unknown>>): [Errors<K>, Dispatch<SetStateAction<Errors<K>>>] {
  const [saved, setSaved] = useState<{ errors: Errors<K>; at: Partial<Record<K, unknown>> }>({ errors: {}, at: {} });
  // The fields as last shown, for the setter (called from a handler, after that render).
  const latest = useRef(values);
  useEffect(() => {
    latest.current = values;
  });

  const set = useCallback<Dispatch<SetStateAction<Errors<K>>>>(
    (next) =>
      setSaved((s) => {
        // A new set of errors (a save) is about the fields as they are now; an update to the old ones
        // (one cleared, say) leaves the others as they were set.
        const fresh = typeof next !== 'function';
        const errors = fresh ? next : next(s.errors);
        const at: Partial<Record<K, unknown>> = fresh ? {} : { ...s.at };
        for (const k of Object.keys(errors) as K[]) if (fresh || errors[k] !== s.errors[k]) at[k] = latest.current[k];
        return { errors, at };
      }),
    [],
  );

  const shown: Errors<K> = {};
  for (const k of Object.keys(saved.errors) as K[]) {
    const message = saved.errors[k];
    if (message && (!(k in values) || same(values[k], saved.at[k]))) shown[k] = message;
  }
  return [shown, set];
}
