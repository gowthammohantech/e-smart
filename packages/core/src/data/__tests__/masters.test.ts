import { SERVICE_UNIT_CODES, UNITS, qtyWithUnit, unitShortName, unitsFor } from '../masters';
import { partyTcsSection } from '../tcsSections';

describe('units', () => {
  it('bills services in Nos only', () => {
    expect(SERVICE_UNIT_CODES).toEqual(['NOS']);
    expect(unitsFor('service').map((u) => u.code)).toEqual(['NOS']);
  });

  it('offers every unit for goods', () => {
    expect(unitsFor('goods')).toHaveLength(UNITS.length);
  });

  it('gives every unit a short name to print quantities with', () => {
    expect(UNITS.every((u) => !!u.shortName)).toBe(true);
    expect(unitShortName('NOS')).toBe('Nos');
    expect(unitShortName('kg')).toBe('Kg');
    expect(qtyWithUnit(5, 'NOS')).toBe('5 Nos');
    // A unit we don't know prints as its code; none prints the bare number.
    expect(qtyWithUnit(2, 'DOZ')).toBe('2 DOZ');
    expect(qtyWithUnit(2, undefined)).toBe('2');
  });
});

describe('a customer\'s TCS section', () => {
  it('applies only while TCS is on and the section is known', () => {
    expect(partyTcsSection({ tcsApplicable: true, tcsSection: 'scrap' })).toBe('scrap');
    expect(partyTcsSection({ tcsApplicable: false, tcsSection: 'scrap' })).toBeUndefined();
    expect(partyTcsSection({ tcsApplicable: true, tcsSection: 'bogus' })).toBeUndefined();
    expect(partyTcsSection(undefined)).toBeUndefined();
  });
});
