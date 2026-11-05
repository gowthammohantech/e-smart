import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { schema } from '@esmart/db';
import type { AuthUser, Deps } from '../context';
import { ApiError, badRequest, conflict } from '../http/errors';
import type { DbOrTx } from './audit';
import { decrypt, encrypt, sha256 } from './crypto';
import { newRecoveryCodes, newTotpSecret, normalizeRecoveryCode, otpauthUri, verifyTotp } from './totp';

/**
 * Authenticator-app sign-in (TOTP, RFC 6238) with one-time recovery codes, for anyone with a user
 * record: platform operators (who must have it) and business users (who may turn it on). The two
 * differ only in where the events are recorded, so the flow lives here once.
 */

const U = schema.users;
// Wrong codes share the sign-in lockout: five lock the account for 15 minutes, doubling.
const LOCK_AFTER_FAILURES = 5;

export type MfaAction = 'mfa.enrolled' | 'mfa.failed' | 'mfa.verified' | 'mfa.recovery_code_used' | 'mfa.disabled';
/** Records what happened, in the caller's own audit trail. */
export type MfaAudit = (db: DbOrTx, action: MfaAction, reason: string) => Promise<void>;
export type MfaCtx = { db: DbOrTx; user: AuthUser; deps: Deps; now: Date; req: FastifyRequest; reply: FastifyReply };

async function userRow(ctx: Pick<MfaCtx, 'db' | 'user'>) {
  const [row] = await ctx.db.select().from(U).where(eq(U.id, ctx.user.id));
  return row;
}

function status(row: typeof U.$inferSelect, verified: boolean) {
  return { enrolled: !!row.totpEnabledAt, verified, recoveryCodesLeft: row.recoveryCodeHashes?.length ?? 0 };
}

async function markSessionVerified(ctx: MfaCtx) {
  await ctx.db.update(schema.deviceSessions).set({ mfaVerifiedAt: ctx.now }).where(eq(schema.deviceSessions.id, ctx.user.sessionId));
}

function lockedError(ctx: MfaCtx, until: Date) {
  const seconds = Math.max(1, Math.ceil((until.getTime() - ctx.now.getTime()) / 1000));
  void ctx.reply.header('retry-after', String(seconds));
  return new ApiError(429, 'ACCOUNT_LOCKED', `Too many wrong codes. Try again in ${Math.ceil(seconds / 60)} minutes.`, { retryAfterSeconds: seconds });
}

/** Counts a wrong code against the account, and locks it on every fifth, as wrong passwords do. */
async function wrongCode(ctx: MfaCtx, audit: MfaAudit, row: typeof U.$inferSelect): Promise<never> {
  const [after] = await ctx.db
    .update(U)
    .set({
      failedSignInCount: sql`${U.failedSignInCount} + 1`,
      lockedUntil: sql`case when (${U.failedSignInCount} + 1) % ${LOCK_AFTER_FAILURES} = 0
        then ${ctx.now.toISOString()}::timestamptz + least(15 * power(2, (${U.failedSignInCount} + 1) / ${LOCK_AFTER_FAILURES} - 1), 1440) * interval '1 minute'
        else ${U.lockedUntil} end`,
    })
    .where(eq(U.id, row.id))
    .returning({ lockedUntil: U.lockedUntil });
  await audit(ctx.db, 'mfa.failed', 'Wrong authenticator code');
  if (after?.lockedUntil && after.lockedUntil > ctx.now) throw lockedError(ctx, after.lockedUntil);
  throw badRequest('MFA_CODE_INVALID', 'That code is not valid');
}

/**
 * Checks a code from the authenticator, or spends one unused recovery code. A TOTP step only moves
 * forward, so two sessions racing with the same code can't both pass; a recovery code is removed in
 * the statement that checks it.
 */
async function spendCode(ctx: MfaCtx, audit: MfaAudit, row: typeof U.$inferSelect, code: string): Promise<'totp' | 'recovery'> {
  if (/^\s*\d{3}\s?\d{3}\s*$/.test(code)) {
    const secret = decrypt(Buffer.from(row.totpSecretEncrypted!, 'base64'), ctx.deps.config.CREDENTIALS_KEY);
    const step = verifyTotp(secret, code, ctx.now.getTime(), row.totpLastStep);
    if (step === null) return wrongCode(ctx, audit, row);
    const [used] = await ctx.db
      .update(U)
      .set({ totpLastStep: step, failedSignInCount: 0, lockedUntil: null })
      .where(and(eq(U.id, row.id), sql`coalesce(${U.totpLastStep}, -1) < ${step}`))
      .returning({ id: U.id });
    if (!used) return wrongCode(ctx, audit, row);
    return 'totp';
  }
  const hash = sha256(normalizeRecoveryCode(code));
  const [used] = await ctx.db
    .update(U)
    .set({ recoveryCodeHashes: sql`coalesce(${U.recoveryCodeHashes}, '[]'::jsonb) - ${hash}::text`, failedSignInCount: 0, lockedUntil: null })
    .where(and(eq(U.id, row.id), sql`coalesce(${U.recoveryCodeHashes}, '[]'::jsonb) ? ${hash}::text`))
    .returning({ id: U.id });
  if (!used) return wrongCode(ctx, audit, row);
  return 'recovery';
}

