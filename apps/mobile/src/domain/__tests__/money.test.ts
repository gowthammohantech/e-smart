import {
  allocate,
  fromMajor,
  inclusiveTax,
  money,
  percent,
  roundToWholeUnit,
  toMajor,
} from '@/lib/money';
import { formatMoney, formatNumber } from '@/lib/format';

describe('money', () => {
  it('carries amounts as integer minor units', () => {
    expect(fromMajor('1234.56', 'INR').minor).toBe(123456);
    expect(fromMajor(0.1, 'INR').minor).toBe(10);
    expect(fromMajor('0.07', 'INR').minor).toBe(7);
  });

  it('avoids binary floating point drift', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point.
    const a = fromMajor('0.1', 'INR');
    const b = fromMajor('0.2', 'INR');
    expect(a.minor + b.minor).toBe(30);
    expect(toMajor(money(a.minor + b.minor, 'INR'))).toBe(0.3);
  });

  it('respects per-currency precision', () => {
    expect(fromMajor('1234', 'JPY').minor).toBe(1234);
    expect(fromMajor('1234.56', 'USD').minor).toBe(123456);
  });

  it('computes percentages with half-up rounding', () => {
    expect(percent(fromMajor('100', 'INR'), 18).minor).toBe(1800);
    // 55.55 * 18% = 9.999 -> 10.00
    expect(percent(fromMajor('55.55', 'INR'), 18).minor).toBe(1000);
  });

  it('extracts tax from an inclusive amount', () => {
    // 118.00 at 18% inclusive contains exactly 18.00 of tax.
    expect(inclusiveTax(fromMajor('118', 'INR'), 18).minor).toBe(1800);
    expect(inclusiveTax(fromMajor('1180', 'INR'), 18).minor).toBe(18000);
  });

  it('rounds a total to the whole unit and reports the adjustment', () => {
    const { rounded, adjustment } = roundToWholeUnit(fromMajor('1234.60', 'INR'));
    expect(rounded.minor).toBe(123500);
    expect(adjustment.minor).toBe(40);

    const down = roundToWholeUnit(fromMajor('1234.20', 'INR'));
    expect(down.rounded.minor).toBe(123400);
    expect(down.adjustment.minor).toBe(-20);
  });

  it('allocates without losing or inventing minor units', () => {
    const parts = allocate(fromMajor('100', 'INR'), [1, 1, 1]);
    expect(parts.map((p) => p.minor)).toEqual([3334, 3333, 3333]);
    expect(parts.reduce((a, p) => a + p.minor, 0)).toBe(10000);
  });
});

describe('formatting', () => {
  it('groups Indian numbers in lakhs and crores', () => {
    expect(formatNumber(1234567, 2, 'indian')).toBe('12,34,567.00');
    expect(formatNumber(1234567, 2, 'western')).toBe('1,234,567.00');
  });

  it('formats money with the right symbol and precision', () => {
    expect(formatMoney(fromMajor('1234.5', 'INR'))).toBe('₹1,234.50');
    expect(formatMoney(fromMajor('1234', 'JPY'))).toBe('¥1,234');
    expect(formatMoney(fromMajor('-500', 'INR'))).toBe('-₹500.00');
  });
});
