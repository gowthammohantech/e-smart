import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { conflict, forbidden, preconditionFailed, unprocessable, upstream } from '../../http/errors';
import { identifyCompany, track } from '../../analytics/track';
import { recordChange } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { reauthenticate } from '../me/deleteAccount';
import { companyWithImages } from './logo';

const C = schema.companies;
/** GST books must be kept 72 months from the annual return's due date; 8 years from today covers it. */
const RETENTION_YEARS = 8;

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('en-IN') === b.trim().toLocaleLowerCase('en-IN');

/**
 * Archiving one business, and bringing it back. An archived business is read-only (the guard refuses
 * every write but exports and /restore), out of everyone's business list and the background jobs, and
 * erased by the daily purge once `purgeAfter` passes.
 */
export const companyArchiveHandlers = defineHandlers({
  async archiveCompany(ctx) {
    const company = ctx.company;
    // An owner invited from another account runs it day to day; closing it is its own account's call.
    if (company.accountId !== ctx.user.accountId) throw forbidden('NOT_ACCOUNT_OWNER', 'Only an owner on the account this business belongs to can archive it');
    if (!sameName(ctx.body.confirmName, company.name)) {
      throw unprocessable([{ field: 'confirmName', message: `Type the business name, ${company.name}, to archive it`, severity: 'blocking' }], 'NAME_MISMATCH');
    }
    const [open] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(C)
      .where(and(eq(C.accountId, company.accountId), isNull(C.archivedAt), ne(C.id, company.id)));
    if (!open?.n) throw conflict('LAST_COMPANY', 'This is your only open business. To close it, delete your account in Settings → Profile instead.');

    const [me] = await ctx.db.select().from(schema.users).where(eq(schema.users.id, ctx.user.id));
    await reauthenticate(ctx, me, ctx.body);

    // Stop the billing first: if the gateway can't be reached, nothing changes and they can try again.
    const S = schema.subscriptions;
    const [sub] = await ctx.db.select().from(S).where(eq(S.companyId, company.id));
    if (sub?.status === 'active' && sub.providerSubscriptionId) {
      try {
        await ctx.deps.providers.payments.cancelSubscription(sub.providerSubscriptionId, { atPeriodEnd: false });
      } catch (err) {
        ctx.req.log.error({ err, companyId: company.id }, 'cancelling the subscription to archive a business failed');
        throw upstream('SUBSCRIPTION_CANCEL_FAILED', "We couldn't cancel this business's subscription just now, so it wasn't archived. Try again in a few minutes.");
      }
    }

    const purgeAfter = new Date(ctx.now);
    purgeAfter.setUTCFullYear(purgeAfter.getUTCFullYear() + RETENTION_YEARS);
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(C)
        .set({ archivedAt: ctx.now, archivedBy: ctx.user.id, purgeAfter, plan: 'free', version: company.version + 1, updatedAt: ctx.now })
        .where(and(eq(C.id, company.id), eq(C.version, company.version), isNull(C.archivedAt)))
        .returning();
      if (!updated) throw preconditionFailed();
      // Nobody lands in it on their next sign-in.
      await tx.update(schema.users).set({ defaultCompanyId: null }).where(eq(schema.users.defaultCompanyId, company.id));
      if (sub?.status === 'active') await tx.update(S).set({ cancelAtPeriodEnd: true, version: sub.version + 1, updatedAt: ctx.now }).where(eq(S.companyId, company.id));
      await tx.insert(schema.subscriptionEvents).values({ id: newId('sev'), companyId: company.id, fromPlan: company.plan, toPlan: 'free', event: 'company.archived' });
      await recordChange(tx, ctx.user, {
        companyId: company.id,
        action: 'archived',
        entityType: 'company',
        entityId: company.id,
        entityLabel: company.name,
        version: updated.version,
        after: { purgeAfter: purgeAfter.toISOString() },
      });
      return updated;
    });
    identifyCompany(ctx, row);
    track(ctx, 'company_archived', {}, { company: row });
    return companyWithImages(ctx.deps, ctx.db, row);
  },

  async restoreCompany(ctx) {
    const company = ctx.company;
    if (company.accountId !== ctx.user.accountId) throw forbidden('NOT_ACCOUNT_OWNER', 'Only an owner on the account this business belongs to can restore it');
    if (!company.archivedAt) throw conflict('NOT_ARCHIVED', 'This business is not archived');
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(C)
        .set({ archivedAt: null, archivedBy: null, purgeAfter: null, version: company.version + 1, updatedAt: ctx.now })
        .where(and(eq(C.id, company.id), eq(C.version, company.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await tx.insert(schema.subscriptionEvents).values({ id: newId('sev'), companyId: company.id, fromPlan: null, toPlan: updated.plan, event: 'company.restored' });
      await recordChange(tx, ctx.user, { companyId: company.id, action: 'restored', entityType: 'company', entityId: company.id, entityLabel: company.name, version: updated.version });
      return updated;
    });
    identifyCompany(ctx, row);
    track(ctx, 'company_restored', {}, { company: row });
    return companyWithImages(ctx.deps, ctx.db, row);
  },
});
