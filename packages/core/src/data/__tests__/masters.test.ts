import { SERVICE_UNIT_CODES, UNITS, unitsFor } from '../masters';
import { seedItems } from '../seed';

describe('units', () => {
  it('bills services in Nos only', () => {
    expect(SERVICE_UNIT_CODES).toEqual(['NOS']);
    expect(unitsFor('service').map((u) => u.code)).toEqual(['NOS']);
  });

  it('offers every unit for goods', () => {
    expect(unitsFor('goods')).toHaveLength(UNITS.length);
  });

  it('seeds services in Nos', () => {
    seedItems()
      .filter((i) => i.type === 'service')
      .forEach((i) => expect(i.unit).toBe('NOS'));
  });
});
