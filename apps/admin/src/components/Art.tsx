import type { ReactNode } from 'react';

/**
 * Small inline-SVG illustrations, drawn to match the apps' set in
 * packages/ui/illustrations. Colours come from the theme's CSS variables, so
 * they follow light and dark; motion is CSS (`.art .float`, `.twinkle`, …) and
 * stops under prefers-reduced-motion. Decorative: the text beside each carries
 * the meaning.
 */
export type ArtName = 'empty' | 'search-empty' | 'not-found' | 'error' | 'secure' | 'success' | 'loading';

const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;

function Backdrop({ tone = 'var(--primary)' }: { tone?: string }) {
  return (
    <g>
      <ellipse className="blob" cx="200" cy="168" rx="150" ry="104" fill={tone} />
      <circle className="blob" cx="318" cy="88" r="34" fill="var(--art-cyan)" />
      <circle className="blob" cx="84" cy="110" r="24" fill="var(--art-yellow)" />
    </g>
  );
}

function Sparkles({ at }: { at: [number, number, number][] }) {
  return (
    <>
      {at.map(([x, y, r], i) => (
        <path key={i} className={`twinkle d${i % 3}`} d={star(x, y, r)} fill="var(--art-yellow)" />
      ))}
    </>
  );
}

const paper = { fill: 'var(--card)', stroke: 'var(--line-strong)', strokeWidth: 2.5 };
const ink = 'var(--muted)';

function Line({ x, y, w, color = 'var(--art-faint)', width = 5 }: { x: number; y: number; w: number; color?: string; width?: number }) {
  return <path d={`M${x} ${y}h${w}`} stroke={color} strokeWidth={width} strokeLinecap="round" />;
}

function Check({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="var(--good)" />
      <path
        d={`M${cx - r * 0.43} ${cy}l${r * 0.31} ${r * 0.31} ${r * 0.6} ${-r * 0.64}`}
        stroke="#fff"
        strokeWidth={Math.max(3, r * 0.16)}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </g>
  );
}

