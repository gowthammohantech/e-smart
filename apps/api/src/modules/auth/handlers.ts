import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { hashPassword, verifyPassword } from '../../auth/passwords';
import { openSession, rotateSession } from '../../auth/sessions';
import { defineHandlers, type Ctx } from '../../context';
import { badRequest, conflict, tooManyRequests, unauthorized } from '../../http/errors';
import { randomToken, sha256 } from '../../lib/crypto';
import { newId } from '../../lib/ids';
import { avatarColorFor, onboardingComplete, userToWire } from './users';

const OTP_TTL_SECONDS = 300;
const OTP_RESEND_AFTER_SECONDS = 30;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TTL_MS = 3_600_000;

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

export const authHandlers = defineHandlers({
  async signUp(ctx) {
    const email = normalizeEmail(ctx.body.email);
    const [taken] = await ctx.db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
    if (taken) throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
    if (ctx.body.phone) {
      const [phoneTaken] = await ctx.db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phone, ctx.body.phone));
      if (phoneTaken) throw conflict('PHONE_TAKEN', 'This phone number is already registered');
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
          phone: ctx.body.phone ?? null,
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
    else await ctx.deps.providers.sms.send(phone, text);
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
    const [user] = await ctx.db.select().from(schema.users).where(eq(schema.users.phone, otp.phone));
    if (!user) throw unauthorized('PHONE_NOT_REGISTERED', 'No account uses this phone number; sign up first');
    if (user.status === 'disabled') throw unauthorized('USER_DISABLED', 'This user has been disabled');
    if (!user.phoneVerifiedAt) await ctx.db.update(schema.users).set({ phoneVerifiedAt: ctx.now }).where(eq(schema.users.id, user.id));
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
      const link = `${ctx.deps.config.PUBLIC_BASE_URL}/reset-password?token=${token}`;
      await ctx.deps.providers.email.send({
        to: user.email,
        subject: 'Reset your Elixir Books password',
        text: `Hi ${user.name},\n\nReset your password with this link. It works once and expires in an hour:\n${link}\n\nIf you didn't ask for this, ignore this email.`,
      });
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
