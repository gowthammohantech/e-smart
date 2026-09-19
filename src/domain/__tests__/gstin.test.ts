import { seedCompanies, seedParties } from '@/data/seed';
import {
  formatGstin,
  gstinChecksum,
  isValidGstin,
  normalizeGstin,
  panOfGstin,
  stateCodeOfGstin,
} from '@/domain/gstin';
import { GST_STATE_CODES, isValidStateCode, stateNameOf } from '@/domain/stateCodes';

/** The example GSTN publishes alongside the check-digit algorithm. */
const VALID = '27AAPFU0939F1ZV';

describe('GSTIN', () => {
  it('accepts a known-valid GSTIN', () => {
    expect(isValidGstin(VALID)).toBe(true);
  });

  it('rejects a tampered check digit', () => {
    expect(isValidGstin('27AAPFU0939F1ZX')).toBe(false);
  });

  it('rejects a tampered PAN even when the shape is intact', () => {
    expect(isValidGstin('27AAPFU0939G1ZV')).toBe(false);
  });

  it('rejects a GSTIN whose state code does not exist', () => {
    // 99 is not an allotted state code.
    const body = `99${VALID.slice(2, 14)}`;
    expect(isValidGstin(body + gstinChecksum(body))).toBe(false);
  });

  it('rejects wrong lengths and malformed shapes', () => {
    expect(isValidGstin('')).toBe(false);
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isValidGstin('27AAPFU0939F1ZVV')).toBe(false);
    expect(isValidGstin('2AAPFU0939F11ZV')).toBe(false);
  });

  it('round-trips the check digit for every state code', () => {
    GST_STATE_CODES.forEach((state) => {
      const body = `${state.code}AAPFU0939F1Z`;
      const gstin = body + gstinChecksum(body);
      expect(gstin).toHaveLength(15);
      expect(isValidGstin(gstin)).toBe(true);
    });
  });

  it('pulls the state code and PAN back out', () => {
    expect(stateCodeOfGstin(VALID)).toBe('27');
    expect(panOfGstin(VALID)).toBe('AAPFU0939F');
    expect(stateNameOf('27')).toBe('Maharashtra');
  });

  it('normalises whitespace and case', () => {
    expect(normalizeGstin(' 27aapfu0939f1zv ')).toBe(VALID);
    expect(isValidGstin(' 27aapfu0939f1zv ')).toBe(true);
    expect(formatGstin(VALID)).toBe('27 AAPFU0939F 1ZV');
  });

  it('knows which state codes are allotted', () => {
    expect(isValidStateCode('27')).toBe(true);
    expect(isValidStateCode('25')).toBe(false);
    expect(isValidStateCode('96')).toBe(true);
    expect(isValidStateCode(undefined)).toBe(false);
  });
});

describe('seeded GSTINs', () => {
  // The demo book is what people try e-invoicing on; a GSTIN that fails its
  // own check digit would be rejected before it ever reached the portal.
  it('all pass the check digit', () => {
    const gstins = [
      ...seedCompanies().map((c) => c.taxRegistration?.identifier),
      ...seedParties().map((p) => p.taxId),
    ].filter((g): g is string => Boolean(g));
    expect(gstins.length).toBeGreaterThan(0);
    expect(gstins.filter((g) => !isValidGstin(g))).toEqual([]);
  });
});
