'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { lixiTour } from '@/content/tour';
import { usePrefersReducedMotion } from '@/lib/hooks';

/**
 * Lixi walks the page with you. On wide screens it stands in a page margin
 * beside each section, says one line about it, and hops across to the other
 * margin as the next section arrives. On narrow or touch screens it sits in
 * the corner and changes its line as the sections pass.
 */

const CONTENT_W = 1152;
/** Below this margin (CSS px each side of the content) there's no room to travel. */
const MIN_MARGIN = 96;
const ORB = 72;
const HIDE_KEY = 'esmart-site-lixi-hidden';

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function subscribeLayout(onChange: () => void) {
  const fine = window.matchMedia('(pointer: fine)');
  window.addEventListener('resize', onChange);
  fine.addEventListener('change', onChange);
  return () => {
    window.removeEventListener('resize', onChange);
    fine.removeEventListener('change', onChange);
  };
}

/** Whether there's margin enough, and a mouse, for Lixi to travel. */
function canTravel() {
  return (window.innerWidth - CONTENT_W) / 2 >= MIN_MARGIN && window.matchMedia('(pointer: fine)').matches;
}

/** "Hide Lixi" for this browser session, as a tiny store so the server render stays shown. */
const hideListeners = new Set<() => void>();
let hidden = false;

function readHidden() {
  try {
    return sessionStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

function hideLixi() {
  try {
    sessionStorage.setItem(HIDE_KEY, '1');
  } catch {
    // Storage blocked: hidden for this page view only.
  }
  hidden = true;
  hideListeners.forEach((fn) => fn());
}


function subscribeHidden(onChange: () => void) {
  hidden ||= readHidden();
  hideListeners.add(onChange);
  return () => hideListeners.delete(onChange);
}

/** How long Lixi's line stays up after it arrives somewhere, before folding away. */
const TALK_MS = 4000;

export function LixiGuide() {
  const reduced = usePrefersReducedMotion();
  const travel = useSyncExternalStore(subscribeLayout, canTravel, () => false);
  const isHidden = useSyncExternalStore(subscribeHidden, () => hidden, () => false);
  const [stop, setStop] = useState(0);
  const [talking, setTalking] = useState(true);
  const orb = useRef<HTMLDivElement>(null);
  /** Hovering Lixi, or tapping it, brings the current line back. */
  const hover = useRef(false);
  const pokedAt = useRef(-Infinity);

  useEffect(() => {
    if (isHidden) return;
    let stopNow = 0;
    let spokenAt = -1;
    let talkUntil = 0;
    let talkNow = true;
    const say = (next: boolean) => {
      if (next !== talkNow) setTalking((talkNow = next));
    };
    let frame = 0;
    let last = performance.now();
    const pos = { x: -1, y: -1 };
    let anchors: number[] = [];

    // Each stop sits at its section's centre, in page coordinates.
    const measure = () => {
      anchors = lixiTour.map((s) => {
        const el = document.getElementById(s.id);
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        return r.top + window.scrollY + r.height / 2;
      });
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(document.body);

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const vh = window.innerHeight;
      const centre = window.scrollY + vh / 2;

      // Which two stops the screen is between, and how far along.
      let i = 0;
      while (i < anchors.length - 2 && centre >= anchors[i + 1]) i++;
      const raw = (centre - anchors[i]) / Math.max(1, anchors[i + 1] - anchors[i]);
      // Rest at a stop for most of the way; hop across the middle third.
      const t = smoothstep(0.35, 0.65, Math.min(1, Math.max(0, raw)));
      const at = t < 0.5 ? i : i + 1;
      if (at !== stopNow) setStop((stopNow = at));
      // Lixi says its line once it has landed (never mid-hop), then folds the
      // bubble away so it doesn't sit over the page.
      const landed = !travel || t < 0.04 || t > 0.96;
      if (landed && spokenAt !== at) {
        spokenAt = at;
        talkUntil = now + TALK_MS;
      }
      say(landed && (hover.current || now < talkUntil || now < pokedAt.current + TALK_MS));

      const el = orb.current;
      if (!el || !travel) return;
      const margin = (window.innerWidth - CONTENT_W) / 2;
      const xFor = (side: 'left' | 'right') => (side === 'left' ? margin / 2 : window.innerWidth - margin / 2);
      const from = xFor(lixiTour[i].side);
      const to = xFor(lixiTour[i + 1].side);
      const e = reduced ? Math.round(t) : ease(t);
      const tx = from + (to - from) * e;
      // A hop: rise while crossing, land back on the line.
      const ty = vh * 0.62 - (reduced ? 0 : Math.sin(Math.PI * t) * vh * 0.14);

      // Trail the target a little, as if following the reader.
      const k = reduced || pos.x < 0 ? 1 : 1 - Math.exp(-dt * 8);
      const dx = tx - pos.x;
      pos.x = pos.x < 0 ? tx : pos.x + dx * k;
      pos.y = pos.y < 0 ? ty : pos.y + (ty - pos.y) * k;
      const lean = reduced ? 0 : Math.max(-18, Math.min(18, dx * 0.06));
      const stretch = reduced ? 1 : 1 + Math.min(0.12, Math.abs(dx) / 2500);
      el.style.transform = `translate3d(${pos.x - ORB / 2}px, ${pos.y - ORB / 2}px, 0) rotate(${lean}deg) scale(${stretch}, ${2 - stretch})`;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
    };
  }, [isHidden, travel, reduced]);

  if (isHidden) return null;

  const current = lixiTour[stop];
  // On the move the bubble opens towards the content; docked, it opens upwards.
  const bubbleSide = travel ? (current.side === 'left' ? 'left-[calc(100%+10px)]' : 'right-[calc(100%+10px)]') : 'right-0 bottom-[calc(100%+10px)]';

  return (
    <div
      ref={orb}
      data-lixi-guide
      className={`pointer-events-none fixed z-40 ${travel ? 'top-0 left-0 will-change-transform' : 'right-4 bottom-4'}`}
      style={{ width: travel ? ORB : 56, height: travel ? ORB : 56 }}
    >
      <img
        src={reduced ? '/brand/lixi-orb.png' : '/brand/lixi-orb-animated.webp'}
        alt=""
        onPointerEnter={() => (hover.current = true)}
        onPointerLeave={() => (hover.current = false)}
        onClick={() => (pokedAt.current = performance.now())}
        className="pointer-events-auto size-full cursor-pointer drop-shadow-[0_10px_24px_rgba(0,122,255,0.45)]"
      />
      {/* The wrapper places the bubble; the inner motion layer owns the transform. */}
      <div className={`absolute ${travel ? 'top-1/2 -translate-y-1/2' : ''} ${bubbleSide}`} aria-hidden>
        <AnimatePresence mode="wait">
          {talking ? (
            <motion.div
              key={current.id}
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="w-max max-w-[220px] rounded-card border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-snug text-fg shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]"
            >
              <span className="mb-0.5 block text-[11px] font-semibold text-primary">Lixi</span>
              {current.line}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <button
        type="button"
        onClick={hideLixi}
        aria-label="Hide Lixi"
        className="pointer-events-auto absolute -top-1 -right-1 grid size-5 place-items-center rounded-full border border-line bg-surface text-muted hover:text-fg"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
