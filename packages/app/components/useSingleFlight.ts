import { useCallback, useRef, useState } from 'react';

/**
 * Runs one action at a time from a screen. A tap while an action is running
 * does nothing (resolves with undefined): the lock is a ref, so it holds even
 * for a second tap that lands before the re-render that would disable the
 * button. For a row in a list or a sheet, which has no `loading` of its own.
 *
 * `hold: true` keeps the lock after the action succeeds, for one that leaves
 * the screen when it is done; `release` lets it go.
 */
export function useSingleFlight() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T>(action: () => Promise<T> | T, opts?: { hold?: boolean }): Promise<T | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setBusy(true);
    let keep = false;
    try {
      const out = await action();
      keep = !!opts?.hold && out !== undefined && out !== null && (out as unknown) !== false;
      return out;
    } finally {
      if (!keep) {
        lock.current = false;
        setBusy(false);
      }
    }
  }, []);
  const release = useCallback(() => {
    lock.current = false;
    setBusy(false);
  }, []);
  return { run, busy, release };
}
