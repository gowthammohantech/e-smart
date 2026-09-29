import i18n, { initI18n } from '@/i18n';

describe('i18n init', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('initialises to English and resolves a key', () => {
    initI18n('en');
    expect(i18n.t('common:action.save')).toBe('Save');
  });

  it('translates the same key differently in Tamil', async () => {
    await i18n.changeLanguage('ta');
    expect(i18n.t('common:action.save')).toBe('சேமி');
  });

  it('falls back to English for a key Tamil has not translated', async () => {
    // Drop the Tamil settings bundle to stand in for a not-yet-translated
    // namespace; an un-migrated screen should read English, never a bare key.
    const taSettings = i18n.getResourceBundle('ta', 'settings');
    i18n.removeResourceBundle('ta', 'settings');
    await i18n.changeLanguage('ta');

    expect(i18n.t('settings:language.title')).toBe('Language');

    i18n.addResourceBundle('ta', 'settings', taSettings, true, true);
    expect(i18n.t('settings:language.title')).toBe('மொழி');
  });

  /**
   * Tamil's CLDR plural rule is the same as English — `one` at n = 1 only, and
   * `other` at zero. (It is Hindi and French, not Tamil, that count zero as
   * singular; worth stating because the opposite is a common assumption, and
   * it is the rule to re-check when Hindi is added.)
   *
   * Asserting it here pins the behaviour rather than the assumption: if a
   * plural category ever resolves wrongly, the sentence is wrong in a way no
   * key-parity check can see.
   */
  it('applies the CLDR plural categories, which Tamil shares with English', async () => {
    expect(i18n.t('common:relative.daysAgo', { count: 0 })).toBe('0 days ago');
    expect(i18n.t('common:relative.daysAgo', { count: 1 })).toBe('1 day ago');
    expect(i18n.t('common:relative.daysAgo', { count: 5 })).toBe('5 days ago');

    await i18n.changeLanguage('ta');
    expect(i18n.t('common:relative.daysAgo', { count: 0 })).toBe('0 நாட்களுக்கு முன்');
    expect(i18n.t('common:relative.daysAgo', { count: 1 })).toBe('1 நாளுக்கு முன்');
    expect(i18n.t('common:relative.daysAgo', { count: 5 })).toBe('5 நாட்களுக்கு முன்');
  });

  /**
   * i18next's v4 JSON format resolves plurals through Intl.PluralRules. Node
   * ships it, so this passes here on the engine's own implementation — it
   * proves the plural path is wired up, NOT that Hermes has it. Hermes on iOS
   * has historically shipped Collator/DateTimeFormat/NumberFormat without
   * PluralRules, which is why `intl-pluralrules` is a dependency: it installs
   * itself only when the engine lacks one. Device verification is manual.
   */
  it('has Intl.PluralRules available, with both categories reachable', () => {
    expect(typeof Intl.PluralRules).toBe('function');
    expect(new Intl.PluralRules('ta').select(1)).toBe('one');
    expect(new Intl.PluralRules('ta').select(2)).toBe('other');
  });
});
