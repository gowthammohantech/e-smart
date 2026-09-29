import { and, asc, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { conflict, invalid, notFound, preconditionFailed } from '../../http/errors';
import { compact, iso } from '../../lib/wire';
import { onboardingComplete, userToWire } from '../auth/users';
import { companyToWire } from '../companies/wire';
import { recordUserChange } from '../users/shared';

const U = schema.users;
const S = schema.deviceSessions;
const HEX_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/**
 * Me: getMe, updateProfile, completeOnboarding, listDevices, revokeDevice,
 * registerPushToken, unregisterPushToken.
 */
export const meHandlers = defineHandlers({
  async getMe(ctx) {
    const [row] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, ctx.user.id));
    const companies = ctx.user.companyIds.length
      ? await ctx.db.select().from(schema.companies).where(inArray(schema.companies.id, ctx.user.companyIds)).orderBy(asc(schema.companies.createdAt))
      : [];
    const defaultCompanyId =
      row.defaultCompanyId && ctx.user.companyIds.includes(row.defaultCompanyId) ? row.defaultCompanyId : companies[0]?.id;
    return {
      user: await userToWire(ctx.db, row),
      accountId: row.accountId,
      onboardingComplete: await onboardingComplete(ctx.db, row.id),
      companies: await Promise.all(companies.map((c) => companyToWire(ctx.deps, c))),
      ...(defaultCompanyId ? { defaultCompanyId } : {}),
    };
  },

  async updateProfile(ctx) {
    const [current] = await ctx.db.select().from(U).where(eq(U.id, ctx.user.id));
    const { name, phone, avatarColor, locale } = ctx.body;
    if (name !== undefined && !name.trim()) throw invalid('name', 'Name cannot be empty');
    if (avatarColor !== undefined && !HEX_COLOR.test(avatarColor)) throw invalid('avatarColor', 'Use a hex colour such as #4DA3FF');
    const nextPhone = phone === undefined ? current.phone : phone.trim() || null;
    if (nextPhone && nextPhone !== current.phone) {
      const [taken] = await ctx.db.select({ id: U.id }).from(U).where(and(eq(U.phone, nextPhone), ne(U.id, current.id)));
      if (taken) throw conflict('PHONE_TAKEN', 'This phone number is already registered');
    }
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(U)
        .set({
          name: name?.trim() ?? current.name,
          phone: nextPhone,
          // A new number has to be verified again before OTP sign-in trusts it.
          phoneVerifiedAt: nextPhone === current.phone ? current.phoneVerifiedAt : null,
          avatarColor: avatarColor ?? current.avatarColor,
          locale: locale ?? current.locale,
          version: current.version + 1,
          updatedAt: ctx.now,
        })
        .where(and(eq(U.id, current.id), eq(U.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await recordUserChange(tx, ctx.user, ctx.user.companyIds, {
        action: 'updated',
        user: updated,
        before: await userToWire(tx, current),
        after: await userToWire(tx, updated),
      });
      return updated;
    });
    return userToWire(ctx.db, row);
  },

  /** Stamps every company the caller can open that hasn't finished onboarding. */
  async completeOnboarding(ctx) {
    if (!ctx.user.companyIds.length) throw conflict('NO_COMPANY', 'Create a company before finishing onboarding');
    await ctx.db
      .update(schema.companies)
      .set({ onboardingCompletedAt: ctx.now })
      .where(and(inArray(schema.companies.id, ctx.user.companyIds), isNull(schema.companies.onboardingCompletedAt)));
    return undefined;
  },

  async listDevices(ctx) {
    const rows = await ctx.db
      .select()
      .from(S)
      .where(and(eq(S.userId, ctx.user.id), isNull(S.revokedAt), gt(S.refreshExpiresAt, ctx.now)))
      .orderBy(desc(S.lastActiveAt), desc(S.id));
    return {
      data: rows.map((s) =>
        compact({
          id: s.id,
          label: s.label,
          platform: s.platform,
          lastActiveAt: iso(s.lastActiveAt),
          current: s.id === ctx.user.sessionId,
          location: s.location,
        }),
      ),
    };
  },

  /** Signs one of the caller's own devices out; anyone else's is a 404. */
  async revokeDevice(ctx) {
    const revoked = await ctx.db.transaction(async (tx) => {
      const rows = await tx
        .update(S)
        .set({ revokedAt: ctx.now })
        .where(and(eq(S.id, ctx.params.deviceId), eq(S.userId, ctx.user.id), isNull(S.revokedAt)))
        .returning({ id: S.id });
      if (rows.length) await tx.delete(schema.pushTokens).where(eq(schema.pushTokens.deviceSessionId, ctx.params.deviceId));
      return rows.length > 0;
    });
    if (!revoked) throw notFound('Device');
    return undefined;
  },

  /** A token that moves to another user (a handed-over phone) follows the new user. */
  async registerPushToken(ctx) {
    const token = ctx.body.token.trim();
    if (!token) throw invalid('token', 'Token is required');
    if (token.length > 255) throw invalid('token', 'Token is too long');
    const values = { userId: ctx.user.id, deviceSessionId: ctx.user.sessionId, provider: ctx.body.provider, lastUsedAt: ctx.now };
    await ctx.db
      .insert(schema.pushTokens)
      .values({ token, ...values })
      .onConflictDoUpdate({ target: schema.pushTokens.token, set: values });
    return undefined;
  },

  async unregisterPushToken(ctx) {
    await ctx.db.delete(schema.pushTokens).where(and(eq(schema.pushTokens.token, ctx.params.token), eq(schema.pushTokens.userId, ctx.user.id)));
    return undefined;
  },
});
