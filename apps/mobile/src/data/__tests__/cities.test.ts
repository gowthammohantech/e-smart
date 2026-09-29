import { CITIES_BY_STATE, allCities, citiesForState } from '@/data/cities';
import { INDIAN_STATES } from '@/data/masters';

describe('city master', () => {
  it('covers exactly the states the state picker offers', () => {
    expect(Object.keys(CITIES_BY_STATE).sort()).toEqual(INDIAN_STATES.map((s) => s.code).sort());
    for (const s of INDIAN_STATES) expect(citiesForState(s.code).length).toBeGreaterThan(0);
  });

  it('keeps each state sorted and free of duplicates', () => {
    for (const [code, cities] of Object.entries(CITIES_BY_STATE)) {
      expect({ code, cities }).toEqual({ code, cities: [...cities].sort((a, b) => a.localeCompare(b)) });
      expect(new Set(cities).size).toBe(cities.length);
    }
  });

  it('returns nothing without a state, and everything from allCities', () => {
    expect(citiesForState(undefined)).toEqual([]);
    expect(citiesForState('')).toEqual([]);
    const total = Object.values(CITIES_BY_STATE).reduce((n, list) => n + list.length, 0);
    expect(allCities()).toHaveLength(total);
  });
});
