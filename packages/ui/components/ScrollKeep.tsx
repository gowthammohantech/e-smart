import { createContext, useContext, useEffect, useRef, type MutableRefObject } from 'react';

/**
 * Lets a screen's scroll view hand its position to the pickers inside it. A
 * picker opens a sheet over the form; once the sheet closes the form has to be
 * where the person left it, not wherever focus returning to the field, or a
 * re-render, put it.
 */
export type ScrollKeep = {
  /** Latest offset of the scroll view. */
  y: MutableRefObject<number>;
  scrollTo: (y: number) => void;
};

export const ScrollKeepContext = createContext<ScrollKeep | null>(null);

/** Call from a sheet: remembers the offset when it opens and restores it when it closes. */
export function useKeepScrollWhileOpen(visible: boolean) {
  const keep = useContext(ScrollKeepContext);
  const openedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!keep) return;
    if (visible) {
      openedAt.current = keep.y.current;
      return;
    }
    const y = openedAt.current;
    if (y === null) return;
    openedAt.current = null;
    // Focus returning to the field and the sheet unmounting both move the page
    // a beat after this runs, so put it back a few times.
    const timers = [0, 60, 250].map((ms) => setTimeout(() => keep.scrollTo(y), ms));
    return () => timers.forEach(clearTimeout);
  }, [visible, keep]);
}
