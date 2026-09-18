import { P } from './palette.mjs';

/**
 * Placeholder illustrations in the spirit of Storyset's "Rafiki" style:
 * a soft background blob, flat fills and rounded outlines, one brand accent.
 *
 * Each scene is a function of `f` — a 0..1 loop phase — so the hero scenes can
 * be rendered as animation frames. Static scenes simply ignore it.
 *
 * Replace the generated files in assets/illustrations/ with real Storyset
 * downloads; nothing here ships to the app at runtime.
 */

const W = 400;
const H = 300;

/**
 * Storyset's own downloads are transparent with no backdrop shape, and a
 * single translucent fill cannot read well on both the dark and light card
 * surfaces — it goes navy on one and pale on the other. So the scenes carry no
 * background. The calls are kept so the compositions stay easy to read.
 */
const blob = () => '';

const ground = () => `
  <path d="M84 246h232" stroke="${P.lineSoft}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>`;

/** A simple standing figure, offset by (x, y). */
const person = (x, y, s = 1, accent = P.accent) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M0 62V34c0-11 8-20 19-20h10c11 0 19 9 19 20v28" fill="${accent}"/>
    <path d="M6 62h36l-4 40H10z" fill="${P.hair}" opacity="0.85"/>
    <circle cx="24" cy="6" r="13" fill="${P.skin}"/>
    <path d="M11 4c0-8 6-13 13-13s13 5 13 13c0-4-6-6-13-6s-13 2-13 6z" fill="${P.hair}"/>
    <path d="M0 36l-12 24" stroke="${accent}" stroke-width="9" stroke-linecap="round"/>
    <path d="M48 36l12 24" stroke="${accent}" stroke-width="9" stroke-linecap="round"/>
  </g>`;

const card = (x, y, w, h, r = 8) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${P.paper}" stroke="${P.paperEdge}" stroke-width="2"/>`;

const line = (x, y, w, c = P.lineSoft, sw = 5) =>
  `<path d="M${x} ${y}h${w}" stroke="${c}" stroke-width="${sw}" stroke-linecap="round"/>`;

/** Gentle vertical float, used by the animated hero scenes. */
const float = (f, amp = 6) => (Math.sin(f * Math.PI * 2) * amp).toFixed(2);

/* ------------------------------------------------------------------ */

