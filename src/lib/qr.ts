/**
 * A QR Code encoder, ISO/IEC 18004 (FRD 16).
 *
 * A printed GST e-invoice must carry the signed QR issued by the Invoice
 * Registration Portal, so the code below is a real encoder rather than a
 * decorative block: the matrix it produces scans.
 *
 * Scope, deliberately narrow:
 *
 *   - byte mode only, one segment. No mode mixing and no numeric or
 *     alphanumeric optimisation, which is where hand-rolled encoders usually
 *     go wrong, and which buys nothing for a base64url payload.
 *   - error correction levels L, M, Q and H.
 *   - versions 1 to 40, chosen automatically. The signed QR payload runs to
 *     roughly 700 bytes, which lands around version 17, so the small versions
 *     alone would not do.
 *   - all eight masks scored against the four penalty rules. Pinning a single
 *     mask produces a code that reads on screen and then fails on paper.
 */

export type QrEcc = 'L' | 'M' | 'Q' | 'H';

/** Row-major, `matrix[y][x]`, `true` meaning a dark module. Excludes the quiet zone. */
export type QrMatrix = boolean[][];

const ECC_ORDER: QrEcc[] = ['L', 'M', 'Q', 'H'];

/** Format-information value for each level — not the same as the table order. */
const ECC_FORMAT_BITS: Record<QrEcc, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Error-correction codewords per block, indexed [eccIndex][version]. */
const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  // 0  1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21  22  23  24  25  26  27  28  29  30  31  32  33  34  35  36  37  38  39  40
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // L
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // M
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Q
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // H
];

/** Number of error-correction blocks, indexed [eccIndex][version]. */
const NUM_ECC_BLOCKS: number[][] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25], // L
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49], // M
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68], // Q
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 57, 60, 63, 66, 70, 74, 77, 81, 85], // H
];

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

function eccIndex(ecc: QrEcc): number {
  return ECC_ORDER.indexOf(ecc);
}

export function sizeOfVersion(version: number): number {
  return version * 4 + 17;
}

/**
 * Total data-and-error-correction modules for a version, before the format and
 * version information are carved out. Straight from the standard's formula.
 */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function totalCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8);
}

/** Data codewords available at a version and level, after error correction. */
export function dataCodewords(version: number, ecc: QrEcc): number {
  const e = eccIndex(ecc);
  return totalCodewords(version) - ECC_CODEWORDS_PER_BLOCK[e][version] * NUM_ECC_BLOCKS[e][version];
}

/**
 * How the data codewords are split into error-correction blocks.
 * Exported so a decoder can de-interleave without duplicating the tables.
 */
export function blockStructure(
  version: number,
  ecc: QrEcc,
): { numBlocks: number; ecLen: number; shortBlockLen: number; numShortBlocks: number } {
  const e = eccIndex(ecc);
  const numBlocks = NUM_ECC_BLOCKS[e][version];
  const total = totalCodewords(version);
  return {
    numBlocks,
    ecLen: ECC_CODEWORDS_PER_BLOCK[e][version],
    shortBlockLen: Math.floor(total / numBlocks),
    numShortBlocks: numBlocks - (total % numBlocks),
  };
}

/** Bytes of payload that fit in byte mode at this version and level. */
export function qrCapacity(version: number, ecc: QrEcc): number {
  const countBits = version <= 9 ? 8 : 16;
  const available = dataCodewords(version, ecc) * 8 - 4 - countBits;
  return Math.max(0, Math.floor(available / 8));
}

