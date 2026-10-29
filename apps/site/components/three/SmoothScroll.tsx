'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';

import { usePrefersReducedMotion } from '@/lib/hooks';
import { motionState, readScroll } from '@/lib/scroll';

/**
 * Drives page scroll with Lenis (eased wheel, smooth anchor jumps) and keeps
 * motionState current for the three.js scenes. With reduced motion it leaves
 * the browser's own scrolling alone and only reads it.
 */
export function SmoothScroll() {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      motionState.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
      motionState.pointerY = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });
    readScroll();

    if (reduced) {
      window.addEventListener('scroll', readScroll, { passive: true });
      return () => {
        window.removeEventListener('pointermove', onPointer);
        window.removeEventListener('scroll', readScroll);
      };
    }

    const lenis = new Lenis({ autoRaf: true, anchors: { offset: -80 }, lerp: 0.12 });
    lenis.on('scroll', readScroll);
    return () => {
      window.removeEventListener('pointermove', onPointer);
      lenis.destroy();
    };
  }, [reduced]);

  return null;
}
