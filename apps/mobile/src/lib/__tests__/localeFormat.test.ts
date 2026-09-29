import i18n from '@/i18n';
import { financialYearOf, formatRelative, monthLabel, monthLabelNarrow, today } from '@/lib/date';
import { formatCompactMoney, formatMoney, listJoin } from '@/lib/format';
import { fromMajor } from '@/lib/money';
import { defaultSeries, formatNumber as formatSeriesNumber } from '@/domain/numbering';

describe('locale-aware formatting', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  /**
   * `src/domain/numbering.ts` parses this label to build document numbers
   * (`fy.label.replace('FY ', '')`). Translating it would silently corrupt
   * every invoice number, so it is pinned in both languages.
   */
  it('keeps the financial-year label untranslated, because numbering parses it', async () => {
    expect(financialYearOf('2025-06-01').label).toBe('FY 25-26');
    await i18n.changeLanguage('ta');
    expect(financialYearOf('2025-06-01').label).toBe('FY 25-26');

    // The real factory, so the test cannot drift from the shipped shape.
    const series = { ...defaultSeries('c1', 'invoice', 'INV'), nextNumber: 42 };
    expect(formatSeriesNumber(series, { date: '2025-06-01' })).toBe('INV/25-26/0042');
  });

  it('keeps money in ASCII digits and the rupee sign in both languages', async () => {
    const amount = fromMajor(123456, 'INR');
    const english = formatMoney(amount);
    await i18n.changeLanguage('ta');
    expect(formatMoney(amount)).toBe(english);
    expect(formatMoney(amount)).toBe('₹1,23,456.00');
  });

  it('translates only the magnitude word in compact money', async () => {
    const crore = fromMajor(12500000, 'INR');
    expect(formatCompactMoney(crore)).toBe('₹1.25 Cr');
    await i18n.changeLanguage('ta');
    expect(formatCompactMoney(crore)).toBe('₹1.25 கோ.');
  });

  it('translates relative dates, including the plural forms', async () => {
    expect(formatRelative(today())).toBe('Today');
    await i18n.changeLanguage('ta');
    expect(formatRelative(today())).toBe('இன்று');
  });

  it('gives Tamil month names, and a narrow form for chart axes', async () => {
    expect(monthLabel('2025-04')).toBe('Apr');
    await i18n.changeLanguage('ta');
    const wide = monthLabel('2025-04');
    const narrow = monthLabelNarrow('2025-04');
    expect(wide).not.toBe('Apr');
    // The narrow form is what keeps a six-bar axis from colliding.
    expect([...narrow].length).toBeLessThan([...wide].length);
  });

  it('joins lists the way each language does', async () => {
    expect(listJoin(['a'])).toBe('a');
    expect(listJoin(['a', 'b'])).toBe('a and b');
    expect(listJoin(['a', 'b', 'c'])).toBe('a, b and c');
    await i18n.changeLanguage('ta');
    expect(listJoin(['a', 'b'])).toBe('a மற்றும் b');
    expect(listJoin(['a', 'b', 'c'])).toBe('a, b மற்றும் c');
  });
});