/** The smallest version that holds `byteLength` bytes, or 0 when none does. */
export function smallestVersionFor(byteLength: number, ecc: QrEcc): number {
  for (let v = 1; v <= 40; v += 1) if (qrCapacity(v, ecc) >= byteLength) return v;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Reed-Solomon over GF(256), primitive polynomial 0x11D               */
/* ------------------------------------------------------------------ */

const GF_EXP = new Array<number>(512);
const GF_LOG = new Array<number>(256);

(function buildGaloisTables() {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
  GF_LOG[0] = 0;
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** The generator polynomial of degree `ecLen`. */
function generatorPoly(ecLen: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecLen; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Reed-Solomon error-correction codewords for `data`. Exported for testing. */
export function rsEncode(data: number[], ecLen: number): number[] {
  const gen = generatorPoly(ecLen);
  const remainder = new Array<number>(ecLen).fill(0);

  for (let i = 0; i < data.length; i += 1) {
    const factor = data[i] ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let j = 0; j < ecLen; j += 1) remainder[j] ^= gfMul(gen[j + 1], factor);
  }
  return remainder;
}

/* ------------------------------------------------------------------ */
/* Bit stream                                                          */
/* ------------------------------------------------------------------ */

function utf8(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

/** Mode indicator, character count, payload, terminator and padding. */
function buildDataCodewords(bytes: number[], version: number, ecc: QrEcc): number[] {
  const capacityBits = dataCodewords(version, ecc) * 8;
  const countBits = version <= 9 ? 8 : 16;
  const bits: number[] = [];

  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, countBits);
  bytes.forEach((b) => push(b, 8));

  // Terminator, then pad to a byte boundary.
  const terminator = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < terminator; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }

  // Alternating pad codewords until the capacity is filled.
  const pad = [0xec, 0x11];
  for (let i = 0; codewords.length < capacityBits / 8; i += 1) codewords.push(pad[i % 2]);
  return codewords;
}

/** Split into blocks, append error correction, then interleave as the standard requires. */
function interleave(data: number[], version: number, ecc: QrEcc): number[] {
  const e = eccIndex(ecc);
  const numBlocks = NUM_ECC_BLOCKS[e][version];
  const ecLen = ECC_CODEWORDS_PER_BLOCK[e][version];
  const total = totalCodewords(version);

  const shortBlockLen = Math.floor(total / numBlocks);
  const numShortBlocks = numBlocks - (total % numBlocks);

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];

  let offset = 0;
  for (let i = 0; i < numBlocks; i += 1) {
    const len = shortBlockLen - ecLen + (i < numShortBlocks ? 0 : 1);
    const block = data.slice(offset, offset + len);
    offset += len;
    dataBlocks.push(block);
    ecBlocks.push(rsEncode(block, ecLen));
  }

  const out: number[] = [];
  const maxData = shortBlockLen - ecLen + 1;
  for (let i = 0; i < maxData; i += 1) {
    dataBlocks.forEach((block) => {
      if (i < block.length) out.push(block[i]);
    });
  }
  for (let i = 0; i < ecLen; i += 1) ecBlocks.forEach((block) => out.push(block[i]));
  return out;
}

/* ------------------------------------------------------------------ */
/* Matrix                                                              */
/* ------------------------------------------------------------------ */

/** Alignment-pattern centre coordinates for a version. */
export function alignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const size = sizeOfVersion(version);
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** BCH(15,5) format information, masked with 0x5412. Exported for testing. */
export function formatInfoBits(ecc: QrEcc, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return (((data << 10) | rem) ^ 0x5412) & 0x7fff;
}

/** BCH(18,6) version information, for versions 7 and above. Exported for testing. */
export function versionInfoBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function maskAt(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
  }
}

type Grid = { modules: boolean[][]; functions: boolean[][]; size: number };

function blankGrid(size: number): Grid {
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    functions: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function setFunction(g: Grid, x: number, y: number, dark: boolean) {
  if (x < 0 || y < 0 || x >= g.size || y >= g.size) return;
  g.modules[y][x] = dark;
  g.functions[y][x] = true;
}

function drawFinder(g: Grid, cx: number, cy: number) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(g, cx + dx, cy + dy, dist !== 2 && dist !== 4);
    }
  }
}

function drawAlignment(g: Grid, cx: number, cy: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunction(g, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function drawFormat(g: Grid, ecc: QrEcc, mask: number) {
  const bits = formatInfoBits(ecc, mask);
  const bit = (i: number) => ((bits >>> i) & 1) !== 0;

  for (let i = 0; i <= 5; i += 1) setFunction(g, 8, i, bit(i));
  setFunction(g, 8, 7, bit(6));
  setFunction(g, 8, 8, bit(7));
  setFunction(g, 7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) setFunction(g, 14 - i, 8, bit(i));

  for (let i = 0; i < 8; i += 1) setFunction(g, g.size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i += 1) setFunction(g, 8, g.size - 15 + i, bit(i));
  setFunction(g, 8, g.size - 8, true); // the module that is always dark
}

function drawFunctionPatterns(g: Grid, version: number, ecc: QrEcc) {
  for (let i = 0; i < g.size; i += 1) {
    setFunction(g, 6, i, i % 2 === 0);
    setFunction(g, i, 6, i % 2 === 0);
  }

  drawFinder(g, 3, 3);
  drawFinder(g, g.size - 4, 3);
  drawFinder(g, 3, g.size - 4);

  const positions = alignmentPatternPositions(version);
  const n = positions.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const corner =
        (i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0);
      if (!corner) drawAlignment(g, positions[i], positions[j]);
    }
  }

  drawFormat(g, ecc, 0); // placeholder; rewritten once the mask is chosen

  if (version >= 7) {
    const bits = versionInfoBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((bits >>> i) & 1) !== 0;
      const a = g.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(g, a, b, bit);
      setFunction(g, b, a, bit);
    }
  }
}

/** Zig-zag placement, two columns at a time from the right, skipping column 6. */
function drawCodewords(g: Grid, codewords: number[]) {
  let i = 0; // bit index across the whole stream
  let upward = true;

  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < g.size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const y = upward ? g.size - 1 - vert : vert;
        if (!g.functions[y][x] && i < codewords.length * 8) {
          g.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
          i += 1;
        }
      }
    }
    upward = !upward;
  }
}

function applyMask(g: Grid, mask: number) {
  for (let y = 0; y < g.size; y += 1) {
    for (let x = 0; x < g.size; x += 1) {
      if (!g.functions[y][x] && maskAt(mask, x, y)) g.modules[y][x] = !g.modules[y][x];
    }
  }
}

