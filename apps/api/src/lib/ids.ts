import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32, lower case

function encodeTime(ms: number, len = 10): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out = ALPHABET[ms % 32] + out;
    ms = Math.floor(ms / 32);
  }
  return out;
}

function encodeRandom(len = 16): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % 32];
  return out;
}

/**
 * A ULID-style id with a type prefix: `pty_01j9x…`. The time part keeps ids
 * sortable by creation, which cursor pagination leans on. 30 characters with
 * a three-letter prefix, well inside the schema's varchar(40).
 */
export function newId(prefix: string, now = Date.now()): string {
  return `${prefix}_${encodeTime(now)}${encodeRandom()}`;
}
