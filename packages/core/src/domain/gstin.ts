/**
 * GSTIN parsing and validation.
 *
 * A GSTIN is 15 characters: two state-code digits, a ten-character PAN, an
 * entity number for that PAN within the state, the literal 'Z', and a check
 * digit. The check digit is a base-36 weighted modulus, which is what makes a
 * typo detectable rather than merely mis-shaped.
 */

import { isValidStateCode } from './stateCodes';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 15 chars: 2 digits, 5 letters, 4 digits, 1 letter, 1 alphanumeric, 'Z', 1 alphanumeric. */
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function normalizeGstin(raw: string): string {
  return (raw ?? '').replace(/\s/g, '').toUpperCase();
}

/**
 * The check character for the first 14 characters.
 *
 * Each character's base-36 value is weighted 1, 2, 1, 2 … Products above 35
 * are folded (quotient + remainder) before being summed, and the check
 * character is whatever brings the total up to the next multiple of 36.
 */
export function gstinChecksum(first14: string): string {
  const chars = normalizeGstin(first14);
  if (chars.length !== 14) throw new Error('gstinChecksum expects the first 14 characters');

  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = ALPHABET.indexOf(chars[i]);
    if (value < 0) throw new Error(`Character ${chars[i]} is not valid in a GSTIN`);
    const weight = (i % 2) + 1;
    const product = value * weight;
    sum += Math.floor(product / 36) + (product % 36);
  }

  return ALPHABET[(36 - (sum % 36)) % 36];
}

export function isValidGstin(raw: string | undefined): boolean {
  const gstin = normalizeGstin(raw ?? '');
  if (gstin.length !== 15) return false;
  if (!GSTIN_SHAPE.test(gstin)) return false;
  if (!isValidStateCode(gstin.slice(0, 2))) return false;
  return gstinChecksum(gstin.slice(0, 14)) === gstin[14];
}

export function stateCodeOfGstin(raw: string | undefined): string {
  return normalizeGstin(raw ?? '').slice(0, 2);
}

export function panOfGstin(raw: string | undefined): string {
  return normalizeGstin(raw ?? '').slice(2, 12);
}

/** Group a GSTIN for display: 27 ABCDE1234F 1Z5. */
export function formatGstin(raw: string | undefined): string {
  const gstin = normalizeGstin(raw ?? '');
  if (gstin.length !== 15) return gstin;
  return `${gstin.slice(0, 2)} ${gstin.slice(2, 12)} ${gstin.slice(12)}`;
}

/**
 * A transporter is identified by a GSTIN, or by a 15-character TRANSIN issued
 * to an unregistered transporter. Both share the GSTIN shape.
 */
export function isValidTransporterId(raw: string | undefined): boolean {
  return isValidGstin(raw);
}
