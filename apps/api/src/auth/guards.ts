import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { schema } from '@esmart/db';
import { FULL_PLAN, hasModule } from '@esmart/core/domain/plan';
import type { AuthUser, CompanyRow, Deps } from '../context';
import { ApiError, forbidden, planUpgradeRequired, unauthorized } from '../http/errors';
import type { AccessClaims } from './sessions';

async function loadUser(deps: Deps, claims: AccessClaims): Promise<AuthUser | null> {
  const [row] = await deps.db
    .select({ u: schema.users, revokedAt: schema.deviceSessions.revokedAt, suspendedAt: schema.accounts.suspendedAt })
    .from(schema.users)
    .innerJoin(schema.deviceSessions, eq(schema.deviceSessions.userId, schema.users.id))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.users.accountId))
    .where(and(eq(schema.users.id, claims.sub), eq(schema.deviceSessions.id, claims.sid)));
  if (!row || row.revokedAt) return null;
  // Suspension revokes every session, so this only catches a token minted in
  // the same instant; it keeps the rule airtight without relying on that.
  if (row.suspendedAt) throw forbidden('ACCOUNT_SUSPENDED', 'This account has been suspended. Contact support.');
  const [companies, branches] = await Promise.all([
    deps.db.select({ id: schema.userCompanies.companyId }).from(schema.userCompanies).where(eq(schema.userCompanies.userId, row.u.id)),
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
    branchIds: branches.map((b) => b.id),
    sessionId: claims.sid,
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
  if (!company || company.accountId !== user.accountId || !user.companyIds.includes(companyId)) {
    throw forbidden('COMPANY_ACCESS_DENIED', 'You do not have access to this company');
  }
  return company;
}

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

    if (op.platformRoles) {
      if (!user.platformRole || !op.platformRoles.includes(user.platformRole)) {
        throw forbidden('PLATFORM_FORBIDDEN', `This needs platform role: ${op.platformRoles.join(', ')}`);
      }
      return;
    }

    const companyId = (req.params as { companyId?: string }).companyId;
    if (companyId) req.company = await companyFor(deps, user, companyId);

    if (op.roles && !op.roles.includes(user.role)) {
      throw new ApiError(403, 'ROLE_FORBIDDEN', `This needs one of: ${op.roles.join(', ')}`);
    }

    if (op.planModule && req.company && !hasModule(req.company.plan, op.planModule)) {
      throw planUpgradeRequired(FULL_PLAN, op.planModule);
    }
  });
}

