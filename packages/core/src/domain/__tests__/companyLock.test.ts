import { applyProfileLocks, profileLocks } from '../companyLock';
import { Company } from '../../types';

const company = (over: Partial<Company> = {}): Company => ({
  id: 'c',
  accountId: 'a',
  name: 'Acme',
  legalName: 'Acme Pvt Ltd',
  businessType: 'Retail',
  country: 'IN',
  baseCurrency: 'INR',
  address: { line1: '1 Road', city: 'Pune', state: 'Maharashtra', stateCode: '27', postalCode: '411001', country: 'IN' },
  taxRegistration: {
    regime: 'GST',
    identifier: '27AABCV1234F1ZO',
    identifierLabel: 'GSTIN',
    registered: true,
    placeOfSupplyStateCode: '27',
  },
  fiscalYearStartMonth: 4,
  plan: 'pro',
  createdAt: '2026-01-01',
  ...over,
});

describe('business profile lock', () => {
  it('leaves everything editable before any entry is posted', () => {
    expect(Object.values(profileLocks(company(), false)).some(Boolean)).toBe(false);
  });

  it('freezes identity, state and registration after posting', () => {
    const prev = company();
    const next = applyProfileLocks(
      prev,
      company({
        name: 'Acme Traders',
        legalName: 'Other Ltd',
        address: { ...prev.address, line1: '2 Road', state: 'Karnataka', stateCode: '29' },
        taxRegistration: { ...prev.taxRegistration!, registered: false, identifier: '29AAAAA0000A1Z5', placeOfSupplyStateCode: '29' },
        fiscalYearStartMonth: 1,
      }),
      true,
    );
    expect(next.name).toBe('Acme Traders');
    expect(next.address.line1).toBe('2 Road');
    expect(next.legalName).toBe('Acme Pvt Ltd');
    expect(next.address.stateCode).toBe('27');
    expect(next.taxRegistration?.registered).toBe(true);
    expect(next.taxRegistration?.identifier).toBe('27AABCV1234F1ZO');
    expect(next.taxRegistration?.placeOfSupplyStateCode).toBe('27');
    expect(next.fiscalYearStartMonth).toBe(4);
  });

  it('still lets an unregistered business register after posting', () => {
    const prev = company({ taxRegistration: { regime: 'GST', identifierLabel: 'GSTIN', registered: false, placeOfSupplyStateCode: '27' } });
    const next = applyProfileLocks(
      prev,
      company({ taxRegistration: { ...prev.taxRegistration!, registered: true, identifier: '27AABCV1234F1ZO' } }),
      true,
    );
    expect(next.taxRegistration?.registered).toBe(true);
    expect(next.taxRegistration?.identifier).toBe('27AABCV1234F1ZO');
  });
});
