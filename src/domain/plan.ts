import type { PlanTier } from '@/types';

/**
 * What a plan unlocks. Every tier sells and is GST-compliant; the two
 * higher tiers add the buying side of the business and everything that
 * hangs off it. Gating is a question the UI asks — the data model is the
 * same on every tier, so moving between plans never loses a record.
 */
export type ModuleSet = 'sales' | 'full';

export type Module =
  | 'purchases'
  | 'inventory'
  | 'expenses'
  | 'ocr'
  | 'fx'
  | 'branches'
  | 'payables';

export type PlanInfo = {
  key: PlanTier;
  /** Product name. A brand, so it is never translated. */
  name: string;
  monthly: number;
  yearly: number;
  /**
   * Stable feature slugs. The sentences live in `plan:tier.<key>.feature.<slug>`
   * so this module stays free of copy, and a slug reused across tiers still
   * reads differently per tier where the numbers differ.
   */
  features: string[];
  popular?: boolean;
};

export const PLANS: PlanInfo[] = [
  {
    key: 'free',
    name: 'Free',
    monthly: 0,
    yearly: 0,
    features: ['businesses', 'invoiceCap', 'eInvoiceEwb', 'users'],
  },
  {
    key: 'basic',
    name: 'Smart Basic',
    monthly: 399,
    yearly: 3990,
    features: ['businesses', 'invoices', 'eInvoiceEwbGstr1', 'receivables'],
  },
  {
    key: 'pro',
    name: 'Smart Pro',
    monthly: 899,
    yearly: 8990,
    features: ['businesses', 'everythingInBasic', 'purchases', 'stock', 'expenses', 'allReports'],
    popular: true,
  },
  {
    key: 'business',
    name: 'Smart Business',
    monthly: 1799,
    yearly: 17990,
    features: ['businesses', 'everythingInPro', 'roles', 'support', 'backup'],
  },
];

/** The cheapest tier that includes the full module set — the upsell target. */
export const FULL_PLAN: PlanTier = 'pro';

export function planInfo(tier: PlanTier): PlanInfo {
  return PLANS.find((p) => p.key === tier) ?? PLANS[0];
}

export function moduleSetFor(tier: PlanTier): ModuleSet {
  return tier === 'pro' || tier === 'business' ? 'full' : 'sales';
}

export function hasModule(tier: PlanTier, module: Module): boolean {
  void module;
  return moduleSetFor(tier) === 'full';
}

/** Every gateable module, for iterating. Names live in `domain:module.*`. */
export const MODULES: Module[] = [
  'purchases',
  'inventory',
  'expenses',
  'ocr',
  'fx',
  'branches',
  'payables',
];

/** Reports that read the buying side of the books, and the module each needs. */
const FULL_PLAN_REPORTS: Record<string, Module> = {
  'purchase-summary': 'purchases',
  'expense-summary': 'expenses',
  payables: 'payables',
  stock: 'inventory',
  profit: 'expenses',
};

export function moduleForReport(key: string): Module | null {
  return FULL_PLAN_REPORTS[key] ?? null;
}

/**
 * Route prefixes (as `usePathname` reports them, groups stripped) that
 * belong to a module outside the Sales plan. Order matters only in that the
 * first match wins, and none overlap.
 */
const GATED_PATHS: [prefix: string, module: Module][] = [
  ['/purchases', 'purchases'],
  ['/contacts/suppliers', 'purchases'],
  ['/payables', 'payables'],
  ['/payments/made', 'payables'],
  ['/inventory', 'inventory'],
  ['/expenses', 'expenses'],
  ['/settings/expense-categories', 'expenses'],
  ['/ocr', 'ocr'],
  ['/settings/currencies', 'fx'],
  ['/settings/branches', 'branches'],
];

/** The module a route belongs to, or null when every plan can open it. */
export function moduleForPath(pathname: string): Module | null {
  for (const [prefix, module] of GATED_PATHS) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return module;
  }
  const report = /^\/reports\/([^/]+)$/.exec(pathname)?.[1];
  return report ? moduleForReport(report) : null;
}

/**
 * Whether a plan can open an app route. Takes either form the app uses —
 * `/(app)/purchases/bills` or `/purchases/bills` — and ignores any query.
 */
export function canOpen(tier: PlanTier, route: string): boolean {
  const pathname = route.split('?')[0].replace(/\/\([^/)]+\)/g, '') || '/';
  const module = moduleForPath(pathname);
  return !module || hasModule(tier, module);
}
