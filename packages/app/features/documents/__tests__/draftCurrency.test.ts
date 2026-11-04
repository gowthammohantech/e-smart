import { money } from '@esmart/core/lib/money';
import { emptyDraft, inCurrency, reprice } from '../useDocumentDraft';

const line = (minor: number, currency: string) => ({
  id: 'ln_1',
  name: 'Cable Tie',
  quantity: 1,
  unit: 'BOX',
  unitPrice: money(minor, currency),
  discountMode: 'amount' as const,
  discountValue: 10,
  taxCategoryId: 'tax_18',
  taxRate: 18,
  taxInclusive: false,
});

describe('a draft in another currency', () => {
  it('converts an item priced in base into the document currency', () => {
    expect(reprice(money(12000, 'INR'), 'USD', 1, 80)).toEqual(money(150, 'USD'));
  });

  it('moves every amount into a foreign customer’s currency, as the server requires', () => {
    const d = inCurrency({ ...emptyDraft('INR', 'invoice'), lines: [line(12000, 'INR')] }, 'USD', 80);
    expect(d.currency).toBe('USD');
    expect(d.exchangeRate).toBe(80);
    expect(d.charges.currency).toBe('USD');
    expect(d.lines[0].unitPrice).toEqual(money(150, 'USD'));
    expect(d.lines[0].discountValue).toBe(0.13);
    expect(d.applyRoundOff).toBe(false);
  });

  it('converts back to base through the document rate', () => {
    const usd = inCurrency({ ...emptyDraft('INR', 'invoice'), lines: [line(12000, 'INR')] }, 'USD', 80);
    const back = inCurrency(usd, 'INR', 1);
    expect(back.lines[0].unitPrice).toEqual(money(12000, 'INR'));
    expect(back.charges.currency).toBe('INR');
  });

  it('leaves a line already in the document currency alone', () => {
    const d = inCurrency({ ...emptyDraft('INR', 'invoice'), lines: [line(150, 'USD')] }, 'USD', 80);
    expect(d.lines[0].unitPrice).toEqual(money(150, 'USD'));
  });
});
