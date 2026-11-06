/**
 * Scroll and pointer state shared with the three.js scenes. It is a plain
 * mutable object, written by the scroll driver and read inside useFrame, so
 * a scroll never re-renders React.
 */
export const motionState = {
  /** Page scroll in px. */
  y: 0,
  /** 0 at the top of the page, 1 at the bottom. */
  progress: 0,
  /** Pointer position, -1..1 on both axes, centre is 0. */
  pointerX: 0,
  pointerY: 0,
};

export function readScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  motionState.y = window.scrollY;
  motionState.progress = max > 0 ? window.scrollY / max : 0;
}

/**
 * How far an element has travelled through the viewport: 0 when its top
 * reaches the bottom of the screen, 1 when its bottom leaves the top.
 */
export function progressOf(el: Element | null): number {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const span = rect.height + window.innerHeight;
  return Math.min(1, Math.max(0, (window.innerHeight - rect.top) / span));
}
