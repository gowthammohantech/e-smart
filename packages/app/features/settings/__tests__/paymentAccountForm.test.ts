import type { PaymentAccount } from '@esmart/core/types';
import { paymentAccountFromForm } from '../paymentAccountForm';

const usd: PaymentAccount = {
  id: 'pac_1',
  companyId: 'co_1',
  name: 'Wise USD',
  type: 'bank',
  currency: 'USD',
  openingBalance: { minor: 50_000, currency: 'USD' },
  openingRate: 83.5,
  isDefault: false,
};

describe('paymentAccountFromForm', () => {
  it('keeps a foreign-currency account in its currency when it is saved again', () => {
    const saved = paymentAccountFromForm(usd, { name: 'Wise USD ', type: 'bank', currency: usd.currency, accountNumber: '', openingBalance: '500', isDefault: false }, { id: usd.id, companyId: usd.companyId });
    expect(saved.currency).toBe('USD');
    expect(saved.openingBalance).toEqual({ minor: 50_000, currency: 'USD' });
    expect(saved.name).toBe('Wise USD');
    expect(saved.accountNumber).toBeUndefined();
  });

  it('makes a new account in the currency picked', () => {
    const blank = { id: '', companyId: 'co_1', name: '', type: 'bank', currency: 'INR', openingBalance: { minor: 0, currency: 'INR' }, isDefault: false } as PaymentAccount;
    const saved = paymentAccountFromForm(blank, { name: 'EUR account', type: 'bank', currency: 'EUR', accountNumber: ' DE89 ', openingBalance: '12.5', isDefault: true }, { id: 'acc_new', companyId: 'co_1' });
    expect(saved).toMatchObject({ id: 'acc_new', currency: 'EUR', openingBalance: { minor: 1250, currency: 'EUR' }, accountNumber: 'DE89', isDefault: true });
  });
});
