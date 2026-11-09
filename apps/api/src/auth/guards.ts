import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { schema } from '@esmart/db';
import { FULL_PLAN, hasModule, moduleEnabled, type Module } from '@esmart/core/domain/plan';
import type { AuthUser, CompanyRow, Deps } from '../context';
import { ApiError, forbidden, planUpgradeRequired, unauthorized } from '../http/errors';
import { DEMO_SEED_HEADER, DEMO_SEED_TOKEN } from '../lib/internal';
import type { AccessClaims } from './sessions';

async function loadUser(deps: Deps, claims: AccessClaims): Promise<AuthUser | null> {
  const [row] = await deps.db
    .select({ u: schema.users, revokedAt: schema.deviceSessions.revokedAt, mfaVerifiedAt: schema.deviceSessions.mfaVerifiedAt, suspendedAt: schema.accounts.suspendedAt, isDemo: schema.accounts.isDemo })
    .from(schema.users)
    .innerJoin(schema.deviceSessions, eq(schema.deviceSessions.userId, schema.users.id))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.users.accountId))
    .where(and(eq(schema.users.id, claims.sub), eq(schema.deviceSessions.id, claims.sid)));
  if (!row || row.revokedAt) return null;
  // Suspension revokes every session, so this only catches a token minted in
  // the same instant; it keeps the rule airtight without relying on that.
  if (row.suspendedAt) throw forbidden('ACCOUNT_SUSPENDED', 'This account has been suspended. Contact support.');
  const [companies, branches] = await Promise.all([
    deps.db.select({ id: schema.userCompanies.companyId, role: schema.userCompanies.role }).from(schema.userCompanies).where(eq(schema.userCompanies.userId, row.u.id)),
    deps.db.select({ id: schema.userBranches.branchId }).from(schema.userBranches).where(eq(schema.userBranches.userId, row.u.id)),
  ]);
  return {
    id: row.u.id,
    accountId: row.u.accountId,
    name: row.u.name,
    email: row.u.email,
    role: row.u.role,
    platformRole: row.u.platformRole,
    status: row.u.status,
    locale: row.u.locale,
    companyIds: companies.map((c) => c.id),
    companyRoles: Object.fromEntries(companies.filter((c) => c.role).map((c) => [c.id, c.role!])),
    branchIds: branches.map((b) => b.id),
    sessionId: claims.sid,
    mfaEnrolled: !!row.u.totpEnabledAt,
    mfaVerified: !!row.mfaVerifiedAt,
    demo: row.isDemo,
  };
}

export async function authenticate(app: FastifyInstance, deps: Deps, req: FastifyRequest, required: boolean) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    if (required) throw unauthorized('UNAUTHORIZED', 'Missing bearer token');
    return;
  }
  let claims: AccessClaims;
  try {
    claims = app.jwt.verify<AccessClaims>(header.slice(7));
  } catch (err) {
    if (!required) return;
    const expired = (err as { code?: string }).code === 'FAST_JWT_EXPIRED';
    throw unauthorized(expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID');
  }
  const user = await loadUser(deps, claims);
  if (!user) {
    if (required) throw unauthorized('SESSION_REVOKED', 'This session was signed out');
    return;
  }
  if (user.status === 'disabled') throw forbidden('USER_DISABLED', 'This user has been disabled');
  req.authUser = user;
}

/** The company in a path, if the caller may open it. */
export async function companyFor(deps: Deps, user: AuthUser, companyId: string): Promise<CompanyRow> {
  const [company] = await deps.db.select().from(schema.companies).where(eq(schema.companies.id, companyId));
  // Membership is what grants access. It usually matches the account, but a member invited from another account has no row in their own.
  if (!company || !user.companyIds.includes(companyId)) {
    throw forbidden('COMPANY_ACCESS_DENIED', 'You do not have access to this company');
  }
  if (company.accountId !== user.accountId) {
    // Someone else's business: its account being suspended closes it to its guests too.
    const [owner] = await deps.db.select({ suspendedAt: schema.accounts.suspendedAt }).from(schema.accounts).where(eq(schema.accounts.id, company.accountId));
    if (owner?.suspendedAt) throw forbidden('ACCOUNT_SUSPENDED', 'This business has been suspended. Contact support.');
  }
  return company;
}

