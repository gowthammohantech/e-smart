/**
 * Minimal animated-GIF89a encoder.
 *
 * The bundled ffmpeg build has no GIF encoder, so the placeholder heroes are
 * written here. Frames are indexed against a fixed palette and emitted with
 * LZW in "clear every block" mode — valid GIF, slightly larger than a full
 * dictionary implementation, and small enough for flat illustration art.
 */

class BitWriter {
  constructor(minCodeSize) {
    this.bytes = [];
    this.block = [];
    this.cur = 0;
    this.bits = 0;
    this.codeSize = minCodeSize + 1;
  }
  write(code) {
    this.cur |= code << this.bits;
    this.bits += this.codeSize;
    while (this.bits >= 8) {
      this.block.push(this.cur & 0xff);
      this.cur >>= 8;
      this.bits -= 8;
      if (this.block.length === 255) this.flushBlock();
    }
  }
  flushBlock() {
    if (this.block.length === 0) return;
    this.bytes.push(this.block.length, ...this.block);
    this.block = [];
  }
  finish() {
    if (this.bits > 0) {
      this.block.push(this.cur & 0xff);
      if (this.block.length === 255) this.flushBlock();
    }
    this.flushBlock();
    this.bytes.push(0);
    return this.bytes;
  }
}

function lzwEncode(indices, minCodeSize) {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const w = new BitWriter(minCodeSize);

  let dict = new Map();
  let next = eoi + 1;
  const reset = () => {
    dict = new Map();
    next = eoi + 1;
    w.codeSize = minCodeSize + 1;
  };

  w.write(clear);
  reset();

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const k = indices[i];
    const key = prefix * 4096 + k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    w.write(prefix);
    if (next < 4096) {
      dict.set(key, next);
      next += 1;
      // Widen once the decoder's next code needs another bit.
      if (next > 1 << w.codeSize && w.codeSize < 12) w.codeSize += 1;
    } else {
      w.write(clear);
      reset();
    }
    prefix = k;
  }

  w.write(prefix);
  w.write(eoi);
  return w.finish();
}

const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];

/**
 * @param frames  array of Uint8Array palette indices, width*height each
 * @param opts    { width, height, palette: ['#rrggbb'...], delayMs, transparentIndex }
 */
export function encodeGif(frames, { width, height, palette, delayMs = 100, transparentIndex = 0 }) {
  // GIF colour tables must be a power of two.
  let bits = 1;
  while (1 << bits < palette.length) bits += 1;
  const tableSize = 1 << bits;

  const out = [];
  out.push(...[0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a

  // Logical screen descriptor with a global colour table.
  out.push(...u16(width), ...u16(height), 0xf0 | (bits - 1), 0, 0);
  for (let i = 0; i < tableSize; i += 1) {
    const hex = palette[i] ?? '#000000';
    out.push(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
  }

  // Netscape looping extension.
  out.push(0x21, 0xff, 0x0b);
  out.push(...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)));
  out.push(0x03, 0x01, 0x00, 0x00, 0x00);

  const minCodeSize = Math.max(2, bits);
  const delay = Math.round(delayMs / 10);

  for (const frame of frames) {
    // Graphic control: restore to background, transparency on.
    out.push(0x21, 0xf9, 0x04, 0x09, ...u16(delay), transparentIndex, 0x00);
    // Image descriptor.
    out.push(0x2c, ...u16(0), ...u16(0), ...u16(width), ...u16(height), 0x00);
    out.push(minCodeSize, ...lzwEncode(frame, minCodeSize));
  }

  out.push(0x3b); // trailer
  return Buffer.from(out);
}

/** Map RGBA pixels onto the palette, sending anything translucent to index 0. */
export function quantize(rgba, palette, transparentIndex = 0) {
  const rgb = palette.map((h) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]);
  const out = new Uint8Array(rgba.length / 4);
  const cache = new Map();

  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    if (rgba[i + 3] < 128) {
      out[p] = transparentIndex;
      continue;
    }
    const key = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
    const hit = cache.get(key);
    if (hit !== undefined) {
      out[p] = hit;
      continue;
    }
    let best = 1;
    let bestD = Infinity;
    for (let c = 1; c < rgb.length; c += 1) {
      const dr = rgba[i] - rgb[c][0];
      const dg = rgba[i + 1] - rgb[c][1];
      const db = rgba[i + 2] - rgb[c][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    cache.set(key, best);
    out[p] = best;
  }
  return out;
}
