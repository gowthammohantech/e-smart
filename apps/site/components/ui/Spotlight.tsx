'use client';

import { useEffect } from 'react';

/**
 * Feeds the cursor position to whichever glass card it's over, as --mx/--my,
 * for the card's spotlight and lit edge (the card-glass utility). One listener
 * for the whole page; nothing on touch screens or with reduced motion.
 */
export function Spotlight() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const onMove = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.<HTMLElement>('.card-glass');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - r.left}px`);
      card.style.setProperty('--my', `${event.clientY - r.top}px`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return null;
}
