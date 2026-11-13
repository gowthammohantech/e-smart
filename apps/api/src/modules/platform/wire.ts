import { count, eq, inArray, max, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import type { Config } from '../../config';
import type { DbOrTx } from '../../lib/audit';
import { gspAvailability } from '../../providers/gsp/availability';
import { resolveGspGateway } from '../../providers/gsp/provider-name';
import { parseGspGateway } from '../../providers/gsp/router';

type AccountRow = typeof schema.accounts.$inferSelect;
type CompanyRow = typeof schema.companies.$inferSelect;
type UserRow = typeof schema.users.$inferSelect;
type PlanTier = Schema<'PlanTier'>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function companyToPlatform(c: CompanyRow, subscriptionStatus: Schema<'PlatformCompany'>['subscriptionStatus'] = 'none'): Schema<'PlatformCompany'> {
  return {
    id: c.id,
    accountId: c.accountId,
    name: c.name,
    legalName: c.legalName,
    country: c.country,
    city: c.addressCity,
    taxIdentifier: c.taxIdentifier,
    plan: c.plan,
    subscriptionStatus,
    onboardingCompletedAt: iso(c.onboardingCompletedAt),
    gspProvider: parseGspGateway(c.gspProvider) ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

/** The deployment's default gateway: what a company with no choice of its own files through. */
export const defaultGspGateway = (config: Config) => resolveGspGateway(config.TAXATION_TAXPAYER_PROVIDER, config.TAXATION_GSP_PROVIDER_CODE);

/** Which gateway a company files through, why, and which the deployment could offer instead. */
export function gspToPlatform(config: Config, c: CompanyRow): Schema<'PlatformGsp'> {
  const override = parseGspGateway(c.gspProvider) ?? null;
  const fallback = defaultGspGateway(config);
  return {
    override,
    default: fallback,
    effective: override ?? fallback,
    simulated: config.COMPLIANCE_PROVIDER !== 'gsp',
    options: gspAvailability(config).map((o) => ({ gateway: o.gateway, available: o.available, sandboxOnly: o.sandboxOnly, reason: o.reason ?? null })),
  };
}

export function userToPlatform(u: UserRow, account: { name: string; suspendedAt: Date | null }): Schema<'PlatformUser'> {
  return {
    id: u.id,
    accountId: u.accountId,
    accountName: account.name,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    platformRole: u.platformRole,
    status: u.status,
    accountSuspended: account.suspendedAt !== null,
    lastActiveAt: iso(u.lastActiveAt),
    createdAt: u.createdAt.toISOString(),
  };
}

/** Accounts as operators see them, with company, user and plan rollups. */
export async function accountsToPlatform(db: DbOrTx, accounts: AccountRow[]): Promise<Schema<'PlatformAccount'>[]> {
  if (!accounts.length) return [];
  const ids = accounts.map((a) => a.id);
  const ownerIds = accounts.map((a) => a.ownerUserId).filter((id): id is string => id !== null);
  const C = schema.companies;
  const U = schema.users;
  const [companies, users, owners] = await Promise.all([
    db
      .select({ accountId: C.accountId, companies: count(), plans: sql<PlanTier[]>`array_agg(distinct ${C.plan}::text)` })
      .from(C)
      .where(inArray(C.accountId, ids))
      .groupBy(C.accountId),
    db
      .select({ accountId: U.accountId, users: count(), lastActiveAt: max(U.lastActiveAt) })
      .from(U)
      .where(inArray(U.accountId, ids))
      .groupBy(U.accountId),
    ownerIds.length ? db.select({ id: U.id, name: U.name, email: U.email }).from(U).where(inArray(U.id, ownerIds)) : [],
  ]);
  const byAccount = <T extends { accountId: string }>(rows: T[]) => new Map(rows.map((r) => [r.accountId, r]));
  const companyStats = byAccount(companies);
  const userStats = byAccount(users);
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  return accounts.map((a) => {
    const owner = a.ownerUserId ? ownerById.get(a.ownerUserId) : undefined;
    const lastActive = userStats.get(a.id)?.lastActiveAt;
    return {
      id: a.id,
      name: a.name,
      ownerUserId: a.ownerUserId,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      status: a.suspendedAt ? 'suspended' : 'active',
      suspendedAt: iso(a.suspendedAt),
      suspendedReason: a.suspendedReason,
      companyCount: companyStats.get(a.id)?.companies ?? 0,
      userCount: userStats.get(a.id)?.users ?? 0,
      plans: companyStats.get(a.id)?.plans ?? [],
      lastActiveAt: lastActive ? new Date(lastActive).toISOString() : null,
      createdAt: a.createdAt.toISOString(),
    };
  });
}

export async function subscriptionStatuses(db: DbOrTx, companyIds: string[]) {
  if (!companyIds.length) return new Map<string, Schema<'PlatformCompany'>['subscriptionStatus']>();
  const S = schema.subscriptions;
  const rows = await db.select({ companyId: S.companyId, status: S.status }).from(S).where(inArray(S.companyId, companyIds));
  return new Map(rows.map((r) => [r.companyId, r.status]));
}

export async function accountRow(db: DbOrTx, accountId: string) {
  const [row] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
  return row;
}
