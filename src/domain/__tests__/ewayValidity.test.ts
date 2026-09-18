import {
  canExtend,
  isExpired,
  remainingHours,
  validUpto,
  validityDays,
} from '@/domain/gst/eway/validity';
import {
  formatVehicleNumber,
  isValidVehicleNumber,
  normalizeVehicleNumber,
} from '@/domain/gst/eway/vehicle';

describe('e-way bill validity', () => {
  it('allows one day per 200 km or part thereof', () => {
    expect(validityDays(1)).toBe(1);
    expect(validityDays(100)).toBe(1);
    expect(validityDays(200)).toBe(1);
    expect(validityDays(201)).toBe(2);
    expect(validityDays(400)).toBe(2);
    expect(validityDays(410)).toBe(3);
  });

  it('allows one day per 20 km for over-dimensional cargo', () => {
    expect(validityDays(20, 'odc')).toBe(1);
    expect(validityDays(21, 'odc')).toBe(2);
    expect(validityDays(100, 'odc')).toBe(5);
  });

  it('never returns less than a day', () => {
    expect(validityDays(0)).toBe(1);
    expect(validityDays(-5)).toBe(1);
  });

  it('expires at midnight at the end of the last day', () => {
    // Generated late in the evening: a one-day bill still ends the next midnight.
    expect(validUpto('2026-09-18T23:00:00.000Z', 150)).toBe('2026-09-19T00:00:00.000Z');
    expect(validUpto('2026-09-18T06:00:00.000Z', 450)).toBe('2026-09-21T00:00:00.000Z');
  });

  it('knows when it has run out', () => {
    const upto = '2026-09-19T00:00:00.000Z';
    expect(isExpired(upto, '2026-09-18T23:59:00.000Z')).toBe(false);
    expect(isExpired(upto, '2026-09-19T00:01:00.000Z')).toBe(true);
    expect(isExpired(undefined, '2026-09-19T00:01:00.000Z')).toBe(false);
    expect(remainingHours(upto, '2026-09-18T22:00:00.000Z')).toBe(2);
    expect(remainingHours(upto, '2026-09-20T00:00:00.000Z')).toBe(0);
  });

  it('can be extended within eight hours either side of expiry', () => {
    const upto = '2026-09-19T00:00:00.000Z';
    expect(canExtend(upto, '2026-09-18T17:00:00.000Z')).toBe(true);
    expect(canExtend(upto, '2026-09-19T07:00:00.000Z')).toBe(true);
    expect(canExtend(upto, '2026-09-18T12:00:00.000Z')).toBe(false);
    expect(canExtend(upto, '2026-09-19T09:00:00.000Z')).toBe(false);
  });
});

describe('vehicle numbers', () => {
  it('normalises spacing and case', () => {
    expect(normalizeVehicleNumber('mh 12 ab 1234')).toBe('MH12AB1234');
    expect(normalizeVehicleNumber('MH-12-AB-1234')).toBe('MH12AB1234');
  });

  it('accepts the registration formats in use', () => {
    expect(isValidVehicleNumber('MH12AB1234')).toBe(true);
    expect(isValidVehicleNumber('KA01F1234')).toBe(true);
    expect(isValidVehicleNumber('DL1CAB1234')).toBe(true);
  });

  it('rejects malformed numbers', () => {
    expect(isValidVehicleNumber('MH12AB12')).toBe(false);
    expect(isValidVehicleNumber('1234AB12')).toBe(false);
    expect(isValidVehicleNumber(undefined)).toBe(false);
  });

  it('formats for display', () => {
    expect(formatVehicleNumber('MH12AB1234')).toBe('MH 12 AB 1234');
  });
});
