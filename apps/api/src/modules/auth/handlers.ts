import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { hashPassword, verifyPassword } from '../../auth/passwords';
import { openSession, rotateSession } from '../../auth/sessions';
import { defineHandlers, type Ctx } from '../../context';
import { badRequest, conflict, tooManyRequests, unauthorized } from '../../http/errors';
import { randomToken, sha256 } from '../../lib/crypto';
import { newId } from '../../lib/ids';
import { buildResetEmail } from '../../lib/resetEmail';
import { avatarColorFor, onboardingComplete, userToWire } from './users';

const OTP_TTL_SECONDS = 300;
const OTP_RESEND_AFTER_SECONDS = 30;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TTL_MS = 3_600_000;
// How long a verified phone may be used to finish signing up.
const PHONE_VERIFICATION_TTL_MS = 900_000;

type AnyCtx = Ctx<'signIn'>;

async function sessionResponse(ctx: AnyCtx, user: typeof schema.users.$inferSelect, device?: { label?: string; platform?: string; appVersion?: string }) {
  const tokens = await openSession(ctx.req.server, ctx.db, ctx.deps, user, device, ctx.req.ip);
  await ctx.db.update(schema.users).set({ lastActiveAt: ctx.now }).where(eq(schema.users.id, user.id));
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: ctx.deps.config.ACCESS_TOKEN_TTL_SECONDS,
    user: await userToWire(ctx.db, { ...user, lastActiveAt: ctx.now }),
    onboardingComplete: await onboardingComplete(ctx.db, user.id),
  };
}

const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** The one account that has proven it owns this number; a number merely typed into a profile doesn't match. */
const verifiedPhone = (phone: string) => and(eq(schema.users.phone, phone), isNotNull(schema.users.phoneVerifiedAt));

