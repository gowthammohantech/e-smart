import i18n from '@/i18n';
import { expiryPhrase } from '../complianceMeta';

/**
 * A fake translator that echoes the key and its count, so these assert which
 * branch ran rather than what the copy happens to say. The branching is the
 * part that would be expensive to get wrong: an e-way bill's extension window
 * opens eight hours before expiry and closes eight after.
 */
const echo = (key: string, options?: Record<string, unknown>) =>
  options && 'count' in options ? `${key}|${options.count}` : key;

describe('expiryPhrase', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('counts hours while under a day past expiry', () => {
    expect(expiryPhrase(echo, -3)).toBe('compliance:expiry.expiredHours|3');
    expect(expiryPhrase(echo, -23)).toBe('compliance:expiry.expiredHours|23');
  });

  it('never says "expired 0 h ago" for a bill that just lapsed', () => {
    expect(expiryPhrase(echo, -0.2)).toBe('compliance:expiry.expiredHours|1');
  });

  it('switches to days at 24 hours past', () => {
    expect(expiryPhrase(echo, -48)).toBe('compliance:expiry.expiredDays|2');
  });

  it('has a distinct phrase for the last hour', () => {
    expect(expiryPhrase(echo, 0.5)).toBe('compliance:expiry.withinHour');
  });

  it('counts hours, then days, while still valid', () => {
    expect(expiryPhrase(echo, 6)).toBe('compliance:expiry.hoursLeft|6');
    expect(expiryPhrase(echo, 23)).toBe('compliance:expiry.hoursLeft|23');
    expect(expiryPhrase(echo, 25)).toBe('compliance:expiry.daysLeft|1');
    expect(expiryPhrase(echo, 72)).toBe('compliance:expiry.daysLeft|3');
  });

  it('reads as a sentence in both languages', async () => {
    expect(expiryPhrase(i18n.t, 72)).toBe('3 days left');
    expect(expiryPhrase(i18n.t, 25)).toBe('1 day left');

    await i18n.changeLanguage('ta');
    expect(expiryPhrase(i18n.t, 72)).toBe('3 நாட்கள் உள்ளன');
    expect(expiryPhrase(i18n.t, 25)).toBe('1 நாள் உள்ளது');
  });
});