/** The finder-like sequences that rule 3 penalises, in both orientations. */
const RULE3_A = [true, false, true, true, true, false, true, false, false, false, false];
const RULE3_B = [false, false, false, false, true, false, true, true, true, false, true];

function matches(line: boolean[], at: number, pattern: boolean[]): boolean {
  for (let i = 0; i < pattern.length; i += 1) if (line[at + i] !== pattern[i]) return false;
  return true;
}

function penalty(g: Grid): number {
  const { size, modules } = g;
  let score = 0;

  const lines: boolean[][] = [];
  for (let y = 0; y < size; y += 1) lines.push(modules[y]);
  for (let x = 0; x < size; x += 1) lines.push(modules.map((row) => row[x]));

  lines.forEach((line) => {
    // Rule 1: runs of five or more identical modules.
    let runLength = 1;
    for (let i = 1; i <= line.length; i += 1) {
      if (i < line.length && line[i] === line[i - 1]) {
        runLength += 1;
      } else {
        if (runLength >= 5) score += PENALTY_N1 + (runLength - 5);
        runLength = 1;
      }
    }
    // Rule 3: finder-like patterns.
    for (let i = 0; i + 11 <= line.length; i += 1) {
      if (matches(line, i, RULE3_A) || matches(line, i, RULE3_B)) score += PENALTY_N3;
    }
  });

  // Rule 2: blocks of 2x2 identical modules.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
        score += PENALTY_N2;
      }
    }
  }

  // Rule 4: deviation from an even split of dark and light.
  let dark = 0;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (modules[y][x]) dark += 1;
  const total = size * size;
  const k = Math.floor(Math.abs(dark * 20 - total * 10) / total);
  score += k * PENALTY_N4;

  return score;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Encode `text` in byte mode at a given version, trying every mask. */
export function qrMatrixAt(text: string, ecc: QrEcc, version: number): QrMatrix {
  const bytes = utf8(text);
  if (bytes.length > qrCapacity(version, ecc)) {
    throw new Error(`QR payload of ${bytes.length} bytes does not fit version ${version}${ecc}`);
  }

  const codewords = interleave(buildDataCodewords(bytes, version, ecc), version, ecc);

  let best: Grid | null = null;
  let bestScore = Infinity;

  for (let mask = 0; mask < 8; mask += 1) {
    const g = blankGrid(sizeOfVersion(version));
    drawFunctionPatterns(g, version, ecc);
    drawCodewords(g, codewords);
    applyMask(g, mask);
    drawFormat(g, ecc, mask);

    const score = penalty(g);
    if (score < bestScore) {
      bestScore = score;
      best = g;
    }
  }

  return best!.modules;
}

/**
 * Encode `text` in byte mode at the smallest version that fits.
 * Throws when the payload exceeds what version 40 can hold.
 */
export function qrMatrix(text: string, ecc: QrEcc = 'M'): QrMatrix {
  const length = utf8(text).length;
  const version = smallestVersionFor(length, ecc);
  if (version === 0) {
    throw new Error(`QR payload of ${length} bytes exceeds the capacity of version 40${ecc}`);
  }
  return qrMatrixAt(text, ecc, version);
}

/**
 * The smallest a symbol can be drawn and still be read, in points or CSS pixels.
 *
 * A reader needs roughly a millimetre and a half of symbol per module before it
 * stops resolving them, and the GST signed payload runs past 650 bytes — a
 * version-21 symbol, 101 modules square. Measured against a reader on a
 * one-to-one display, 160 fails and 180 passes. Below the floor the code
 * renders perfectly and scans not at all, which is the worst of both worlds —
 * so this is a floor, not a suggestion.
 */
export const MIN_READABLE_QR_SIZE = 180;

/** An SVG path covering every dark module as a 1x1 square on the module grid. */
export function qrSvgPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix[y].length; x += 1) {
      if (matrix[y][x]) parts.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return parts.join('');
}

/** A standalone `<svg>` element, for embedding in the printable document HTML. */
export function qrSvgString(
  matrix: QrMatrix,
  opts: { size?: number; quietZone?: number; dark?: string; light?: string } = {},
): string {
  const { size = 132, quietZone = 4, dark = '#000000', light = '#FFFFFF' } = opts;
  const extent = matrix.length + quietZone * 2;
  return (
    // No shape-rendering hint: asking for crisp edges makes the renderer snap
    // every module to the pixel grid, and at the fractional scale a real
    // layout produces that quantises some modules a pixel wider than others.
    // The code still looks perfect and stops decoding. Anti-aliasing keeps the
    // module centres where a reader expects them.
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${extent} ${extent}">` +
    `<rect width="${extent}" height="${extent}" fill="${light}"/>` +
    `<g transform="translate(${quietZone} ${quietZone})">` +
    `<path d="${qrSvgPath(matrix)}" fill="${dark}"/>` +
    `</g></svg>`
  );
}
