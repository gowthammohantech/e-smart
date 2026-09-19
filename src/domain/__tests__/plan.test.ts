import { canOpen, hasModule, moduleForPath, moduleSetFor } from '@/domain/plan';
import { nextStepRoute, onboardingSteps } from '@/store/onboardingStore';
import { answer } from '@/features/lixi/brain';
import { isValidGstin } from '@/domain/gstin';
import { buildSeedData, migratePersisted } from '@/store/appStore';

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
    expect(onboardingSteps('basic').map((s) => s.key)).toEqual(['business', 'tax', 'numbering']);
    expect(nextStepRoute('business', 'basic')).toBe('/(onboarding)/tax');
    expect(nextStepRoute('numbering', 'basic')).toBe('/(onboarding)/done');
  });

  it('walks every step on a full plan', () => {
    expect(onboardingSteps('pro')).toHaveLength(5);
    expect(nextStepRoute('business', 'pro')).toBe('/(onboarding)/country');
    expect(nextStepRoute('numbering', 'pro')).toBe('/(onboarding)/branches');
  });
});

describe('Lixi on a sales plan', () => {
  const ctx = (plan: 'basic' | 'pro') => {
    const data = buildSeedData();
    return {
      currency: 'INR',
      documents: [],
      payments: [],
      expenses: data.expenses,
      parties: [],
      receivables: { outstanding: [], summary: { total: { minor: 0, currency: 'INR' } } },
      payables: { outstanding: [], summary: { total: { minor: 0, currency: 'INR' } } },
      lowStock: [{ name: 'Paper', onHand: 1, unit: 'box' }],
      compliance: { failed: 0, generated: 0, pending: 0, ewbActive: 0, ewbExpiringSoon: 0, ewbExpired: 0, ewbMissing: 0 },
      monthTax: { minor: 0, currency: 'INR' },
      plan,
    } as unknown as Parameters<typeof answer>[1];
  };

  it('says stock is not on the plan instead of reading empty books', () => {
    const reply = answer('what is low on stock?', ctx('basic'));
    expect(reply.text).toMatch(/isn't part of Smart Basic/);
    expect(reply.actions?.[0]).toMatchObject({ type: 'route', route: '/(app)/settings/plan' });
  });

  it('will not open a purchase bill on a sales plan', () => {
    expect(answer('create a purchase bill', ctx('basic')).text).toMatch(/isn't part of/);
  });

  it('still answers stock on a full plan', () => {
    expect(answer('what is low on stock?', ctx('pro')).text).toMatch(/reorder level/);
  });
});

describe('persist migration to v3', () => {
  it('puts every existing company on Pro so nothing disappears', () => {
    const v2 = buildSeedData();
    v2.companies = v2.companies.map(({ plan, ...rest }) => {
      void plan;
      return rest as typeof v2.companies[number];
    });
    const migrated = migratePersisted(v2, 2);
    expect(migrated.companies.every((c) => c.plan === 'pro')).toBe(true);
  });

  it('repairs demo GSTINs saved with the old wrong check digit, and leaves others alone', () => {
    const v2 = buildSeedData();
    const stale = (g: string) => `${g.slice(0, 14)}${g[14] === 'Z' ? 'Y' : 'Z'}`;
    v2.companies[0].taxRegistration!.identifier = stale(v2.companies[0].taxRegistration!.identifier!);
    const seeded = v2.parties.find((p) => p.taxId)!;
    seeded.taxId = stale(seeded.taxId!);
    v2.parties.push({ ...seeded, id: 'cus_mine', taxId: '29AAAAA0000A1Z0' });
    delete (v2 as Partial<typeof v2>).transporters;

    const migrated = migratePersisted(v2, 2);
    expect(isValidGstin(migrated.companies[0].taxRegistration?.identifier)).toBe(true);
    expect(isValidGstin(migrated.parties.find((p) => p.id === seeded.id)?.taxId)).toBe(true);
    expect(migrated.parties.find((p) => p.id === 'cus_mine')?.taxId).toBe('29AAAAA0000A1Z0');
    expect(migrated.transporters.length).toBeGreaterThan(0);
  });

  it('leaves a v3 state untouched', () => {
    const v3 = buildSeedData();
    expect(migratePersisted(v3, 3)).toBe(v3);
  });
});
