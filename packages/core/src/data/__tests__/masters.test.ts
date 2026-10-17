import { SERVICE_UNIT_CODES, UNITS, unitsFor } from '../masters';

describe('units', () => {
  it('bills services in Nos only', () => {
    expect(SERVICE_UNIT_CODES).toEqual(['NOS']);
    expect(unitsFor('service').map((u) => u.code)).toEqual(['NOS']);
  });

  it('offers every unit for goods', () => {
    expect(unitsFor('goods')).toHaveLength(UNITS.length);
  });
});
