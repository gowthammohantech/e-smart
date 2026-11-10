import { eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import {
  sanitize,
  sanitizeCompany,
  sanitizePerson,
  type AnalyticsEvent,
  type AnalyticsProps,
} from '@esmart/core/analytics/events';
import type { AuthUser, CompanyRow, Deps } from '../context';
import type { FastifyRequest } from 'fastify';
import { APP_VERSION_HEADER, WEB_CLIENT } from '../http/appVersion';
import { DEMO_SEED_HEADER } from '../lib/internal';

/** Who an event is about: the request's user, or a user row at sign-in. */
export type TrackUser = Pick<AuthUser, 'id' | 'role' | 'locale' | 'demo' | 'analyticsOptOut' | 'createdAt'>;

/** What `track` needs from a handler's ctx (or a webhook's). */
type TrackCtx = {
  deps: Deps;
  req?: FastifyRequest;
  readonly maybeUser?: AuthUser | null;
};

function header(req: FastifyRequest | undefined, name: string): string | undefined {
  const raw = req?.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Who sent the request: the app's version header, or the server itself. */
function clientProps(req: FastifyRequest | undefined) {
  const version = header(req, APP_VERSION_HEADER);
  if (!version) return { source: 'api' };
  if (version === WEB_CLIENT) return { source: 'app', platform: 'web' };
  return { source: 'app', appVersion: version };
}

/** No analytics for the demo, its seeding, or anyone who turned "Share usage data" off. */
function silent(user: TrackUser | null | undefined, req?: FastifyRequest): user is null | undefined {
  if (!user || user.demo || user.analyticsOptOut) return true;
  return !!req && header(req, DEMO_SEED_HEADER) !== undefined;
}

/**
 * Sends one product-analytics event about the signed-in caller, tied to their business. Properties
 * outside the catalog in @esmart/core/analytics/events are dropped. Never throws: analytics must
 * not fail a request.
 */
export function track<E extends AnalyticsEvent>(ctx: TrackCtx, event: E, props: AnalyticsProps<E> = {}, opts: { company?: CompanyRow | null; user?: TrackUser } = {}) {
  try {
    const user = opts.user ?? ctx.maybeUser;
    if (silent(user, ctx.req)) return;
    const company = opts.company ?? ctx.req?.company ?? null;
    ctx.deps.providers.analytics.capture({
      distinctId: user.id,
      event,
      properties: { ...sanitize(event, { ...clientProps(ctx.req), ...props }), ...(event === 'signed_up' || event === 'signed_in' ? personSet(user) : {}) },
      ...(company ? { groups: { company: company.id } } : {}),
    });
  } catch {
    // Analytics never takes a request down.
  }
}

function personSet(user: TrackUser) {
  return { $set: sanitizePerson({ role: user.role, locale: user.locale, createdAt: user.createdAt?.toISOString() }) };
}

/** The business's properties on its PostHog group: plan, type, regime, never its name or GSTIN. */
export function identifyCompany(ctx: TrackCtx, company: CompanyRow | null | undefined) {
  try {
    if (!company) return;
    if (ctx.maybeUser !== undefined && silent(ctx.maybeUser, ctx.req)) return;
    ctx.deps.providers.analytics.groupIdentify({
      groupType: 'company',
      groupKey: company.id,
      properties: sanitizeCompany({
        plan: company.plan,
        businessType: company.businessType,
        taxRegime: company.taxRegime,
        stateCode: company.addressStateCode,
        returnFrequency: company.returnFrequency,
        compositionScheme: company.compositionScheme,
        createdAt: company.createdAt?.toISOString(),
        onboardedAt: company.onboardingCompletedAt?.toISOString(),
        archived: !!company.archivedAt,
      }),
    });
  } catch {
    // Analytics never takes a request down.
  }
}

/**
 * For events with no signed-in caller (payment-gateway webhooks, background work): attributes them
 * to the business's owner, unless that owner opted out or the business is the demo's.
 */
export async function trackForCompany<E extends AnalyticsEvent>(deps: Deps, companyId: string, event: E, props: AnalyticsProps<E> = {}, source: 'webhook' | 'admin' = 'webhook') {
  try {
    const [row] = await deps.db
      .select({ company: schema.companies, userId: schema.users.id, optOut: schema.users.analyticsOptOut, isDemo: schema.accounts.isDemo })
      .from(schema.companies)
      .innerJoin(schema.accounts, eq(schema.accounts.id, schema.companies.accountId))
      .innerJoin(schema.users, eq(schema.users.id, schema.accounts.ownerUserId))
      .where(eq(schema.companies.id, companyId));
    if (!row || row.optOut || row.isDemo) return;
    deps.providers.analytics.capture({ distinctId: row.userId, event, properties: sanitize(event, { ...props, source, platform: 'server' }), groups: { company: companyId } });
    identifyCompany({ deps }, row.company);
  } catch {
    // Analytics never takes a webhook down.
  }
}
