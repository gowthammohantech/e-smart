/**
 * The product-analytics catalog: every event the API or the apps may send to PostHog, and the
 * only properties each may carry. `sanitize` drops anything not listed here, so amounts, names,
 * GSTINs, emails and document contents can never leave by accident: only IDs (as distinct id or
 * group, never as properties) and categories.
 */

type Spec =
  | { type: 'enum'; values: readonly string[] }
  /** An identifier-like string: no spaces, no '@', no long digit runs, not GSTIN-shaped. */
  | { type: 'token' }
  | { type: 'bool' }
  /** A small whole number (a count, not an amount). */
  | { type: 'count' };

const token: Spec = { type: 'token' };
const bool: Spec = { type: 'bool' };
const count: Spec = { type: 'count' };
const oneOf = (...values: string[]): Spec => ({ type: 'enum', values });

const PLAN = oneOf('free', 'basic', 'pro', 'business');
const SIZE = oneOf('0', '1-10', '11-50', '51-200', '201-1000', '1000+');

/** Properties any event may carry (set by the API or the app wrapper, never from user input). */
const COMMON: Record<string, Spec> = {
  platform: oneOf('ios', 'android', 'web', 'desktop', 'server'),
  appVersion: token,
  build: token,
  source: oneOf('app', 'api', 'webhook', 'admin', 'lixi'),
};

export const ANALYTICS_EVENTS = {
  signed_up: {},
  signed_in: { method: oneOf('password', 'otp', 'invite') },
  signed_out: {},

  onboarding_step_viewed: { step: oneOf('tax', 'business', 'country', 'numbering', 'branches', 'done') },
  business_created: { businessType: token, taxRegime: token, stateCode: token, branchCount: count },
  onboarding_completed: {},

  document_created: { kind: token, isFirst: bool, hasTds: bool, template: token },
  document_finalized: { kind: token },
  document_converted: { fromKind: token, toKind: token },
  document_sent: { kind: token, channel: token },

  expense_created: { hasTax: bool },
  payment_recorded: { direction: oneOf('in', 'out'), mode: token, fromBankLine: bool, allocations: count },

  gst_return_action: { returnType: token, action: oneOf('save', 'offset', 'proceed', 'evc', 'file') },
  gstr2b_imported: {},
  report_viewed: { report: token, format: token },
  bank_statement_imported: { lines: SIZE },

  lixi_message: { model: token, tokens: SIZE, toolUsed: bool },
  lixi_action_confirmed: { action: token },

  checkout_started: { toPlan: PLAN },
  plan_changed: { fromPlan: PLAN, toPlan: PLAN },
  subscription_ended: { plan: PLAN },

  invoice_template_changed: { template: token, scope: oneOf('company', 'document') },
  company_archived: {},
  company_restored: {},
  analytics_opted_out: {},

  demo_started: { via: oneOf('button', 'link') },
} satisfies Record<string, Record<string, Spec>>;

export type AnalyticsEvent = keyof typeof ANALYTICS_EVENTS;

type Value<S> = S extends { type: 'bool' } ? boolean : S extends { type: 'count' } ? number : string;
export type AnalyticsProps<E extends AnalyticsEvent> = {
  [K in keyof (typeof ANALYTICS_EVENTS)[E]]?: Value<(typeof ANALYTICS_EVENTS)[E][K]> | null;
} & { [K in keyof typeof COMMON]?: string };

/** Properties allowed on the company group (PostHog group type `company`). */
export const COMPANY_GROUP_PROPS: Record<string, Spec> = {
  plan: PLAN,
  businessType: token,
  taxRegime: token,
  stateCode: token,
  returnFrequency: token,
  compositionScheme: bool,
  createdAt: token,
  onboardedAt: token,
  archived: bool,
};

/** Properties allowed on the person (the signed-in user). */
export const PERSON_PROPS: Record<string, Spec> = {
  role: token,
  locale: token,
  createdAt: token,
  platform: COMMON.platform!,
};

const GSTIN_SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/i;
const PAN_SHAPE = /^[A-Z]{5}\d{4}[A-Z]$/i;
const TOKEN = /^[A-Za-z0-9_.:\-/[\]()+]{1,80}$/;

function accept(spec: Spec, value: unknown): string | number | boolean | undefined {
  switch (spec.type) {
    case 'bool':
      return typeof value === 'boolean' ? value : undefined;
    case 'count':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100_000 ? value : undefined;
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value) ? value : undefined;
    case 'token':
      if (typeof value !== 'string' || !TOKEN.test(value)) return undefined;
      if (/\d{7,}/.test(value) || GSTIN_SHAPE.test(value) || PAN_SHAPE.test(value)) return undefined;
      return value;
  }
}

function pick(specs: Record<string, Spec>, props: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    const spec = specs[key];
    if (!spec || value === undefined || value === null) continue;
    const ok = accept(spec, value);
    if (ok !== undefined) out[key] = ok;
  }
  return out;
}

/** Only the catalog's keys, with values of the declared type; everything else is dropped. */
export function sanitize(event: string, props?: Record<string, unknown>): Record<string, string | number | boolean> {
  const specs = (ANALYTICS_EVENTS as Record<string, Record<string, Spec>>)[event];
  if (!specs) return {};
  return pick({ ...COMMON, ...specs }, props);
}

export const sanitizeCompany = (props?: Record<string, unknown>) => pick(COMPANY_GROUP_PROPS, props);
export const sanitizePerson = (props?: Record<string, unknown>) => pick(PERSON_PROPS, props);

export const isAnalyticsEvent = (event: string): event is AnalyticsEvent => event in ANALYTICS_EVENTS;

/** A count as a coarse bucket, so sizes can be compared without exact numbers. */
export function sizeBucket(n: number): '0' | '1-10' | '11-50' | '51-200' | '201-1000' | '1000+' {
  if (n <= 0) return '0';
  if (n <= 10) return '1-10';
  if (n <= 50) return '11-50';
  if (n <= 200) return '51-200';
  if (n <= 1000) return '201-1000';
  return '1000+';
}

/** A route as its pattern, never its real IDs: `/documents/9f2c…` → `/documents/[id]`. */
export function routePattern(segments: readonly string[]): string {
  const parts = segments.filter((s) => !/^\(.*\)$/.test(s));
  return '/' + parts.join('/');
}
