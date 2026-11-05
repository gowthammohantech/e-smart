/**
 * Line-art doodles for page backgrounds: the stuff of a small business —
 * receipts, coins, stock, a shopfront. Each is one stroked path in a 48×48 box
 * (stroke it, never fill it). Plain data with no React Native imports, so the
 * admin console draws the very same set.
 */

const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const dot = (x: number, y: number) => `M${x} ${y}h.01`;
const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;

export const DOODLES = {
  receipt: 'M12 6h24v36l-4-3-4 3-4-3-4 3-4-3-4 3zM17 15h14M17 22h10M17 29h12',
  coin: `${circ(24, 24, 15)}M19 16h10M19 21h10M21 16c7 0 7 10 0 10l8 8`,
  box: 'M24 7l16 8v18l-16 8-16-8V15zM8 15l16 8 16-8M24 23v18M16 11l16 8',
  chart: 'M7 41h34M13 41V29M21 41V19M29 41V25M37 41V12M11 20l9-8 7 5 12-10',
  calculator: `M14 5h20a3 3 0 013 3v32a3 3 0 01-3 3H14a3 3 0 01-3-3V8a3 3 0 013-3zM16 11h16v7H16z${dot(18, 25)}${dot(24, 25)}${dot(30, 25)}${dot(18, 31)}${dot(24, 31)}${dot(30, 31)}${dot(18, 37)}${dot(24, 37)}${dot(30, 37)}`,
  shop: 'M7 18l4-10h26l4 10M7 18c0 4 3 6 6.8 6s6.8-2 6.8-6c0 4 3 6 6.8 6s6.8-2 6.8-6c0 4 3 6 6.8 6S41 22 41 18M10 24v17h28V24M20 41v-9h8v9',
  pin: `M24 43c-8-10-12-16-12-23a12 12 0 0124 0c0 7-4 13-12 23z${circ(24, 20, 4)}`,
  percent: `M13 35l22-22${circ(15, 15, 4)}${circ(33, 33, 4)}`,
  cart: `M5 9h6l5 21h21l4-15H13${circ(19, 38, 2.5)}${circ(34, 38, 2.5)}`,
  send: 'M6 22l36-15-12 35-7-14zM23 28l19-21',
  phone: `M17 5h14a3 3 0 013 3v32a3 3 0 01-3 3H17a3 3 0 01-3-3V8a3 3 0 013-3zM22 38h4`,
  tag: `M25 6h16v16L23 40 8 25z${circ(34, 13, 2.5)}`,
  wallet: 'M8 14h29a3 3 0 013 3v20a3 3 0 01-3 3H11a3 3 0 01-3-3zM8 14l22-7 3 7M31 24h9v8h-9a4 4 0 010-8z',
  sparkle: star(24, 24, 13),
} as const;

export type DoodleName = keyof typeof DOODLES;

export type DoodlePlacement = { name: DoodleName; x: number; y: number; size: number; rotate: number };

/**
 * One repeating tile of the wallpaper. Placements stay inside the tile, so it
 * repeats without seams; the rotations keep it from reading as a grid.
 */
export const WALLPAPER_TILE: { size: number; items: DoodlePlacement[] } = {
  size: 260,
  items: [
    { name: 'receipt', x: 14, y: 12, size: 38, rotate: -12 },
    { name: 'coin', x: 96, y: 26, size: 30, rotate: 8 },
    { name: 'box', x: 178, y: 8, size: 40, rotate: 10 },
    { name: 'sparkle', x: 70, y: 84, size: 18, rotate: 0 },
    { name: 'chart', x: 128, y: 92, size: 36, rotate: -6 },
    { name: 'shop', x: 206, y: 96, size: 38, rotate: 6 },
    { name: 'percent', x: 18, y: 112, size: 28, rotate: 14 },
    { name: 'pin', x: 72, y: 164, size: 32, rotate: -8 },
    { name: 'calculator', x: 146, y: 172, size: 34, rotate: 12 },
    { name: 'tag', x: 214, y: 186, size: 30, rotate: -18 },
    { name: 'sparkle', x: 26, y: 214, size: 14, rotate: 0 },
    { name: 'send', x: 104, y: 222, size: 26, rotate: -4 },
  ],
};

/**
 * The sparse set: a handful of doodles placed around a screen's edges, by
 * fraction of its width and height, so they frame the content rather than
 * sit under it.
 */
export const SCATTER: DoodlePlacement[] = [
  { name: 'coin', x: 0.88, y: 0.1, size: 40, rotate: 12 },
  { name: 'receipt', x: 0.04, y: 0.26, size: 44, rotate: -14 },
  { name: 'sparkle', x: 0.7, y: 0.3, size: 20, rotate: 0 },
  { name: 'box', x: 0.9, y: 0.48, size: 44, rotate: 8 },
  { name: 'chart', x: 0.06, y: 0.62, size: 40, rotate: -6 },
  { name: 'tag', x: 0.86, y: 0.78, size: 36, rotate: -16 },
  { name: 'sparkle', x: 0.2, y: 0.86, size: 16, rotate: 0 },
  { name: 'pin', x: 0.5, y: 0.93, size: 32, rotate: 6 },
];

/** The transform that puts a doodle's 48×48 box at its place. */
export const placeDoodle = ({ x, y, size, rotate }: Omit<DoodlePlacement, 'name'>) =>
  `translate(${x} ${y}) rotate(${rotate} ${size / 2} ${size / 2}) scale(${size / 48})`;

/** The whole wallpaper tile as SVG markup in `color`, for CSS masks and backgrounds. */
export function wallpaperSvg(color = '#000', strokeWidth = 2.6) {
  const s = WALLPAPER_TILE.size;
  const body = WALLPAPER_TILE.items
    .map((it) => `<path transform="${placeDoodle(it)}" d="${DOODLES[it.name]}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><g fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}
