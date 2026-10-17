import { useCallback, useState } from 'react';

/**
 * Forward-only cursors with a back stack. Reset it whenever the filters
 * change by keying it on them.
 */
export function useCursorPager() {
  const [stack, setStack] = useState<string[]>([]);
  const cursor = stack.at(-1);
  const next = useCallback((c: string) => setStack((s) => [...s, c]), []);
  const prev = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const reset = useCallback(() => setStack([]), []);
  return { cursor, page: stack.length + 1, next, prev, reset, hasPrev: stack.length > 0 };
}
