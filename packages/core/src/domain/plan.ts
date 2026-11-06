import type { PlanTier } from '../types';

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
  | 'payables'
  /** The general ledger: chart of accounts, vouchers, trial balance, P&L, balance sheet. */
  | 'books'
  /** Retail item fields — SKU, barcode, category and brand — on every plan. Fields only: no routes. */
  | 'pos';

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

/**
 * How many people can use one business at once, owner included; null is
 * unlimited. Matches the `users` / `businesses` copy in `plan:tier.*`.
 */
export const USER_LIMITS: Record<PlanTier, number | null> = {
  free: 1,
  basic: 2,
  pro: 6,
  business: null,
};

/** Invoices one business can issue in a calendar month; null is unlimited. Matches `invoiceCap` in `plan:tier.*`. */
export const INVOICE_LIMITS: Record<PlanTier, number | null> = { free: 20, basic: null, pro: null, business: null };

/**
 * AI actions one business can use in a calendar month (India time): Lixi messages plus bill scans
 * read by a network OCR provider. Text the phone reads itself costs nothing and isn't counted. An
 * owner can set a lower monthly budget (companies.ai_monthly_limit), never a higher one.
 */
export const AI_LIMITS: Record<PlanTier, number> = { free: 30, basic: 300, pro: 1500, business: 5000 };

/** This month's AI allowance: the plan's, or the owner's lower budget. */
export function aiLimit(tier: PlanTier, budget?: number | null): number {
  return budget === null || budget === undefined ? AI_LIMITS[tier] : Math.min(budget, AI_LIMITS[tier]);
}

/** The next tier up with no invoice limit. */
export function nextInvoicePlan(tier: PlanTier): PlanTier | null {
  const at = PLANS.findIndex((p) => p.key === tier);
  return PLANS.slice(at + 1).find((p) => INVOICE_LIMITS[p.key] === null)?.key ?? null;
}

export function userLimit(tier: PlanTier): number | null {
  return USER_LIMITS[tier];
}

/** The next tier up that allows more people, or null when `tier` is already unlimited. */
export function nextUserPlan(tier: PlanTier): PlanTier | null {
  const at = PLANS.findIndex((p) => p.key === tier);
  return PLANS.slice(at + 1).find((p) => (USER_LIMITS[p.key] ?? Infinity) > (USER_LIMITS[tier] ?? Infinity))?.key ?? null;
}

/** The cheapest tier that includes the full module set — the upsell target. */
export const FULL_PLAN: PlanTier = 'pro';

export function planInfo(tier: PlanTier): PlanInfo {
  return PLANS.find((p) => p.key === tier) ?? PLANS[0];
}

export function moduleSetFor(tier: PlanTier): ModuleSet {
  return tier === 'pro' || tier === 'business' ? 'full' : 'sales';
}

/** Modules every plan has: they only show or hide fields, so there is nothing to sell. */
const EVERY_PLAN: readonly Module[] = ['pos'];

export function hasModule(tier: PlanTier, module: Module): boolean {
  return EVERY_PLAN.includes(module) || moduleSetFor(tier) === 'full';
}

/** What a module can't work without: payables are the buying side's bills, scanning fills in expenses. */
export const MODULE_DEPENDS: Partial<Record<Module, Module[]>> = { payables: ['purchases'], ocr: ['expenses'] };

/**
 * Whether a module is on for a company: in its plan, not switched off by the owner, and with what it
 * depends on on too. Switching a module off hides it; its records stay, and come back when it is on.
 */
export function moduleEnabled(tier: PlanTier, disabled: readonly Module[] | null | undefined, module: Module): boolean {
  if (!hasModule(tier, module) || disabled?.includes(module)) return false;
  return (MODULE_DEPENDS[module] ?? []).every((d) => moduleEnabled(tier, disabled, d));
}

/** The modules that need this one, which go off with it. */
export function dependentsOf(module: Module): Module[] {
  return (Object.keys(MODULE_DEPENDS) as Module[]).filter((m) => MODULE_DEPENDS[m]!.includes(module));
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
  'books',
  'pos',
];

/** The modules a plan sells (stored in plan_modules), leaving out the field toggles every plan has. */
export const GATED_MODULES = MODULES.filter((m): m is Exclude<Module, 'pos'> => !EVERY_PLAN.includes(m));

/** Reports that read the buying side of the books, and the module each needs. */
const FULL_PLAN_REPORTS: Record<string, Module> = {
  'purchase-summary': 'purchases',
  'expense-summary': 'expenses',
  payables: 'payables',
  stock: 'inventory',
  profit: 'expenses',
  'tds-register': 'payables',
  'tds-payable': 'payables',
  'tds-26q': 'payables',
  'tds-challans': 'payables',
  // The TCS register is the sales side's own (every plan); what is owed and deposited reads the books.
  'tcs-payable': 'books',
  'trial-balance': 'books',
  'msme-payables': 'payables',
};

export function moduleForReport(key: string): Module | null {
  return FULL_PLAN_REPORTS[key] ?? null;
}

/**
 * Route prefixes (as `usePathname` reports them, groups stripped) that
 * belong to a module outside the Sales plan. Order matters only in that the
 * first match wins: a null module opens a path inside a gated prefix.
 */
const GATED_PATHS: [prefix: string, module: Module | null][] = [
  ['/purchases', 'purchases'],
  ['/contacts/suppliers', 'purchases'],
  ['/payables', 'payables'],
  ['/payments/made', 'payables'],
  ['/inventory', 'inventory'],
  ['/expenses', 'expenses'],
  ['/settings/expense-categories', 'expenses'],
  ['/ocr', 'ocr'],
  ['/settings/currencies', 'fx'],
  // Branches opens on every plan: Free has its one branch to name, and adding more is what is locked.
  ['/books', 'books'],
  // Accounts & P&L reads the books.
  ['/accounts', 'books'],
  // Adjusting advances and credit notes against invoices is a payments screen, open like payments
  // (it only sits under /receipts); the supplier side's own screens are gated by payables.
  ['/receipts/adjust', null],
  // Receipts are receipt vouchers.
  ['/receipts', 'books'],
  // Matching 2B needs the purchase register.
  ['/gst/gstr2b', 'purchases'],
  ['/gst/gstr2b-reconciliation', 'purchases'],
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
export function canOpen(tier: PlanTier, route: string, disabled?: readonly Module[] | null): boolean {
  const pathname = route.split('?')[0].replace(/\/\([^/)]+\)/g, '') || '/';
  const module = moduleForPath(pathname);
  return !module || moduleEnabled(tier, disabled, module);
}
