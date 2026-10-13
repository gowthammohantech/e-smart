import { canOpen, hasModule, moduleForPath, moduleSetFor } from '@esmart/core/domain/plan';
import { nextStepRoute, onboardingSteps } from '../store/onboardingStore';
import { expenseCategories } from '@esmart/core/data/masters';
import { company, buildTestBook } from '../__fixtures__/book';
import { migratePersisted } from '../store/appStore';

/** The test book with a second company, as a persisted v3+ state carries it. */
function withTwoCompanies() {
  const book = buildTestBook();
  return { ...book, companies: [...book.companies, company({ id: 'cmp_second', name: 'Second Studio', businessType: 'services' })], expenseCategories: [...expenseCategories('cmp_test'), ...expenseCategories('cmp_second')] } as never as ReturnType<typeof migratePersisted>;
}

// Hoisted above the imports by Jest, so the store gets the mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('plan tiers', () => {
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
    expect(moduleForPath('/purchasesque')).toBeNull();
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
});

describe('onboarding by plan', () => {
  it('skips country and branches on a sales plan', () => {
    expect(onboardingSteps('basic')).toEqual(['business', 'tax', 'numbering']);
    expect(nextStepRoute('business', 'basic')).toBe('/(onboarding)/tax');
    expect(nextStepRoute('numbering', 'basic')).toBe('/(onboarding)/done');
  });

  it('walks every step on a full plan', () => {
    expect(onboardingSteps('pro')).toHaveLength(5);
    expect(nextStepRoute('business', 'pro')).toBe('/(onboarding)/country');
    expect(nextStepRoute('numbering', 'pro')).toBe('/(onboarding)/branches');
  });
});

describe('persist migration from before v3', () => {
  it('drops data saved by a build that still bundled the demo book, and signs out', () => {
    const migrated = migratePersisted({ ...withTwoCompanies(), session: { userId: 'usr_owner', authenticated: true, onboardingComplete: true } }, 2);
    expect(migrated.companies).toEqual([]);
    expect(migrated.documents).toEqual([]);
    expect(migrated.session.authenticated).toBe(false);
  });
});

describe('persist migration to v3', () => {
  it('leaves a v3 state unchanged apart from the v4 business-type step', () => {
    const v3 = withTwoCompanies();
    // v4 rebuilds the companies array, so this is equality, not identity.
    expect(migratePersisted(v3, 3)).toEqual(v3);
  });
});

describe('persist migration to v4', () => {
  it('turns a saved English business-type label into its slug', () => {
    const v3 = withTwoCompanies();
    v3.companies[0].businessType = 'Retail shop';
    v3.companies[1].businessType = 'Restaurant / Café';

    const migrated = migratePersisted(v3, 3);

    expect(migrated.companies[0].businessType).toBe('retail');
    expect(migrated.companies[1].businessType).toBe('restaurant');
  });

  it('leaves a value it does not recognise alone rather than guessing', () => {
    const v3 = withTwoCompanies();
    v3.companies[0].businessType = 'Something a user typed';
    expect(migratePersisted(v3, 3).companies[0].businessType).toBe('Something a user typed');
  });

  it('is a no-op for a company already on slugs', () => {
    const v4 = withTwoCompanies();
    v4.companies[0].businessType = 'wholesale';
    expect(migratePersisted(v4, 4).companies[0].businessType).toBe('wholesale');
  });
});
