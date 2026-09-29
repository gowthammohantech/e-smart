import { asc, eq, inArray } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { onboardingComplete, userToWire } from '../auth/users';
import { companyToWire } from '../companies/wire';

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
});
