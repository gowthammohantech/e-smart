import { approvalKindAvailable, canOpen, hasModule, moduleForPath, moduleSetFor } from '@esmart/core/domain/plan';
import { nextStepRoute, onboardingSteps } from '../store/onboardingStore';

// Hoisted above the imports by Jest, so the store gets the mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('plan tiers', () => {
  it('offers approval rules only for kinds whose module is on', () => {
    for (const kind of ['purchaseOrder', 'purchaseBill', 'supplierDebitNote', 'payment']) {
      expect(approvalKindAvailable('basic', [], kind)).toBe(false);
      expect(approvalKindAvailable('free', [], kind)).toBe(false);
      expect(approvalKindAvailable('pro', [], kind)).toBe(true);
    }
    expect(approvalKindAvailable('basic', [], 'invoice')).toBe(true);
    expect(approvalKindAvailable('pro', ['purchases'], 'purchaseBill')).toBe(false);
    // Payments made are the payables side, which goes off with purchases.
    expect(approvalKindAvailable('pro', ['purchases'], 'payment')).toBe(false);
    expect(approvalKindAvailable('pro', ['payables'], 'purchaseBill')).toBe(true);
  });

  it('gives Free and Basic the sales set, Pro and Business the full one', () => {
    expect(moduleSetFor('free')).toBe('sales');
    expect(moduleSetFor('basic')).toBe('sales');
    expect(moduleSetFor('pro')).toBe('full');
    expect(moduleSetFor('business')).toBe('full');
    expect(hasModule('basic', 'purchases')).toBe(false);
    expect(hasModule('pro', 'inventory')).toBe(true);
  });

  it('maps full-plan routes to their module, groups and all', () => {
    expect(moduleForPath('/purchases/bills/new')).toBe('purchases');
    expect(moduleForPath('/contacts/suppliers/sup_1')).toBe('purchases');
    expect(moduleForPath('/inventory')).toBe('inventory');
    expect(moduleForPath('/payments/made')).toBe('payables');
    expect(moduleForPath('/reports/stock')).toBe('inventory');
    expect(moduleForPath('/reports/profit')).toBe('expenses');
    expect(moduleForPath('/gst/gstr2b')).toBe('purchases');
    expect(moduleForPath('/gst/gstr2b-reconciliation')).toBe('purchases');
    expect(moduleForPath('/purchasesque')).toBeNull();
    expect(moduleForPath('/gst/utilization')).toBe('books');
    expect(moduleForPath('/gst/challan')).toBe('books');
    expect(moduleForPath('/gst/journal')).toBe('books');
    expect(moduleForPath('/books/transfer')).toBe('books');
    expect(moduleForPath('/receipts')).toBe('books');
    // Adjusting advances sits under /receipts but is a payments screen, open like payments.
    expect(moduleForPath('/receipts/adjust')).toBeNull();
  });

  it('keeps selling, GST and sales reports open on every tier', () => {
    const everywhere = [
      '/(app)/sales/invoices/new',
      '/(app)/contacts/customers/new',
      '/(app)/compliance',
      '/(app)/gst/gstr1',
      '/(app)/settings/transporters',
      '/(app)/reports/sales-summary',
      '/(app)/reports/tax-summary',
      '/(app)/payments/new?direction=received',
      '/(app)/receipts/adjust?partyId=p_1',
      '/(app)/(tabs)/gst',
    ];
    everywhere.forEach((route) => expect(canOpen('free', route)).toBe(true));
  });

  it('closes the buying side to the sales tiers only', () => {
    expect(canOpen('basic', '/(app)/purchases/bills/new')).toBe(false);
    expect(canOpen('basic', '/(app)/(tabs)/inventory')).toBe(false);
    expect(canOpen('basic', '/(app)/expenses/new')).toBe(false);
    expect(canOpen('pro', '/(app)/purchases/bills/new')).toBe(true);
  });

  it('hides a module\'s own settings pages when the owner switches it off, on any plan', () => {
    for (const plan of ['free', 'pro'] as const) {
      // Retail item fields off: no item categories or brands to keep.
      expect(canOpen(plan, '/settings/item-categories', ['pos'])).toBe(false);
      expect(canOpen(plan, '/(app)/settings/brands', ['pos'])).toBe(false);
      expect(canOpen(plan, '/settings/currencies', ['pos'])).toBe(true);
      // Multi-currency off: no currencies and rates.
      expect(canOpen(plan, '/settings/currencies', ['fx'])).toBe(false);
      expect(canOpen(plan, '/settings/item-categories', ['fx'])).toBe(true);
      // Branches off: no branches page.
      expect(canOpen(plan, '/settings/branches', ['branches'])).toBe(false);
      expect(canOpen(plan, '/settings/branches', ['fx'])).toBe(true);
    }
    expect(canOpen('free', '/settings/branches', [])).toBe(true);
    // Left on, they open on every plan: a Free customer can still be billed in their currency.
    expect(canOpen('free', '/settings/currencies', [])).toBe(true);
    expect(canOpen('basic', '/settings/brands')).toBe(true);
  });
});

describe('onboarding by plan', () => {
  it('walks business, tax and numbering on every plan, as India and one location are the defaults', () => {
    for (const plan of ['basic', 'pro', 'business'] as const) {
      expect(onboardingSteps(plan)).toEqual(['tax', 'business', 'numbering']);
      expect(nextStepRoute('tax', plan)).toBe('/(onboarding)/business');
      expect(nextStepRoute('numbering', plan)).toBe('/(onboarding)/done');
    }
  });
});
