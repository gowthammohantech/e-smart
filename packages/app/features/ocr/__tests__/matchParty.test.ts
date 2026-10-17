import { isoOrUndefined, matchParty } from '../matchParty';
import { Party } from '@esmart/core/types';

describe('matching a scanned bill to a contact', () => {
  const parties = [
    { id: 's1', name: 'Precision Components Pvt Ltd', taxId: '24AABCP1234F1ZQ' },
    { id: 's2', name: 'Urban Logistics' },
  ] as Party[];

  it('matches by GSTIN, then by name', () => {
    expect(matchParty(parties, { gstin: '24aabcp1234f1zq' })).toBe('s1');
    expect(matchParty(parties, { name: 'URBAN LOGISTICS' })).toBe('s2');
    expect(matchParty(parties, { name: 'Precision Components' })).toBe('s1');
    expect(matchParty(parties, { name: 'Someone Else' })).toBeUndefined();
  });

  it('accepts only ISO dates', () => {
    expect(isoOrUndefined('2026-05-14')).toBe('2026-05-14');
    expect(isoOrUndefined('14/05/2026')).toBeUndefined();
  });
});
