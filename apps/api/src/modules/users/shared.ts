import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { openSession } from '../../auth/sessions';
import type { AuthUser, Deps } from '../../context';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { onboardingComplete, userToWire } from '../auth/users';

type UserRow = typeof schema.users.$inferSelect;

/**
 * Issues an AuthSession for `user`, exactly as signIn does: a new device
 * session, the User, and whether onboarding is done.
 */
export async function issueSession(
  req: FastifyRequest,
  deps: Deps,
  now: Date,
  user: UserRow,
  device?: Schema<'DeviceInfo'>,
): Promise<Schema<'AuthSession'>> {
  const tokens = await openSession(req.server, deps.db, deps, user, device, req.ip);
  await deps.db.update(schema.users).set({ lastActiveAt: now }).where(eq(schema.users.id, user.id));
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: deps.config.ACCESS_TOKEN_TTL_SECONDS,
    user: await userToWire(deps.db, { ...user, lastActiveAt: now }),
    onboardingComplete: await onboardingComplete(deps.db, user.id),
  };
}

/**
 * Users belong to the account, but the audit trail and the change log are
 * per company: a change to a user is recorded in every company it touches.
 */
export async function recordUserChange(
  tx: DbOrTx,
  actor: Pick<AuthUser, 'id' | 'name'>,
  companyIds: Iterable<string>,
  change: { action: string; user: UserRow; before?: unknown; after?: unknown; deleted?: boolean },
) {
  for (const companyId of new Set(companyIds)) {
    await recordChange(tx, actor as AuthUser, {
      companyId,
      action: change.action,
      entityType: 'user',
      entityId: change.user.id,
      entityLabel: change.user.name,
      version: change.user.version,
      deleted: change.deleted,
      before: change.before,
      after: change.after,
    });
  }
}

/** Active owners on the account other than `exceptUserId`. */
export async function otherActiveOwners(db: DbOrTx, accountId: string, exceptUserId: string): Promise<number> {
  const U = schema.users;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(U)
    .where(and(eq(U.accountId, accountId), eq(U.role, 'owner'), eq(U.status, 'active'), ne(U.id, exceptUserId)));
  return row?.n ?? 0;
}

/** Signs a user out everywhere. */
export async function revokeAllSessions(db: DbOrTx, userId: string, now: Date) {
  await db
    .update(schema.deviceSessions)
    .set({ revokedAt: now })
    .where(and(eq(schema.deviceSessions.userId, userId), isNull(schema.deviceSessions.revokedAt)));
  await db.delete(schema.pushTokens).where(eq(schema.pushTokens.userId, userId));
}
