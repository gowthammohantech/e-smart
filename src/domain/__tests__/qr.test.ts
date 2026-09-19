import {
  MIN_READABLE_QR_SIZE,
  QrEcc,
  QrMatrix,
  alignmentPatternPositions,
  blockStructure,
  formatInfoBits,
  qrCapacity,
  qrMatrix,
  qrMatrixAt,
  qrSvgPath,
  qrSvgString,
  rsEncode,
  sizeOfVersion,
  smallestVersionFor,
  versionInfoBits,
} from '@/lib/qr';
import {
  base64UrlDecode,
  base64UrlEncode,
  bytesToHex,
  sha256Hex,
  utf8Bytes,
} from '@/lib/hash';

/* ------------------------------------------------------------------ */
/* An independent decoder.                                             */
/*                                                                     */
/* Deliberately written against the standard rather than against the   */
/* encoder's own helpers: it rebuilds the function-module map, reads   */
/* the format information out of the matrix, un-masks, walks the data  */
/* modules itself and de-interleaves the blocks. A matrix can have     */
/* flawless finder and timing patterns and still be undecodable if the */
/* zig-zag skipped the wrong column or the blocks were interleaved in  */
/* the wrong order, and only a round trip catches that.                */
/* ------------------------------------------------------------------ */

function functionMap(version: number): boolean[][] {
  const size = sizeOfVersion(version);
  const fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const mark = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < size && y < size) fn[y][x] = true;
  };

  // Finder patterns plus their separators: an 8x8 block in three corners.
  [
    [0, 0],
    [size - 8, 0],
    [0, size - 8],
  ].forEach(([ox, oy]) => {
    for (let dy = 0; dy < 8; dy += 1) for (let dx = 0; dx < 8; dx += 1) mark(ox + dx, oy + dy);
  });

  // Timing patterns.
  for (let i = 0; i < size; i += 1) {
    mark(6, i);
    mark(i, 6);
  }

  // Alignment patterns, except where they would collide with a finder.
  const pos = alignmentPatternPositions(version);
  for (let i = 0; i < pos.length; i += 1) {
    for (let j = 0; j < pos.length; j += 1) {
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === pos.length - 1) ||
        (i === pos.length - 1 && j === 0);
      if (corner) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) mark(pos[i] + dx, pos[j] + dy);
      }
    }
  }

  // Format information, both copies, and the module that is always dark.
  for (let i = 0; i < 9; i += 1) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i += 1) mark(size - 1 - i, 8);
  for (let i = 0; i < 8; i += 1) mark(8, size - 1 - i);

  // Version information.
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      mark(a, b);
      mark(b, a);
    }
  }
  return fn;
}

function readFormat(m: QrMatrix): { ecc: QrEcc; mask: number } {
  let bits = 0;
  const set = (i: number, dark: boolean) => {
    if (dark) bits |= 1 << i;
  };
  for (let i = 0; i <= 5; i += 1) set(i, m[i][8]);
  set(6, m[7][8]);
  set(7, m[8][8]);
  set(8, m[8][7]);
  for (let i = 9; i < 15; i += 1) set(i, m[8][14 - i]);

  const data = ((bits ^ 0x5412) >>> 10) & 0x1f;
  const eccBits = (data >>> 3) & 3;
  const byFormatValue: Record<number, QrEcc> = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };
  return { ecc: byFormatValue[eccBits], mask: data & 7 };
}

function unmask(m: QrMatrix, fn: boolean[][], mask: number): QrMatrix {
  const at = (x: number, y: number): boolean => {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
    }
  };
  return m.map((row, y) => row.map((v, x) => (fn[y][x] ? v : v !== at(x, y))));
}

function readCodewords(m: QrMatrix, fn: boolean[][]): number[] {
  const size = m.length;
  const bits: boolean[] = [];
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    const col = right === 6 ? 5 : right;
    for (let step = 0; step < size; step += 1) {
      const y = upward ? size - 1 - step : step;
      for (let j = 0; j < 2; j += 1) {
        const x = col - j;
        if (!fn[y][x]) bits.push(m[y][x]);
      }
    }
    upward = !upward;
  }

  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (bits[i + j] ? 1 : 0);
    out.push(byte);
  }
  return out;
}