export async function mfaStatus(ctx: MfaCtx) {
  return status(await userRow(ctx), ctx.user.mfaVerified);
}

export async function startEnrollment(ctx: MfaCtx, alreadyMessage: string) {
  const row = await userRow(ctx);
  if (row.totpEnabledAt) throw conflict('MFA_ALREADY_ENROLLED', alreadyMessage);
  const secret = newTotpSecret();
  // Pending until confirmed; starting again replaces it.
  await ctx.db
    .update(U)
    .set({ totpSecretEncrypted: encrypt(secret, ctx.deps.config.CREDENTIALS_KEY).toString('base64'), totpLastStep: null, updatedAt: ctx.now })
    .where(and(eq(U.id, row.id), isNull(U.totpEnabledAt)));
  return { secret, otpauthUri: otpauthUri(secret, row.email) };
}

export async function confirmEnrollment(ctx: MfaCtx, audit: MfaAudit, code: string) {
  const row = await userRow(ctx);
  if (row.totpEnabledAt) throw conflict('MFA_ALREADY_ENROLLED', 'An authenticator is already set up');
  if (row.lockedUntil && row.lockedUntil > ctx.now) throw lockedError(ctx, row.lockedUntil);
  if (!row.totpSecretEncrypted) throw badRequest('MFA_NOT_STARTED', 'Start setting up the authenticator first');
  const secret = decrypt(Buffer.from(row.totpSecretEncrypted, 'base64'), ctx.deps.config.CREDENTIALS_KEY);
  const step = verifyTotp(secret, code, ctx.now.getTime(), null);
  if (step === null) return wrongCode(ctx, audit, row);
  const codes = newRecoveryCodes();
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(U)
      .set({ totpEnabledAt: ctx.now, totpLastStep: step, recoveryCodeHashes: codes.map((c) => sha256(normalizeRecoveryCode(c))), failedSignInCount: 0, lockedUntil: null, updatedAt: ctx.now })
      .where(eq(U.id, row.id));
    await tx.update(schema.deviceSessions).set({ mfaVerifiedAt: ctx.now }).where(eq(schema.deviceSessions.id, ctx.user.sessionId));
    await audit(tx, 'mfa.enrolled', 'Set up an authenticator app');
  });
  return { recoveryCodes: codes };
}

export async function verify(ctx: MfaCtx, audit: MfaAudit, code: string) {
  const row = await userRow(ctx);
  if (!row.totpEnabledAt || !row.totpSecretEncrypted) throw conflict('MFA_ENROLLMENT_REQUIRED', 'Set up an authenticator app first');
  if (row.lockedUntil && row.lockedUntil > ctx.now) throw lockedError(ctx, row.lockedUntil);
  const how = await spendCode(ctx, audit, row, code);
  await markSessionVerified(ctx);
  await audit(ctx.db, how === 'totp' ? 'mfa.verified' : 'mfa.recovery_code_used', how === 'totp' ? 'Authenticator code' : 'Recovery code');
  return status(await userRow(ctx), true);
}

/** Turns the authenticator off, on a code from it (or a recovery code), so a stolen session alone can't. */
export async function disable(ctx: MfaCtx, audit: MfaAudit, code: string) {
  const row = await userRow(ctx);
  if (!row.totpEnabledAt || !row.totpSecretEncrypted) throw conflict('MFA_NOT_ENROLLED', 'No authenticator is set up');
  if (row.lockedUntil && row.lockedUntil > ctx.now) throw lockedError(ctx, row.lockedUntil);
  await spendCode(ctx, audit, row, code);
  await ctx.db
    .update(U)
    .set({ totpEnabledAt: null, totpSecretEncrypted: null, totpLastStep: null, recoveryCodeHashes: null, updatedAt: ctx.now })
    .where(eq(U.id, row.id));
  await audit(ctx.db, 'mfa.disabled', 'Turned off the authenticator app');
}
