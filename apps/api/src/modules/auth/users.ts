import { eq, inArray } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import type { DbOrTx } from '../../lib/audit';
import { compact, iso } from '../../lib/wire';

type UserRow = typeof schema.users.$inferSelect;

/** Colours the prototype assigns to avatars, in rotation. */
export const AVATAR_COLORS = ['#4DA3FF', '#34C88A', '#F0B429', '#FF6B6B', '#C77DFF', '#00C2C7', '#FF9F45', '#7AA2F7'];

export function avatarColorFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** The User wire shape, with the companies and branches the user can reach. */
export async function userToWire(db: DbOrTx, row: UserRow): Promise<Schema<'User'>> {
  const [companies, branches] = await Promise.all([
    db.select({ id: schema.userCompanies.companyId }).from(schema.userCompanies).where(eq(schema.userCompanies.userId, row.id)),
    db.select({ id: schema.userBranches.branchId }).from(schema.userBranches).where(eq(schema.userBranches.userId, row.id)),
  ]);
  return compact({
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    companyIds: companies.map((c) => c.id),
    branchIds: branches.map((b) => b.id),
    avatarColor: row.avatarColor,
    status: row.status,
    lastActiveAt: iso(row.lastActiveAt),
  });
}

/**
 * Onboarding (setting up a business) is for someone with no business of their
 * own to run. Anyone given access to a business, in any role, goes straight
 * in; so does an owner whose business finished setup. Only a person with no
 * business, or an owner partway through setting theirs up, sees onboarding.
 */
export async function onboardingComplete(db: DbOrTx, userId: string): Promise<boolean> {
  const rows = await db
    .select({ onboarded: schema.companies.onboardingCompletedAt, owner: schema.accounts.ownerUserId })
    .from(schema.companies)
    .innerJoin(schema.userCompanies, eq(schema.userCompanies.companyId, schema.companies.id))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.companies.accountId))
    .where(eq(schema.userCompanies.userId, userId));
  return rows.some((r) => r.onboarded !== null || r.owner !== userId);
}

export async function findUsers(db: DbOrTx, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(schema.users).where(inArray(schema.users.id, ids));
}
