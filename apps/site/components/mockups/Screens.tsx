/**
 * Real app screens, captured from apps/web against the seeded demo account by
 * scripts/capture-screens.mjs, in both themes. Each image is a 390×844 phone
 * screen at 2×; both theme variants are in the page and CSS shows the one
 * that matches, so a theme switch never waits on JS.
 */

export const SCREENS = ['dashboard', 'invoice', 'compliance', 'eway', 'receivables', 'inventory', 'report', 'lixi'] as const;
export type ScreenName = (typeof SCREENS)[number];

export const SCREEN_W = 390;
export const SCREEN_H = 844;

const ALT: Record<ScreenName, string> = {
  dashboard: 'Home dashboard: sales, collections, expenses and the six-month sales trend',
  invoice: 'Tax invoice with CGST and SGST totals and its signed e-invoice QR and IRN',
  compliance: 'GST compliance: e-invoices reported, needing attention and their IRNs',
  eway: 'E-way bill with its validity countdown and Part-B update',
  receivables: 'Receivables with five aging buckets and payment reminders',
  inventory: 'Stock value, low-stock count and item levels',
  report: 'Sales summary report by month',
  lixi: 'Lixi, the AI assistant, with suggested questions about the books',
};

/** Both theme captures of one screen, as a pair of <img>; `className` sizes them. */
export function ScreenImage({ name, file = name, alt = ALT[name as ScreenName] ?? '', className = '' }: { name: string; file?: string; alt?: string; className?: string }) {
  return (
    <>
      <img src={`/screens/light/${file}.webp`} alt={alt} className={`dark:hidden ${className}`} loading="lazy" decoding="async" />
      <img src={`/screens/dark/${file}.webp`} alt={alt} className={`hidden dark:block ${className}`} loading="lazy" decoding="async" />
    </>
  );
}

/** Signal, Wi-Fi and battery, as a phone draws them. Sized in em by the frame. */
export function StatusGlyphs() {
  return (
    <span className="flex items-center gap-[0.9em]" aria-hidden>
      <svg viewBox="0 0 18 12" className="h-[3.3em] w-auto" fill="currentColor">
        <rect x="0" y="8" width="3" height="4" rx="0.8" />
        <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
        <rect x="10" y="3" width="3" height="9" rx="0.8" />
        <rect x="15" y="0" width="3" height="12" rx="0.8" />
      </svg>
      <svg viewBox="0 0 16 12" className="h-[3.3em] w-auto" fill="currentColor">
        <path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.2-1.3A10.6 10.6 0 0 0 8 .4C5.2.4 2.5 1.5.5 3.4l1.2 1.3A9 9 0 0 1 8 2.2Zm0 3.6c1.4 0 2.7.5 3.7 1.4l1.2-1.3A7.2 7.2 0 0 0 8 4c-1.8 0-3.6.7-4.9 1.9l1.2 1.3c1-.9 2.3-1.4 3.7-1.4Zm0 3.5c.6 0 1.1.2 1.5.6L8 11.6 6.5 9.9c.4-.4.9-.6 1.5-.6Z" />
      </svg>
      <svg viewBox="0 0 27 13" className="h-[3.5em] w-auto">
        <rect x="0.5" y="0.5" width="23" height="12" rx="3.6" fill="none" stroke="currentColor" opacity="0.4" />
        <rect x="2.2" y="2.2" width="19.6" height="8.6" rx="2.2" fill="currentColor" />
        <path d="M25 4.3v4.4c.9-.3 1.5-1.2 1.5-2.2s-.6-1.9-1.5-2.2Z" fill="currentColor" opacity="0.45" />
      </svg>
    </span>
  );
}

/**
 * The status bar above the capture, in the app's own background colour. Sized
 * in the frame's em (1% of its width), centred on the Dynamic Island.
 */
function StatusBar() {
  return (
    <div className="flex h-[13.6em] items-center justify-between bg-[#F4F6FA] px-[6.5em] text-[#0E121A] dark:bg-[#0E121A] dark:text-white">
      <span className="text-[4.6em] leading-none font-semibold tracking-tight">9:41</span>
      <StatusGlyphs />
    </div>
  );
}

/** A deterministic QR-like grid: decorative, not scannable. */
export function FakeQr({ size = 72, seed = 7 }: { size?: number; seed?: number }) {
  const n = 21;
  const cells: [number, number][] = [];
  let s = seed;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      s = (s * 9301 + 49297) % 233280;
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (!finder && s / 233280 > 0.52) cells.push([x, y]);
    }
  }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} fill="#000" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="#000" />
    </g>
  );
  return (
    <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} width={size} height={size} className="rounded-[4px] bg-white" aria-hidden>
      {cells.map(([x, y]) => (
        <rect key={`${x}.${y}`} x={x} y={y} width={1} height={1} fill="#000" />
      ))}
      {finder(0, 0)}
      {finder(14, 0)}
      {finder(0, 14)}
    </svg>
  );
}

/** Side buttons, as fractions of the frame's height: [side, top, length]. */
const BUTTONS: [side: 'left' | 'right', top: number, length: number][] = [
  ['left', 0.17, 0.045],
  ['left', 0.25, 0.075],
  ['left', 0.345, 0.075],
  ['right', 0.27, 0.11],
];

/**
 * A real-looking phone around one screen, `width` px wide: a titanium rim
 * with side buttons, a black glass bezel, the Dynamic Island, and a glare
 * across the glass. Everything is sized in em off the width, so it scales.
 */
export function PhoneFrame({ screen, width = 240, className = '' }: { screen: ScreenName; width?: number; className?: string }) {
  return (
    <div className={`relative ${className}`} style={{ width, fontSize: width / 100 }}>
      {BUTTONS.map(([side, top, length]) => (
        <span
          key={`${side}-${top}`}
          aria-hidden
          className="absolute w-[1.1em] rounded-[0.6em]"
          style={{
            [side]: '-0.8em',
            top: `${top * 100}%`,
            height: `${length * 100}%`,
            background: 'linear-gradient(90deg, var(--frame-b), var(--frame-a) 50%, var(--frame-b))',
          }}
        />
      ))}
      <div
        className="rounded-[17em] p-[1.4em]"
        style={{
          background: 'linear-gradient(135deg, var(--frame-a), var(--frame-b) 28%, var(--frame-c) 52%, var(--frame-b) 78%, var(--frame-a))',
          boxShadow:
            'inset 0 0 0 0.25em rgba(255,255,255,0.18), 0 0.5em 1em -0.3em rgba(0,0,0,0.35), 0 3em 6em -2.5em rgba(0,0,0,0.55)',
        }}
      >
        <div className="rounded-[15.6em] bg-[#050506] p-[2.6em]">
          <div className="relative overflow-hidden rounded-[13em]">
            <StatusBar />
            <div style={{ aspectRatio: `${SCREEN_W} / ${SCREEN_H}` }}>
              <ScreenImage name={screen} className="size-full object-cover object-top" />
            </div>
            {/* Dynamic Island, with the front camera lens. */}
            <span className="absolute top-[2.6em] left-1/2 flex h-[8em] w-[25em] -translate-x-1/2 items-center justify-end rounded-full bg-black pr-[2.4em]">
              <span className="size-[3em] rounded-full bg-[radial-gradient(circle_at_35%_35%,#3B4A6B,#0B0D14_60%)]" />
            </span>
            {/* Glass: a diagonal glare and a faint inner edge. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[13em]"
              style={{
                background: 'linear-gradient(115deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 22%, transparent 40%)',
                boxShadow: 'inset 0 0 0 0.2em rgba(255,255,255,0.05)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
