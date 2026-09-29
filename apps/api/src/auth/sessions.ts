import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import type { Deps } from '../context';
import { unauthorized } from '../http/errors';
import { randomToken, sha256 } from '../lib/crypto';
import { newId } from '../lib/ids';
import type { DbOrTx } from '../lib/audit';

export type AccessClaims = { sub: string; sid: string; acc: string };
type DeviceInfo = Schema<'DeviceInfo'>;

/**
 * Opens a device session and issues its tokens. The access token is a
 * short-lived JWT; the refresh token is an opaque secret stored only as a
 * hash, bound to this DeviceSession, and rotated on every refresh.
 */
export async function openSession(
  app: FastifyInstance,
  db: DbOrTx,
  deps: Deps,
  user: { id: string; accountId: string },
  device: DeviceInfo | undefined,
  ip: string | undefined,
) {
  const refreshToken = randomToken();
  const sessionId = newId('ses');
  await db.insert(schema.deviceSessions).values({
    id: sessionId,
    userId: user.id,
    label: device?.label?.slice(0, 100) ?? 'Unknown device',
    platform: device?.platform?.slice(0, 40) ?? 'unknown',
    appVersion: device?.appVersion?.slice(0, 20) ?? null,
    ipAddress: ip ?? null,
    refreshTokenHash: sha256(refreshToken),
    refreshExpiresAt: new Date(deps.now().getTime() + deps.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
  });
  return { sessionId, refreshToken, accessToken: signAccess(app, deps, { sub: user.id, sid: sessionId, acc: user.accountId }) };
}

export function signAccess(app: FastifyInstance, deps: Deps, claims: AccessClaims): string {
  return app.jwt.sign(claims, { expiresIn: deps.config.ACCESS_TOKEN_TTL_SECONDS });
}

/** Rotates a refresh token. Reusing an old one revokes the whole session. */
export async function rotateSession(app: FastifyInstance, deps: Deps, refreshToken: string) {
  const hash = sha256(refreshToken);
  const [session] = await deps.db
    .select({ s: schema.deviceSessions, accountId: schema.users.accountId, status: schema.users.status })
    .from(schema.deviceSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.deviceSessions.userId))
    .where(eq(schema.deviceSessions.refreshTokenHash, hash));
  if (!session || session.s.revokedAt || session.s.refreshExpiresAt < deps.now()) {
    throw unauthorized('REFRESH_TOKEN_INVALID', 'Sign in again');
  }
  if (session.status === 'disabled') throw unauthorized('USER_DISABLED');
  const next = randomToken();
  const updated = await deps.db
    .update(schema.deviceSessions)
    .set({ refreshTokenHash: sha256(next), lastActiveAt: deps.now() })
    .where(and(eq(schema.deviceSessions.id, session.s.id), eq(schema.deviceSessions.refreshTokenHash, hash), isNull(schema.deviceSessions.revokedAt)))
    .returning({ id: schema.deviceSessions.id });
  // Lost the race to a concurrent refresh with the same token: treat as reuse.
  if (!updated.length) throw unauthorized('REFRESH_TOKEN_INVALID', 'Sign in again');
  return {
    userId: session.s.userId,
    refreshToken: next,
    accessToken: signAccess(app, deps, { sub: session.s.userId, sid: session.s.id, acc: session.accountId }),
  };
}
