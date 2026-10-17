import type { BusinessDocument } from '@esmart/core/types';
import { zero } from '@esmart/core/lib/money';
import type { OutstandingDoc } from '@esmart/core/domain/receivables';
import { summarizeAging } from '@esmart/core/domain/receivables';
import i18n from '@esmart/i18n';
import { LANGUAGE_CODES } from '@esmart/i18n/config';
import { greet, LIXI_TABS, LixiContext, lixiSuggestions, tabQuestion } from '../brain';

/**
 * What the app says itself. Every answer comes from the server (remote.ts);
 * these are the greeting, the starter prompts and the held-tab questions.
 */
function contextFor(over: Partial<LixiContext> = {}): LixiContext {
  const currency = 'INR';
  const overdue = { daysOverdue: 12, outstanding: { minor: 500000, currency }, document: { exchangeRate: 1 } as BusinessDocument } as unknown as OutstandingDoc;
  const receivable = [overdue];
  const none: OutstandingDoc[] = [];
  return {
    currency,
    documents: [],
    payments: [],
    expenses: [],
    parties: [],
    receivables: { outstanding: receivable, summary: summarizeAging(receivable, currency) },
    payables: { outstanding: none, summary: summarizeAging(none, currency) },
    lowStock: [{ name: 'A4 paper ream', onHand: 2, unit: 'box' }],
    compliance: { failed: 1, generated: 4, pending: 0, ewbActive: 0, ewbExpiringSoon: 0, ewbExpired: 0, ewbMissing: 0 },
    monthTax: zero(currency),
    userName: 'Asha Rao',
    ...over,
  };
}

describe('Lixi', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('greets by first name and flags what needs attention', () => {
    const text = greet(contextFor()).text;
    expect(text).toMatch(/^Hi Asha, I'm Lixi\./);
    expect(text).toContain('1 item low on stock');
  });

  it('leaves low stock out of the greeting on a plan without inventory', () => {
    expect(greet(contextFor({ plan: 'basic' })).text).not.toContain('low on stock');
  });

  it('offers only the starter prompts the plan covers', () => {
    expect(lixiSuggestions('pro').length).toBeGreaterThan(lixiSuggestions('basic').length);
  });

  it.each(LANGUAGE_CODES)('has a question for every tab you can hold, in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    for (const tab of LIXI_TABS) expect(tabQuestion(tab)).toBeTruthy();
    expect(tabQuestion('no-such-tab')).toBeUndefined();
  });
});
