import { rateOf, taxCategoriesOn, taxRateOn } from '../taxEngine';
import type { TaxCategory } from '../../types';

// 18% from 2017, cut to 12% from 1 Oct 2026, then to 5% from 1 Dec 2026.
const gst: TaxCategory = {
  id: 'tax_x',
  companyId: 'c',
  name: 'GST',
  type: 'GST',
  rate: 5,
  effectiveFrom: '2026-12-01',
  history: [
    { effectiveFrom: '2017-07-01', rate: 18 },
    { effectiveFrom: '2026-10-01', rate: 12 },
  ],
};

describe('taxRateOn: a category charges the rate in force on the date', () => {
  it('takes the current rate from its effective date on', () => {
    expect(taxRateOn(gst, '2026-12-01')).toBe(5);
    expect(taxRateOn(gst, '2027-03-31')).toBe(5);
  });

  it('takes the earlier rate that had started by a date before it', () => {
    expect(taxRateOn(gst, '2026-11-30')).toBe(12);
    expect(taxRateOn(gst, '2026-10-01')).toBe(12);
    expect(taxRateOn(gst, '2026-09-30')).toBe(18);
  });

  it('falls back to the current rate with no date, or nothing on record that early', () => {
    expect(taxRateOn(gst, undefined)).toBe(5);
    expect(taxRateOn(gst, '2010-01-01')).toBe(5);
    expect(taxRateOn({ rate: 18, effectiveFrom: '2027-01-01' }, '2026-06-01')).toBe(18);
  });

  it('dates a whole list, and a lookup by id', () => {
    expect(taxCategoriesOn([gst], '2026-11-15')[0].rate).toBe(12);
    expect(taxCategoriesOn([gst], '2026-12-15')[0]).toBe(gst);
    expect(rateOf([gst], 'tax_x', '2026-09-01')).toBe(18);
    expect(rateOf([gst], 'tax_x')).toBe(5);
  });
});
