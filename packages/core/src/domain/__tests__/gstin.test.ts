import {
  formatGstin,
  gstinChecksum,
  isValidGstin,
  normalizeGstin,
  panOfGstin,
  setSandboxGstinsAllowed,
  stateCodeOfGstin,
} from '../gstin';
import { GST_STATE_CODES, isValidStateCode, stateNameOf } from '../stateCodes';

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

describe('real-shaped GSTINs', () => {
  // Fixtures in the shape the demo book uses (its own copy is checked in the
  // API's demo-seed test): a GSTIN that fails its own check digit would be
  // rejected before it ever reached the portal.
  it('all pass the check digit', () => {
    const gstins = ['27AABCV1234F1ZO', '29AACFA9876P1ZH', '29AADCL5544K1Z4', '29AAECI7788M1ZK', '27AABCT5512M1Z6', '29AABCG4321K1ZM'];
    expect(gstins.filter((g) => !isValidGstin(g))).toEqual([]);
  });
});

describe('NIC sandbox test GSTINs', () => {
  afterEach(() => setSandboxGstinsAllowed(false));

  it('are refused until the server says it can reach a sandbox', () => {
    expect(isValidGstin('29AAGCB1286Q000')).toBe(false);
    expect(isValidGstin('01AMBPG7773M002')).toBe(false);
  });

  it('are admitted when it does: Whitebooks’ and Adaequare’s, which have no check digit', () => {
    setSandboxGstinsAllowed(true);
    expect(isValidGstin('29AAGCB1286Q000')).toBe(true);
    expect(isValidGstin('01AMBPG7773M002')).toBe(true);
    // An unknown state is refused either way.
    expect(isValidGstin('99AAGCB1286Q000')).toBe(false);
  });

  it('never loosen the rule for a real GSTIN: a Z in the 14th place still needs its check digit', () => {
    setSandboxGstinsAllowed(true);
    expect(isValidGstin(VALID)).toBe(true);
    expect(isValidGstin('27AAPFU0939F1ZX')).toBe(false);
  });
});