function deinterleave(codewords: number[], version: number, ecc: QrEcc): number[] {
  const { numBlocks, ecLen, shortBlockLen, numShortBlocks } = blockStructure(version, ecc);

  const lengths: number[] = [];
  for (let i = 0; i < numBlocks; i += 1) {
    lengths.push(shortBlockLen - ecLen + (i < numShortBlocks ? 0 : 1));
  }

  const blocks: number[][] = lengths.map(() => []);
  let read = 0;
  const maxLen = Math.max(...lengths);
  for (let i = 0; i < maxLen; i += 1) {
    for (let b = 0; b < numBlocks; b += 1) {
      if (i < lengths[b]) {
        blocks[b].push(codewords[read]);
        read += 1;
      }
    }
  }
  return blocks.flat();
}

function decodePayload(data: number[], version: number): string {
  const bits: number[] = [];
  data.forEach((b) => {
    for (let i = 7; i >= 0; i -= 1) bits.push((b >>> i) & 1);
  });

  const take = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i += 1) v = (v << 1) | bits.shift()!;
    return v;
  };

  const mode = take(4);
  expect(mode).toBe(0b0100); // byte mode
  const length = take(version <= 9 ? 8 : 16);

  const bytes: number[] = [];
  for (let i = 0; i < length; i += 1) bytes.push(take(8));

  // UTF-8 decode.
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let code: number;
    if (b < 0x80) { code = b; i += 1; }
    else if ((b & 0xe0) === 0xc0) { code = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f); i += 2; }
    else if ((b & 0xf0) === 0xe0) {
      code = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      i += 3;
    } else {
      code =
        ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      i += 4;
    }
    if (code > 0xffff) {
      const c = code - 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

/** Decode a matrix back to the text it encodes. */
function decode(m: QrMatrix): string {
  const version = (m.length - 17) / 4;
  const fn = functionMap(version);
  const { ecc, mask } = readFormat(m);
  const plain = unmask(m, fn, mask);
  const codewords = readCodewords(plain, fn);
  const dataOnly = codewords.slice(0, blockStructure(version, ecc).numBlocks === 0 ? 0 : codewords.length);
  const blocks = deinterleave(dataOnly, version, ecc);
  return decodePayload(blocks, version);
}

/* ------------------------------------------------------------------ */

const ECC_LEVELS: QrEcc[] = ['L', 'M', 'Q', 'H'];

describe('SHA-256 (FRD 16)', () => {
  it('matches the published digest for the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('matches the published digest for "abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('matches the published digest for the 56-byte vector', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('handles a 55-byte input, where the padding just fits one block', () => {
    expect(sha256Hex('a'.repeat(55))).toHaveLength(64);
  });

  it('handles a 56-byte input, where the padding forces a second block', () => {
    expect(sha256Hex('a'.repeat(56))).toHaveLength(64);
  });

  it('handles an input on an exact block boundary', () => {
    expect(sha256Hex('a'.repeat(64))).toHaveLength(64);
  });

  it('matches the published digest for a million repetitions of "a"', () => {
    expect(sha256Hex('a'.repeat(1000000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('encodes multi-byte characters as UTF-8 before hashing', () => {
    expect(bytesToHex(utf8Bytes('₹'))).toBe('e282b9');
    expect(sha256Hex('₹')).toHaveLength(64);
  });

  it('is stable across repeated calls', () => {
    expect(sha256Hex('27AABCV1234F1ZOINV')).toBe(sha256Hex('27AABCV1234F1ZOINV'));
  });
});

describe('base64url (FRD 16)', () => {
  it('encodes without padding', () => {
    expect(base64UrlEncode('abc')).toBe('YWJj');
    expect(base64UrlEncode('ab')).toBe('YWI');
    expect(base64UrlEncode('a')).toBe('YQ');
  });

  it('round-trips multi-byte text', () => {
    const text = '{"TotInvVal":1234.56,"Note":"₹ ✓"}';
    expect(base64UrlDecode(base64UrlEncode(text))).toBe(text);
  });

  it('never emits a character outside the URL-safe alphabet', () => {
    const encoded = base64UrlEncode('?'.repeat(64) + '~'.repeat(64));
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('Reed-Solomon over GF(256) (FRD 16)', () => {
  it('reproduces the published codewords for the version 1-M example', () => {
    // The worked "HELLO WORLD" example from the standard's own annex.
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(rsEncode(data, 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it('returns exactly the requested number of codewords', () => {
    expect(rsEncode([1, 2, 3], 7)).toHaveLength(7);
    expect(rsEncode([1, 2, 3], 30)).toHaveLength(30);
  });

  it('produces all-zero codewords for all-zero data', () => {
    expect(rsEncode([0, 0, 0, 0], 10).every((b) => b === 0)).toBe(true);
  });

  it('changes every time a single input byte changes', () => {
    const a = rsEncode([1, 2, 3, 4], 10).join(',');
    const b = rsEncode([1, 2, 3, 5], 10).join(',');
    expect(a).not.toBe(b);
  });
});

describe('QR capacity and version selection (FRD 16)', () => {
  it('matches the published byte-mode capacities for version 1', () => {
    expect([qrCapacity(1, 'L'), qrCapacity(1, 'M'), qrCapacity(1, 'Q'), qrCapacity(1, 'H')]).toEqual([17, 14, 11, 7]);
  });

  it('matches the published byte-mode capacities for version 5', () => {
    expect([qrCapacity(5, 'L'), qrCapacity(5, 'M'), qrCapacity(5, 'Q'), qrCapacity(5, 'H')]).toEqual([106, 84, 60, 44]);
  });

  it('matches the published byte-mode capacities for version 10', () => {
    expect([qrCapacity(10, 'L'), qrCapacity(10, 'M'), qrCapacity(10, 'Q'), qrCapacity(10, 'H')]).toEqual([271, 213, 151, 119]);
  });

  it('matches the published byte-mode capacities for version 40', () => {
    expect([qrCapacity(40, 'L'), qrCapacity(40, 'M'), qrCapacity(40, 'Q'), qrCapacity(40, 'H')]).toEqual([2953, 2331, 1663, 1153]);
  });

  it('picks the smallest version that fits', () => {
    expect(smallestVersionFor(17, 'L')).toBe(1);
    expect(smallestVersionFor(14, 'M')).toBe(1);
  });

  it('bumps a version when the payload exceeds capacity by one byte', () => {
    expect(smallestVersionFor(18, 'L')).toBe(2);
    expect(smallestVersionFor(15, 'M')).toBe(2);
  });

  it('reports no version when the payload exceeds version 40', () => {
    expect(smallestVersionFor(2954, 'L')).toBe(0);
  });

  it('puts a signed-QR sized payload around version 21 at level M', () => {
    // The signed QR the IRP returns runs to roughly 700 bytes, so the encoder
    // has to reach well past the small versions to carry one.
    expect(smallestVersionFor(700, 'M')).toBe(21);
    expect(smallestVersionFor(700, 'L')).toBe(18);
  });
});

describe('QR structure (FRD 16)', () => {
  it('sizes the matrix as 17 plus four times the version', () => {
    expect(qrMatrixAt('hi', 'M', 1)).toHaveLength(21);
    expect(qrMatrixAt('hi', 'M', 7)).toHaveLength(45);
    expect(qrMatrixAt('hi', 'M', 20)).toHaveLength(97);
  });

  it('places the three finder patterns', () => {
    const m = qrMatrixAt('hi', 'M', 2);
    const size = m.length;
    [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ].forEach(([ox, oy]) => {
      for (let dy = 0; dy < 7; dy += 1) {
        for (let dx = 0; dx < 7; dx += 1) {
          const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          expect(m[oy + dy][ox + dx]).toBe(ring !== 2);
        }
      }
    });
  });

  it('leaves the separator around each finder light', () => {
    const m = qrMatrixAt('hi', 'M', 2);
    for (let i = 0; i < 8; i += 1) {
      expect(m[7][i]).toBe(false);
      expect(m[i][7]).toBe(false);
    }
  });

  it('lays alternating timing patterns on row 6 and column 6', () => {
    const m = qrMatrixAt('hi', 'M', 3);
    for (let i = 8; i < m.length - 8; i += 1) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
  });

  it('always sets the dark module below the top-left finder', () => {
    [1, 5, 12, 30].forEach((v) => {
      const m = qrMatrixAt('hi', 'M', v);
      expect(m[4 * v + 9][8]).toBe(true);
    });
  });

  it('places alignment pattern centres at the published positions', () => {
    expect(alignmentPatternPositions(1)).toEqual([]);
    expect(alignmentPatternPositions(2)).toEqual([6, 18]);
    expect(alignmentPatternPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPatternPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
  });

  it('matches the published format-information values for mask 0', () => {
    expect(formatInfoBits('L', 0)).toBe(0b111011111000100);
    expect(formatInfoBits('M', 0)).toBe(0b101010000010010);
    expect(formatInfoBits('Q', 0)).toBe(0b011010101011111);
    expect(formatInfoBits('H', 0)).toBe(0b001011010001001);
  });

  it('emits a valid BCH(15,5) codeword for every level and mask', () => {
    ECC_LEVELS.forEach((ecc) => {
      for (let mask = 0; mask < 8; mask += 1) {
        // Strip the 0x5412 mask, then divide by the generator: no remainder.
        let rem = formatInfoBits(ecc, mask) ^ 0x5412;
        for (let i = 14; i >= 10; i -= 1) if (rem & (1 << i)) rem ^= 0x537 << (i - 10);
        expect(rem).toBe(0);
      }
    });
  });

  it('keeps all 32 format values distinct, seven bits apart', () => {
    // The published code corrects three bit errors, so its minimum distance is 7.
    const all = ECC_LEVELS.flatMap((ecc) =>
      [0, 1, 2, 3, 4, 5, 6, 7].map((mask) => formatInfoBits(ecc, mask)),
    );
    expect(new Set(all).size).toBe(32);

    let minDistance = Infinity;
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        let diff = all[i] ^ all[j];
        let bits = 0;
        while (diff) {
          bits += diff & 1;
          diff >>= 1;
        }
        minDistance = Math.min(minDistance, bits);
      }
    }
    expect(minDistance).toBe(7);
  });

  it('matches the published version-information value for version 7', () => {
    expect(versionInfoBits(7)).toBe(0b000111110010010100);
  });

  it('emits a valid BCH(18,6) codeword for every version from 7 to 40', () => {
    for (let v = 7; v <= 40; v += 1) {
      const bits = versionInfoBits(v);
      expect(bits >>> 12).toBe(v);

      let rem = bits;
      for (let i = 17; i >= 12; i -= 1) if (rem & (1 << i)) rem ^= 0x1f25 << (i - 12);
      expect(rem).toBe(0);
    }
  });

  it('writes both copies of the format information identically', () => {
    const m = qrMatrixAt('hi', 'Q', 4);
    const size = m.length;
    let a = 0;
    let b = 0;
    for (let i = 0; i <= 5; i += 1) if (m[i][8]) a |= 1 << i;
    if (m[7][8]) a |= 1 << 6;
    if (m[8][8]) a |= 1 << 7;
    if (m[8][7]) a |= 1 << 8;
    for (let i = 9; i < 15; i += 1) if (m[8][14 - i]) a |= 1 << i;

    for (let i = 0; i < 8; i += 1) if (m[8][size - 1 - i]) b |= 1 << i;
    for (let i = 8; i < 15; i += 1) if (m[size - 15 + i][8]) b |= 1 << i;

    expect(a).toBe(b);
  });

  it('refuses a payload that exceeds version 40', () => {
    expect(() => qrMatrix('x'.repeat(3000), 'L')).toThrow(/exceeds the capacity/);
  });

  it('refuses a payload that exceeds the version it was pinned to', () => {
    expect(() => qrMatrixAt('x'.repeat(30), 'L', 1)).toThrow(/does not fit/);
  });
});

describe('QR round trip (FRD 16)', () => {
  it.each(ECC_LEVELS)('decodes back short ASCII at level %s', (ecc) => {
    const text = 'HELLO WORLD';
    expect(decode(qrMatrix(text, ecc))).toBe(text);
  });

  it('decodes back a single character at version 1', () => {
    const m = qrMatrix('A', 'H');
    expect(m).toHaveLength(21);
    expect(decode(m)).toBe('A');
  });

  it('decodes back a payload at every capacity boundary from version 1 to 12', () => {
    for (let v = 1; v <= 12; v += 1) {
      const text = 'x'.repeat(qrCapacity(v, 'M'));
      const m = qrMatrix(text, 'M');
      expect(m).toHaveLength(sizeOfVersion(v));
      expect(decode(m)).toBe(text);
    }
  });

  it.each(ECC_LEVELS)('decodes back a 700-byte payload at level %s', (ecc) => {
    const text = Array.from({ length: 700 }, (_, i) => String.fromCharCode(33 + (i % 90))).join('');
    expect(decode(qrMatrix(text, ecc))).toBe(text);
  });

  it('decodes back multi-byte UTF-8 text', () => {
    const text = 'Total ₹1,23,456.78 · Vertex Traders · ✓ verified';
    expect(decode(qrMatrix(text, 'M'))).toBe(text);
  });

  it('decodes back a JWS-shaped payload of the size the IRP returns', () => {
    const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64UrlEncode(
      JSON.stringify({
        data: JSON.stringify({
          SellerGstin: '27AABCV1234F1ZO',
          BuyerGstin: '29AACFA9876P1ZH',
          DocNo: 'INV/26-27/0042',
          DocTyp: 'INV',
          DocDt: '18/09/2026',
          TotInvVal: 118000.5,
          ItemCnt: 4,
          MainHsnCode: '39211900',
          Irn: sha256Hex('27AABCV1234F1ZOINVINV/26-27/00422026-27'),
          IrnDt: '2026-09-18 11:24:07',
        }),
        iss: 'NIC',
      }),
    );
    const signature = base64UrlEncode(sha256Hex('signature'));
    const jws = `${header}.${claims}.${signature}`;

    expect(jws.length).toBeGreaterThan(500);
    expect(decode(qrMatrix(jws, 'M'))).toBe(jws);
  });

  it('decodes back the same text from every version it is pinned to', () => {
    const text = 'Elixir Books Smart';
    [2, 6, 7, 14, 27].forEach((v) => {
      expect(decode(qrMatrixAt(text, 'M', v))).toBe(text);
    });
  });
});

describe('QR readability (FRD 16)', () => {
  it('keeps at least 1.75 units per module for a signed-payload symbol', () => {
    // Measured against a reader on a one-to-one display: a version-21 symbol
    // fails at 160 units and passes at 180, though it renders perfectly at
    // both. Every place the app draws a signed QR sizes itself from this
    // constant, so this guards all three against being trimmed to fit.
    const modules = sizeOfVersion(smallestVersionFor(700, 'M'));
    expect(MIN_READABLE_QR_SIZE / modules).toBeGreaterThanOrEqual(1.75);
  });
});

describe('QR SVG output (FRD 16)', () => {
  it('emits one subpath per dark module', () => {
    const m = qrMatrixAt('hi', 'M', 1);
    const dark = m.flat().filter(Boolean).length;
    expect(qrSvgPath(m).match(/M/g) ?? []).toHaveLength(dark);
  });

  it('sizes the viewBox for the matrix plus two quiet zones', () => {
    const m = qrMatrixAt('hi', 'M', 1);
    expect(qrSvgString(m, { quietZone: 4 })).toContain('viewBox="0 0 29 29"');
  });

  it('asks for no crisp-edge rendering', () => {
    // Snapping modules to the pixel grid at a fractional scale widens some by a
    // pixel and stops readers decoding a dense symbol, while leaving it looking
    // perfect. Verified against a reader, not assumed.
    expect(qrSvgString(qrMatrixAt('hi', 'M', 1))).not.toContain('shape-rendering');
  });

  it('carries the requested pixel size and colours', () => {
    const svg = qrSvgString(qrMatrixAt('hi', 'M', 1), { size: 96, dark: '#111111' });
    expect(svg).toContain('width="96"');
    expect(svg).toContain('fill="#111111"');
  });

  it('produces no path at all for an all-light matrix', () => {
    expect(qrSvgPath([[false, false], [false, false]])).toBe('');
  });
});