/** What every write from the public demo account gets back; the app turns it into a "create your account" prompt. */
export const demoReadOnly = () =>
  new ApiError(403, 'DEMO_READ_ONLY', "This is a demo, so changes aren't saved. Create your free account to keep your own books.");

/**
 * The guard chain, in order, for every contract route:
 * authenticate → company access → role → plan module.
 * Platform routes (`x-platform-roles`) check the platform role instead and
 * never take a company or a tenant role.
 */
export function registerGuards(app: FastifyInstance, deps: Deps) {
  app.decorateRequest('authUser', null);
  app.decorateRequest('company', null);

  app.addHook('preHandler', async (req) => {
    const op = req.routeOptions.config.op;
    if (!op || op.tag === 'Webhooks') return;

    await authenticate(app, deps, req, op.secured);
    const user = req.authUser;
    if (!user) return;

    // The public demo is for looking around: it reads everything and changes nothing, its own profile included.
    if (user.demo && op.method !== 'GET' && !op.demoAllowed && req.headers[DEMO_SEED_HEADER] !== DEMO_SEED_TOKEN) throw demoReadOnly();

    if (op.platformRoles) {
      if (!user.platformRole || !op.platformRoles.includes(user.platformRole)) {
        throw forbidden('PLATFORM_FORBIDDEN', `This needs platform role: ${op.platformRoles.join(', ')}`);
      }
      // A password (or an SMS code) alone never opens another tenant's data.
      if (!op.mfaExempt && !user.mfaEnrolled) throw forbidden('MFA_ENROLLMENT_REQUIRED', 'Set up an authenticator app to continue');
      if (!op.mfaExempt && !user.mfaVerified) throw forbidden('MFA_REQUIRED', 'Enter the code from your authenticator app');
      return;
    }

    // A business user who turned on an authenticator passes it once per session before anything else.
    if (user.mfaEnrolled && !user.mfaVerified && !op.mfaExempt) throw forbidden('MFA_REQUIRED', 'Enter the code from your authenticator app');

    const companyId = (req.params as { companyId?: string }).companyId;
    if (companyId) {
      req.company = await companyFor(deps, user, companyId);
      // Here they act with the role they were given in this business.
      const here = user.companyRoles?.[companyId];
      if (here) user.role = here;
      // Branch limits are per business: limits from another business mean nothing here (none here = all branches).
      if (user.branchIds.length) {
        const here = await deps.db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.companyId, companyId));
        const own = here.filter((b) => user.branchIds.includes(b.id));
        // Listed against every branch is no limit at all: the books, TDS/TCS and the balance sheet
        // open to them as to someone with no branch limits.
        user.branchIds = own.length === here.length ? [] : own.map((b) => b.id);
      }
      // An archived business keeps its books as they were: they can be read and exported, nothing more.
      if (req.company.archivedAt && op.method !== 'GET' && !op.archivedAllowed) {
        throw new ApiError(409, 'COMPANY_ARCHIVED', 'This business is archived, so its books are read-only. An owner can restore it in Settings.');
      }
    }

    if (op.roles && !op.roles.includes(user.role)) {
      throw new ApiError(403, 'ROLE_FORBIDDEN', `This needs one of: ${op.roles.join(', ')}`);
    }

    if (op.planModule && req.company && !hasModule(req.company.plan, op.planModule)) {
      throw planUpgradeRequired(FULL_PLAN, op.planModule);
    }
    // In the plan but switched off by the owner (or something it needs is).
    if (op.planModule && req.company && !moduleEnabled(req.company.plan, req.company.disabledModules as Module[], op.planModule)) {
      throw forbidden('MODULE_OFF', `${op.planModule} is switched off for this business; an owner can switch it on in Settings`);
    }
  });
}