export const SCENES = {
  /* ---- heroes (animated) ---- */

  welcome: (f) => `
    ${blob(0.14)}
    ${ground()}
    <g transform="translate(0 ${float(f, 5)})">
      ${card(196, 92, 118, 132, 10)}
      ${line(212, 118, 68, P.accent, 7)}
      ${line(212, 138, 86)}
      ${line(212, 156, 60)}
      <rect x="212" y="178" width="86" height="28" rx="8" fill="${P.accentSoft}"/>
      <path d="M232 192h46" stroke="${P.accent}" stroke-width="5" stroke-linecap="round"/>
    </g>
    ${person(96, 128, 1.15)}
    <g transform="translate(0 ${float(f + 0.35, 7)})">
      <circle cx="318" cy="76" r="17" fill="${P.good}" opacity="0.9"/>
      <path d="M311 76l5 5 10-10" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </g>`,

  'setup-complete': (f) => `
    ${blob(0.14)}
    ${ground()}
    <g transform="translate(0 ${float(f, 6)})">
      <circle cx="200" cy="130" r="58" fill="${P.good}" opacity="0.18"/>
      <circle cx="200" cy="130" r="42" fill="${P.good}"/>
      <path d="M182 130l13 13 25-27" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </g>
    ${person(96, 150, 0.9)}
    ${person(250, 150, 0.9, P.accentSoft)}
    <g opacity="${(0.45 + 0.45 * Math.sin(f * Math.PI * 2)).toFixed(2)}">
      <path d="M128 78l8 14M300 72l-9 14M214 56v16" stroke="${P.warn}" stroke-width="5" stroke-linecap="round"/>
    </g>`,

  'empty-dashboard': (f) => {
    const bars = [34, 58, 44, 76, 62];
    return `
    ${blob(0.12)}
    ${ground()}
    ${card(120, 70, 160, 152, 12)}
    ${bars
      .map((b, i) => {
        const g = b + Math.sin((f * Math.PI * 2) + i) * 5;
        return `<rect x="${138 + i * 26}" y="${196 - g}" width="16" height="${g.toFixed(1)}" rx="6"
                 fill="${i === 3 ? P.accent : P.accentSoft}"/>`;
      })
      .join('')}
    ${line(138, 92, 62, P.lineSoft)}
    ${line(138, 108, 40)}
    ${person(292, 148, 0.82)}`;
  },

  /* ---- full-size static scenes ---- */

  'not-found': () => `
    ${blob(0.1)}
    ${card(140, 72, 120, 152, 10)}
    ${line(158, 100, 66)}
    ${line(158, 120, 84)}
    ${line(158, 140, 48)}
    <circle cx="238" cy="196" r="38" fill="${P.paper}" stroke="${P.line}" stroke-width="5"/>
    <path d="M265 223l22 22" stroke="${P.line}" stroke-width="8" stroke-linecap="round"/>
    <path d="M226 184l24 24M250 184l-24 24" stroke="${P.bad}" stroke-width="5" stroke-linecap="round"/>`,

  'mail-sent': () => `
    ${blob(0.12)}
    <rect x="120" y="106" width="160" height="112" rx="10" fill="${P.paper}" stroke="${P.paperEdge}" stroke-width="2"/>
    <path d="M120 116l80 56 80-56" fill="none" stroke="${P.line}" stroke-width="5" stroke-linejoin="round"/>
    <circle cx="272" cy="102" r="24" fill="${P.good}"/>
    <path d="M262 102l7 7 14-15" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M78 130h34M64 156h48M88 182h24" stroke="${P.accentSoft}" stroke-width="5" stroke-linecap="round"/>`,

  'search-idle': () => `
    ${blob(0.1)}
    <circle cx="188" cy="140" r="58" fill="none" stroke="${P.accent}" stroke-width="9"/>
    <circle cx="188" cy="140" r="40" fill="${P.accentSoft}" opacity="0.28"/>
    <path d="M230 182l38 38" stroke="${P.accent}" stroke-width="12" stroke-linecap="round"/>
    ${line(150, 128, 52, P.accent)}
    ${line(150, 148, 34, P.accentSoft)}`,

  'search-empty': () => `
    ${blob(0.1)}
    <circle cx="188" cy="140" r="58" fill="none" stroke="${P.line}" stroke-width="9"/>
    <path d="M230 182l38 38" stroke="${P.line}" stroke-width="12" stroke-linecap="round"/>
    <path d="M170 122l36 36M206 122l-36 36" stroke="${P.bad}" stroke-width="7" stroke-linecap="round"/>`,

  'single-location': () => `
    ${blob(0.1)}
    ${ground()}
    <path d="M150 210V132l40-30 40 30v78z" fill="${P.paper}" stroke="${P.line}" stroke-width="5" stroke-linejoin="round"/>
    <rect x="172" y="164" width="36" height="46" rx="4" fill="${P.accentSoft}"/>
    <g opacity="0.45">
      <path d="M258 210v-58l32-24 32 24v58z" fill="none" stroke="${P.lineSoft}" stroke-width="5"
            stroke-linejoin="round" stroke-dasharray="10 9"/>
    </g>
    <path d="M290 172v26M277 185h26" stroke="${P.accent}" stroke-width="5" stroke-linecap="round"/>`,

  'no-documents': () => `
    ${blob(0.1)}
    ${card(150, 78, 100, 128, 9)}
    ${line(168, 106, 56)}
    ${line(168, 126, 64)}
    ${line(168, 146, 40)}
    <circle cx="256" cy="186" r="28" fill="${P.accent}"/>
    <path d="M256 174v24M244 186h24" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`,

  'no-contacts': () => `
    ${blob(0.1)}
    <circle cx="176" cy="122" r="30" fill="${P.accentSoft}"/>
    <path d="M132 208c0-26 20-44 44-44s44 18 44 44z" fill="${P.accentSoft}"/>
    <circle cx="252" cy="134" r="22" fill="${P.paper}" stroke="${P.line}" stroke-width="4"/>
    <path d="M218 206c0-20 15-34 34-34s34 14 34 34z" fill="${P.paper}" stroke="${P.line}" stroke-width="4"/>`,

  'no-items': () => `
    ${blob(0.1)}
    <path d="M200 96l72 38v72l-72 38-72-38v-72z" fill="${P.paper}" stroke="${P.line}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M128 134l72 38 72-38M200 172v72" fill="none" stroke="${P.line}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M164 115l72 38" stroke="${P.accent}" stroke-width="5" stroke-linecap="round"/>`,

  'no-payments': () => `
    ${blob(0.1)}
    <rect x="124" y="108" width="152" height="94" rx="10" fill="${P.paper}" stroke="${P.line}" stroke-width="5"/>
    <circle cx="200" cy="155" r="24" fill="${P.accentSoft}"/>
    <path d="M200 143v24M193 149h12M193 161h12" stroke="${P.accent}" stroke-width="4" stroke-linecap="round"/>
    <path d="M146 130h10M244 180h10" stroke="${P.lineSoft}" stroke-width="5" stroke-linecap="round"/>`,

  'all-settled': () => `
    ${blob(0.12)}
    <circle cx="200" cy="150" r="58" fill="${P.good}" opacity="0.18"/>
    <circle cx="200" cy="150" r="42" fill="${P.good}"/>
    <path d="M182 150l13 13 25-27" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,

  'no-notifications': () => `
    ${blob(0.1)}
    <path d="M200 84c-24 0-42 18-42 42v34l-16 22h116l-16-22v-34c0-24-18-42-42-42z"
          fill="${P.paper}" stroke="${P.line}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M184 182a16 16 0 0032 0" fill="none" stroke="${P.line}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="246" cy="98" r="16" fill="${P.good}"/>
    <path d="M239 98l5 5 9-10" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,

};

export const VIEWBOX = { W, H };