export const authHandlers = defineHandlers({
  async signUp(ctx) {
    const email = normalizeEmail(ctx.body.email);
    const [taken] = await ctx.db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    if (taken) throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
    let phone = ctx.body.phone ?? null;
    let phoneVerified = false;
    if (ctx.body.phoneVerificationId) {
      // The phone was proven by an OTP just before; it is the only number this sign-up may use.
      const [otp] = await ctx.db.select().from(schema.otpRequests).where(eq(schema.otpRequests.id, ctx.body.phoneVerificationId));
      if (!otp?.verifiedAt || ctx.now.getTime() - otp.verifiedAt.getTime() > PHONE_VERIFICATION_TTL_MS || (phone && phone !== otp.phone)) {
        throw unauthorized('OTP_INVALID', 'Verify your phone number again to sign up');
      }
      phone = otp.phone;
      phoneVerified = true;
    }
    if (phoneVerified) {
      // Only one account can own a verified number, so a used verification fails here.
      // Numbers other people merely typed in don't count: they never block anyone.
      const [owner] = await ctx.db.select({ id: schema.users.id }).from(schema.users).where(verifiedPhone(phone!));
      if (owner) throw conflict('PHONE_TAKEN', 'This phone number is already registered');
    }
    const passwordHash = await hashPassword(ctx.body.password);
    const accountId = newId('acc');
    const userId = newId('usr');
    const user = await ctx.db.transaction(async (tx) => {
      // accounts ↔ users reference each other: the account first, owner set after.
      await tx.insert(schema.accounts).values({ id: accountId, name: ctx.body.name.trim() });
      const [row] = await tx
        .insert(schema.users)
        .values({
          id: userId,
          accountId,
          name: ctx.body.name.trim(),
          email,
          phone,
          phoneVerifiedAt: phoneVerified ? ctx.now : null,
          passwordHash,
          role: 'owner',
          avatarColor: avatarColorFor(email),
          status: 'active',
          locale: ctx.body.locale ?? 'en',
        })
        .returning();
      await tx.update(schema.accounts).set({ ownerUserId: userId }).where(eq(schema.accounts.id, accountId));
      return row;
    });
    return sessionResponse(ctx as unknown as AnyCtx, user);
  },

  async signIn(ctx) {
    const [user] = await ctx.db.select().from(schema.users).where(eq(schema.users.email, normalizeEmail(ctx.body.email)));
    // Same answer for an unknown email and a wrong password.
    if (!user || !(await verifyPassword(user.passwordHash, ctx.body.password))) {
      throw unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    if (user.status === 'disabled') throw unauthorized('USER_DISABLED', 'This user has been disabled');
    if (user.status === 'invited') throw unauthorized('INVITE_PENDING', 'Accept your invitation first');
    return sessionResponse(ctx, user, ctx.body.device);
  },

  async requestOtp(ctx) {
    const phone = ctx.body.phone.trim();
    // Local development is never throttled; every other environment is.
    if (ctx.deps.config.NODE_ENV !== 'development') {
      const hourAgo = new Date(ctx.now.getTime() - 3_600_000);
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.otpRequests)
        .where(and(eq(schema.otpRequests.phone, phone), gt(schema.otpRequests.createdAt, hourAgo)));
      if (count >= OTP_MAX_PER_HOUR) throw tooManyRequests('Too many codes requested for this number; try again later');
      const [latest] = await ctx.db
        .select({ createdAt: schema.otpRequests.createdAt })
        .from(schema.otpRequests)
        .where(eq(schema.otpRequests.phone, phone))
        .orderBy(desc(schema.otpRequests.createdAt))
        .limit(1);
      if (latest && ctx.now.getTime() - latest.createdAt.getTime() < OTP_RESEND_AFTER_SECONDS * 1000) {
        throw tooManyRequests(`Wait ${OTP_RESEND_AFTER_SECONDS} seconds before asking for another code`);
      }
    }

    const code = ctx.deps.config.DEMO_OTP ? '123456' : String(randomInt(0, 1_000_000)).padStart(6, '0');
    const requestId = newId('otp');
    const channel = ctx.body.channel ?? 'sms';
    await ctx.db.insert(schema.otpRequests).values({
      id: requestId,
      phone,
      channel,
      codeHash: sha256(`${requestId}:${code}`),
      expiresAt: new Date(ctx.now.getTime() + OTP_TTL_SECONDS * 1000),
    });
    const text = `${code} is your Elixir Books sign-in code. It expires in 5 minutes.`;
    if (channel === 'whatsapp') await ctx.deps.providers.whatsapp.send({ to: phone, text });
    else {
      // Name for providers whose template greets the user; sign-ups have no user yet.
      const [owner] = await ctx.db.select({ name: schema.users.name }).from(schema.users).where(verifiedPhone(phone)).limit(1);
      await ctx.deps.providers.sms.send(phone, text, { kind: 'otp', code, name: owner?.name });
    }
    return { requestId, expiresInSeconds: OTP_TTL_SECONDS, resendAfterSeconds: OTP_RESEND_AFTER_SECONDS };
  },

  async verifyOtp(ctx) {
    const [otp] = await ctx.db.select().from(schema.otpRequests).where(eq(schema.otpRequests.id, ctx.body.requestId));
    if (!otp || otp.verifiedAt) throw unauthorized('OTP_INVALID', 'That code is not valid');
    if (otp.expiresAt < ctx.now) throw unauthorized('OTP_EXPIRED', 'That code has expired; request a new one');
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw unauthorized('OTP_LOCKED', 'Too many wrong attempts; request a new code');
    if (sha256(`${otp.id}:${ctx.body.code}`) !== otp.codeHash) {
      await ctx.db.update(schema.otpRequests).set({ attempts: otp.attempts + 1 }).where(eq(schema.otpRequests.id, otp.id));
      throw unauthorized('OTP_INVALID', 'That code is not valid');
    }
    await ctx.db.update(schema.otpRequests).set({ verifiedAt: ctx.now }).where(eq(schema.otpRequests.id, otp.id));
    // Only the account that verified this number signs in with it. A number someone typed in without
    // verifying it is no account's phone, so the code proves it and the person finishes signing up.
    const [user] = await ctx.db.select().from(schema.users).where(verifiedPhone(otp.phone));
    if (!user) throw unauthorized('PHONE_NOT_REGISTERED', 'No account uses this phone number yet; finish signing up');
    if (user.status === 'disabled') throw unauthorized('USER_DISABLED', 'This user has been disabled');
    return sessionResponse(ctx as unknown as AnyCtx, user, ctx.body.device);
  },

  async forgotPassword(ctx) {
    const [user] = await ctx.db.select().from(schema.users).where(eq(schema.users.email, normalizeEmail(ctx.body.email)));
    if (user && user.status === 'active') {
      const token = randomToken();
      await ctx.db.insert(schema.passwordResetTokens).values({
        id: newId('prt'),
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(ctx.now.getTime() + RESET_TTL_MS),
      });
      const mail = buildResetEmail({ appUrl: ctx.deps.config.APP_URL, token, name: user.name, expiresInMinutes: RESET_TTL_MS / 60_000 });
      try {
        await ctx.deps.providers.email.send({ to: user.email, ...mail });
      } catch (err) {
        // The answer must not depend on whether the address is registered, so a failed send is logged, not returned.
        ctx.req.log.error({ err, to: user.email }, 'password reset email failed');
      }
    }
    return undefined;
  },

  async resetPassword(ctx) {
    const [reset] = await ctx.db
      .select()
      .from(schema.passwordResetTokens)
      .where(and(eq(schema.passwordResetTokens.tokenHash, sha256(ctx.body.token)), isNull(schema.passwordResetTokens.usedAt)));
    if (!reset || reset.expiresAt < ctx.now) throw badRequest('RESET_TOKEN_INVALID', 'This reset link is invalid or has expired');
    const passwordHash = await hashPassword(ctx.body.password);
    await ctx.db.transaction(async (tx) => {
      await tx.update(schema.users).set({ passwordHash, updatedAt: ctx.now }).where(eq(schema.users.id, reset.userId));
      await tx.update(schema.passwordResetTokens).set({ usedAt: ctx.now }).where(eq(schema.passwordResetTokens.id, reset.id));
      // Every signed-in device has to sign in again with the new password.
      await tx
        .update(schema.deviceSessions)
        .set({ revokedAt: ctx.now })
        .where(and(eq(schema.deviceSessions.userId, reset.userId), isNull(schema.deviceSessions.revokedAt)));
    });
    return undefined;
  },

  async refreshToken(ctx) {
    const rotated = await rotateSession(ctx.req.server, ctx.deps, ctx.body.refreshToken);
    const [user] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, rotated.userId));
    await ctx.db.update(schema.users).set({ lastActiveAt: ctx.now }).where(eq(schema.users.id, user.id));
    return {
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: ctx.deps.config.ACCESS_TOKEN_TTL_SECONDS,
      user: await userToWire(ctx.db, user),
      onboardingComplete: await onboardingComplete(ctx.db, user.id),
    };
  },

  async signOut(ctx) {
    await ctx.db.update(schema.deviceSessions).set({ revokedAt: ctx.now }).where(eq(schema.deviceSessions.id, ctx.user.sessionId));
    return undefined;
  },
});
