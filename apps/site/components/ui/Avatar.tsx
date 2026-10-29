import { useId } from 'react';

/**
 * A drawn person, built from a seed: background, skin tone, hair, shirt and
 * an accent (bindi or glasses). Illustrative on purpose, for placeholder
 * proof, and bundled inline so nothing is fetched.
 */

const BACKS = ['#CFE5FF', '#FFE3C2', '#D7F3E6', '#E8DDFF', '#FFD9DE', '#D9EEF7'];
const SKIN = ['#F1C7A5', '#E0AC85', '#C98E66', '#A86F4C', '#8A5638'];
const HAIR = ['#1F1A17', '#2E221C', '#3B2A20', '#151515', '#4A3426'];
const SHIRT = ['#007AFF', '#0A3D8F', '#34C88A', '#F0B429', '#FF6B6B', '#5A6478'];

type Style = 'short' | 'side' | 'long' | 'bun' | 'curly';
const STYLES: Style[] = ['short', 'side', 'long', 'bun', 'curly'];

/**
 * Each trait steps through its list at its own rate. The rates share no factor
 * with any list length, so consecutive seeds always differ in every trait.
 */
const RATES = [7, 11, 13, 17, 19, 23];
function pick<T>(list: T[], seed: number, salt: number) {
  return list[(seed * RATES[salt - 1] + salt) % list.length];
}

function Hair({ style, color }: { style: Style; color: string }) {
  switch (style) {
    case 'long':
      // The part over the head; the length behind it is drawn before the face.
      return <path d="M19 28c0-9 6-15 13-15s13 6 13 15c-4-5-9-7-13-7s-9 2-13 7Z" fill={color} />;
    case 'bun':
      return (
        <>
          <circle cx="32" cy="11" r="6" fill={color} />
          <path d="M19 28c0-9 6-15 13-15s13 6 13 15c-3-4-8-6-13-6s-10 2-13 6Z" fill={color} />
        </>
      );
    case 'side':
      return <path d="M19 29c-1-10 5-17 14-17 7 0 12 5 12 13-6-1-12-4-15-9-2 6-6 10-11 13Z" fill={color} />;
    case 'curly':
      return (
        <g fill={color}>
          {[
            [21, 22],
            [25, 16],
            [31, 13],
            [37, 14],
            [42, 18],
            [44, 24],
            [20, 28],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="5.5" />
          ))}
        </g>
      );
    default:
      return <path d="M19 27c0-9 6-14 13-14s13 5 13 14c-3-3-8-5-13-5s-10 2-13 5Z" fill={color} />;
  }
}

export function Avatar({ seed, size = 40, className = '' }: { seed: number; size?: number; className?: string }) {
  const clip = useId();
  const back = pick(BACKS, seed, 1);
  const skin = pick(SKIN, seed, 2);
  const hair = pick(HAIR, seed, 3);
  const shirt = pick(SHIRT, seed, 4);
  const style = pick(STYLES, seed, 5);
  const accent = pick(['none', 'bindi', 'glasses', 'none'] as const, seed, 6);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`shrink-0 rounded-full ${className}`} aria-hidden>
      <clipPath id={clip}>
        <circle cx="32" cy="32" r="32" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect width="64" height="64" fill={back} />
        {style === 'long' ? <rect x="17" y="18" width="30" height="34" rx="14" fill={hair} /> : null}
        <path d="M10 64c2-11 11-17 22-17s20 6 22 17Z" fill={shirt} />
        <rect x="28" y="38" width="8" height="10" rx="3" fill={skin} />
        <circle cx="32" cy="29" r="13" fill={skin} />
        <Hair style={style} color={hair} />
        <circle cx="27.5" cy="30" r="1.4" fill="#1F1A17" />
        <circle cx="36.5" cy="30" r="1.4" fill="#1F1A17" />
        <path d="M28.5 35.2c2.1 1.8 4.9 1.8 7 0" stroke="#7A3E2B" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {accent === 'bindi' ? <circle cx="32" cy="24.6" r="1.1" fill="#D33B3B" /> : null}
        {accent === 'glasses' ? (
          <g stroke="#1F1A17" strokeWidth="1.1" fill="none">
            <circle cx="27.5" cy="30" r="3.4" />
            <circle cx="36.5" cy="30" r="3.4" />
            <path d="M30.9 30h2.2" />
          </g>
        ) : null}
      </g>
    </svg>
  );
}