const SCENES: Record<ArtName, () => ReactNode> = {
  empty: () => (
    <>
      <Backdrop />
      <rect x="130" y="92" width="100" height="130" rx="9" fill="var(--card2)" stroke="var(--line-strong)" strokeWidth="2" transform="rotate(-8 180 157)" />
      <g className="float">
        <rect x="150" y="74" width="100" height="130" rx="9" {...paper} />
        <Line x={168} y={100} w={40} color="var(--primary)" width={6} />
        <Line x={168} y={122} w={64} />
        <Line x={168} y={140} w={56} />
        <Line x={168} y={158} w={44} />
      </g>
      <g className="float d1">
        <circle cx="256" cy="190" r="26" fill="var(--primary)" />
        <path d="M256 179v22M245 190h22" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      </g>
      <Sparkles at={[[122, 88, 6], [296, 120, 5]]} />
    </>
  ),
  'search-empty': () => (
    <>
      <Backdrop />
      <g className="sway">
        <circle cx="188" cy="140" r="58" fill="var(--card)" stroke={ink} strokeWidth="9" />
        <path d="M230 182l38 38" stroke={ink} strokeWidth="12" strokeLinecap="round" />
        <path d="M170 122l36 36M206 122l-36 36" stroke="var(--bad)" strokeWidth="7" strokeLinecap="round" />
      </g>
      <Sparkles at={[[112, 100, 6], [292, 84, 5]]} />
    </>
  ),
  'not-found': () => (
    <>
      <Backdrop />
      <path d="M120 246h170" stroke={ink} strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      <g className="float">
        <rect x="140" y="66" width="120" height="156" rx="10" {...paper} />
        <Line x={158} y={96} w={66} />
        <Line x={158} y={116} w={84} />
        <Line x={158} y={136} w={48} />
      </g>
      <g className="float d1">
        <circle cx="238" cy="190" r="38" fill="var(--card)" stroke={ink} strokeWidth="6" />
        <path d="M265 217l25 25" stroke={ink} strokeWidth="8" strokeLinecap="round" />
        <path d="M226 178l24 24M250 178l-24 24" stroke="var(--bad)" strokeWidth="5" strokeLinecap="round" />
      </g>
      <Sparkles at={[[110, 92, 7], [306, 104, 6], [318, 72, 4]]} />
    </>
  ),
  error: () => (
    <>
      <Backdrop tone="var(--bad)" />
      <path d="M120 246h170" stroke={ink} strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      <g className="float">
        <rect x="140" y="70" width="120" height="150" rx="10" {...paper} />
        <Line x={158} y={98} w={62} />
        <Line x={158} y={118} w={84} />
        <path d="M140 150l30-8 14 16 22-14 18 12 36-10" stroke="var(--bad)" strokeWidth="4" strokeLinejoin="round" fill="none" />
        <Line x={158} y={184} w={52} />
        <Line x={158} y={202} w={70} />
      </g>
      <g className="float d1">
        <circle cx="278" cy="96" r="28" fill="var(--bad)" />
        <path d="M282 78l-14 22h12l-6 16 16-24h-12z" fill="#fff" />
      </g>
    </>
  ),
  secure: () => (
    <>
      <Backdrop />
      <path d="M110 246h180" stroke={ink} strokeWidth="3" strokeLinecap="round" opacity="0.35" />
      <g className="float">
        <rect x="150" y="56" width="96" height="180" rx="16" fill="#2A3142" />
        <rect x="158" y="70" width="80" height="152" rx="8" fill="var(--card)" />
        <circle cx="198" cy="100" r="6" fill="var(--primary)" />
        <path d="M188 114c0-6 4-9 10-9s10 3 10 9" fill="var(--primary)" />
        <rect x="170" y="134" width="56" height="14" rx="5" fill="var(--card2)" stroke="var(--line-strong)" strokeWidth="1.5" />
        <rect x="170" y="156" width="56" height="14" rx="5" fill="var(--card2)" stroke="var(--line-strong)" strokeWidth="1.5" />
        <rect x="170" y="182" width="56" height="16" rx="6" fill="var(--primary)" />
      </g>
      <g className="float d1">
        <path d="M268 122l34 12v24c0 22-15 36-34 42-19-6-34-20-34-42v-24z" fill="var(--good)" />
        <path d="M254 160l10 10 18-20" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <Sparkles at={[[118, 92, 7], [304, 182, 6]]} />
    </>
  ),
  success: () => (
    <>
      <Backdrop tone="var(--good)" />
      <g className="pop">
        <circle cx="200" cy="146" r="60" fill="var(--good)" opacity="0.18" />
        <Check cx={200} cy={146} r={42} />
      </g>
      <Sparkles at={[[132, 92, 8], [272, 84, 7], [290, 196, 6], [118, 196, 5]]} />
    </>
  ),
  loading: () => (
    <>
      <Backdrop />
      <g className="float">
        <rect x="150" y="70" width="100" height="140" rx="10" {...paper} />
        <g className="fill-in">
          <Line x={168} y={98} w={46} color="var(--primary)" width={7} />
          <Line x={168} y={120} w={62} />
          <Line x={168} y={140} w={54} />
          <Line x={168} y={160} w={64} />
          <Line x={168} y={186} w={40} color="var(--good)" />
        </g>
      </g>
      <Sparkles at={[[274, 84, 8], [124, 190, 6]]} />
    </>
  ),
};

/** One illustration, 4:3, `height` px tall. */
export function Art({ name, height = 140 }: { name: ArtName; height?: number }) {
  const Scene = SCENES[name];
  return (
    <svg className="art" viewBox="0 0 400 300" width={(height * 4) / 3} height={height} aria-hidden="true" focusable="false">
      <Scene />
    </svg>
  );
}
