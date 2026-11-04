import { and, eq, isNull, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { defineHandlers, type Ctx } from '../../context';
import { ApiError, badRequest, conflict } from '../../http/errors';
import { decrypt, encrypt, sha256 } from '../../lib/crypto';
import { newRecoveryCodes, newTotpSecret, normalizeRecoveryCode, otpauthUri, verifyTotp } from '../../lib/totp';
import { recordPlatformAction } from './audit';

const U = schema.users;
// Wrong codes share the sign-in lockout: five lock the account for 15 minutes, doubling.
const LOCK_AFTER_FAILURES = 5;

type MfaCtx = Ctx<'verifyMfa'>;

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
async function wrongCode(ctx: MfaCtx, row: typeof U.$inferSelect): Promise<never> {
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
  await recordPlatformAction(ctx.db, ctx.user, ctx.req, { action: 'mfa.failed', target: self(ctx), reason: 'Wrong authenticator code' });
  if (after?.lockedUntil && after.lockedUntil > ctx.now) throw lockedError(ctx, after.lockedUntil);
  throw badRequest('MFA_CODE_INVALID', 'That code is not valid');
}

const self = (ctx: Pick<MfaCtx, 'user'>) => ({ type: 'user' as const, id: ctx.user.id, label: ctx.user.email });

export const mfaHandlers = defineHandlers({
  async getMfaStatus(ctx) {
    return status(await userRow(ctx), ctx.user.mfaVerified);
  },

  async startMfaEnrollment(ctx) {
    const row = await userRow(ctx);
    if (row.totpEnabledAt) throw conflict('MFA_ALREADY_ENROLLED', 'An authenticator is already set up. Reset it from the command line to start again.');
    const secret = newTotpSecret();
    // Pending until confirmed; starting again replaces it.
    await ctx.db
      .update(U)
      .set({ totpSecretEncrypted: encrypt(secret, ctx.deps.config.CREDENTIALS_KEY).toString('base64'), totpLastStep: null, updatedAt: ctx.now })
      .where(and(eq(U.id, row.id), isNull(U.totpEnabledAt)));
    return { secret, otpauthUri: otpauthUri(secret, row.email) };
  },

  async confirmMfaEnrollment(ctx) {
    const row = await userRow(ctx);
    if (row.totpEnabledAt) throw conflict('MFA_ALREADY_ENROLLED', 'An authenticator is already set up');
    if (row.lockedUntil && row.lockedUntil > ctx.now) throw lockedError(ctx as unknown as MfaCtx, row.lockedUntil);
    if (!row.totpSecretEncrypted) throw badRequest('MFA_NOT_STARTED', 'Start setting up the authenticator first');
    const secret = decrypt(Buffer.from(row.totpSecretEncrypted, 'base64'), ctx.deps.config.CREDENTIALS_KEY);
    const step = verifyTotp(secret, ctx.body.code, ctx.now.getTime(), null);
    if (step === null) return wrongCode(ctx as unknown as MfaCtx, row);
    const codes = newRecoveryCodes();
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(U)
        .set({ totpEnabledAt: ctx.now, totpLastStep: step, recoveryCodeHashes: codes.map((c) => sha256(normalizeRecoveryCode(c))), failedSignInCount: 0, lockedUntil: null, updatedAt: ctx.now })
        .where(eq(U.id, row.id));
      await tx.update(schema.deviceSessions).set({ mfaVerifiedAt: ctx.now }).where(eq(schema.deviceSessions.id, ctx.user.sessionId));
      await recordPlatformAction(tx, ctx.user, ctx.req, { action: 'mfa.enrolled', target: self(ctx), reason: 'Set up an authenticator app' });
    });
    return { recoveryCodes: codes };
  },

  async verifyMfa(ctx) {
    const row = await userRow(ctx);
    if (!row.totpEnabledAt || !row.totpSecretEncrypted) throw conflict('MFA_ENROLLMENT_REQUIRED', 'Set up an authenticator app first');
    if (row.lockedUntil && row.lockedUntil > ctx.now) throw lockedError(ctx, row.lockedUntil);

    const looksLikeTotp = /^\s*\d{3}\s?\d{3}\s*$/.test(ctx.body.code);
    if (looksLikeTotp) {
      const secret = decrypt(Buffer.from(row.totpSecretEncrypted, 'base64'), ctx.deps.config.CREDENTIALS_KEY);
      const step = verifyTotp(secret, ctx.body.code, ctx.now.getTime(), row.totpLastStep);
      if (step === null) return wrongCode(ctx, row);
      // Only moves forward, so two sessions racing with the same code can't both pass.
      const [used] = await ctx.db
        .update(U)
        .set({ totpLastStep: step, failedSignInCount: 0, lockedUntil: null })
        .where(and(eq(U.id, row.id), sql`coalesce(${U.totpLastStep}, -1) < ${step}`))
        .returning({ id: U.id });
      if (!used) return wrongCode(ctx, row);
      await markSessionVerified(ctx);
      await recordPlatformAction(ctx.db, ctx.user, ctx.req, { action: 'mfa.verified', target: self(ctx), reason: 'Authenticator code' });
    } else {
      const hash = sha256(normalizeRecoveryCode(ctx.body.code));
      // Removed in the same statement that checks it: a recovery code works once.
      const [used] = await ctx.db
        .update(U)
        .set({
          recoveryCodeHashes: sql`coalesce(${U.recoveryCodeHashes}, '[]'::jsonb) - ${hash}::text`,
          failedSignInCount: 0,
          lockedUntil: null,
        })
        .where(and(eq(U.id, row.id), sql`coalesce(${U.recoveryCodeHashes}, '[]'::jsonb) ? ${hash}::text`))
        .returning({ id: U.id });
      if (!used) return wrongCode(ctx, row);
      await markSessionVerified(ctx);
      await recordPlatformAction(ctx.db, ctx.user, ctx.req, { action: 'mfa.recovery_code_used', target: self(ctx), reason: 'Recovery code' });
    }
    return status(await userRow(ctx), true);
  },
});
