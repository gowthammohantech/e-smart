import { and, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { verifyPasswordTimed } from '../../auth/passwords';
import { defineHandlers, type Ctx } from '../../context';
import { ApiError, conflict, unauthorized, upstream } from '../../http/errors';
import { sha256 } from '../../lib/crypto';
import { renderEmailHtml } from '../../lib/emailLayout';
import { newId } from '../../lib/ids';
import { otherActiveOwners, recordUserChange, revokeAllSessions } from '../users/shared';

const U = schema.users;
const OTP_MAX_ATTEMPTS = 5;
/** GST books must be kept 72 months from the annual return's due date; 8 years from today covers it. */
const RETENTION_YEARS = 8;

type DeleteCtx = Ctx<'deleteMe'>;
type UserRow = typeof U.$inferSelect;

type Proof = { password?: string; otpRequestId?: string; otpCode?: string };

/** The password, or a fresh code sent to the phone they verified: either proof they could sign in with. */
export async function reauthenticate(ctx: Pick<DeleteCtx, 'db' | 'now'>, user: UserRow, proof: Proof) {
  const { otpRequestId, otpCode } = proof;
  if (!otpRequestId) {
    if (!(await verifyPasswordTimed(user.passwordHash, proof.password ?? ''))) throw unauthorized('REAUTH_FAILED', 'That password is not right');
    return;
  }
  if (!otpCode || !user.phone || !user.phoneVerifiedAt) throw unauthorized('REAUTH_FAILED', 'Enter the code we sent to your phone');
  const O = schema.otpRequests;
  const [otp] = await ctx.db.select().from(O).where(eq(O.id, otpRequestId));
  if (!otp || otp.phone !== user.phone || otp.verifiedAt || otp.expiresAt < ctx.now) throw unauthorized('REAUTH_FAILED', 'That code has expired; ask for a new one');
  const [counted] = await ctx.db
    .update(O)
    .set({ attempts: sql`${O.attempts} + 1` })
    .where(and(eq(O.id, otp.id), sql`${O.attempts} < ${OTP_MAX_ATTEMPTS}`))
    .returning({ id: O.id });
  if (!counted || sha256(`${otp.id}:${otpCode}`) !== otp.codeHash) throw unauthorized('REAUTH_FAILED', 'That code is not right');
  const [used] = await ctx.db.update(O).set({ verifiedAt: ctx.now }).where(and(eq(O.id, otp.id), isNull(O.verifiedAt))).returning({ id: O.id });
  if (!used) throw unauthorized('REAUTH_FAILED', 'That code was already used');
}

/** Everyone else who can open this account's businesses: its own people and guests invited from other accounts. */
async function othersOnAccount(ctx: DeleteCtx, user: UserRow) {
  const companies = await ctx.db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.accountId, user.accountId));
  const [members] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(U)
    .where(and(eq(U.accountId, user.accountId), ne(U.id, user.id), ne(U.status, 'disabled')));
  const accountUsers = ctx.db.select({ id: U.id }).from(U).where(eq(U.accountId, user.accountId));
  const [guests] = companies.length
    ? await ctx.db
        .select({ n: sql<number>`count(distinct ${schema.userCompanies.userId})::int` })
        .from(schema.userCompanies)
        .where(and(inArray(schema.userCompanies.companyId, companies.map((c) => c.id)), notInArray(schema.userCompanies.userId, accountUsers)))
    : [{ n: 0 }];
  return { companies, others: (members?.n ?? 0) + (guests?.n ?? 0) };
}

export const deleteAccountHandlers = defineHandlers({
  async deleteMe(ctx) {
    const [user] = await ctx.db.select().from(U).where(eq(U.id, ctx.user.id));
    // Operators can reach every tenant: removing one is a deliberate act from the command line, not a button.
    if (user.platformRole) throw conflict('OPERATOR_CANNOT_SELF_DELETE', 'Platform operators are removed by another operator, not from the app');
    await reauthenticate(ctx, user, ctx.body);

    const { companies, others } = await othersOnAccount(ctx, user);
    const lastOwner = user.role === 'owner' && (await otherActiveOwners(ctx.db, user.accountId, user.id)) === 0;
    if (lastOwner && others > 0) {
      throw new ApiError(409, 'OWNER_MUST_TRANSFER', 'Other people use your businesses. Make one of them an owner first, then delete your account.', {
        companies: companies.map((c) => ({ id: c.id, name: c.name })),
      });
    }
    // Nobody else is left: the account closes with them.
    const closing = lastOwner;

    if (closing && companies.length) {
      // Stop the billing first: if the gateway can't be reached, nothing is deleted and they can try again.
      const S = schema.subscriptions;
      const live = await ctx.db
        .select()
        .from(S)
        .where(and(inArray(S.companyId, companies.map((c) => c.id)), eq(S.status, 'active')));
      for (const sub of live) {
        if (!sub.providerSubscriptionId) continue;
        try {
          await ctx.deps.providers.payments.cancelSubscription(sub.providerSubscriptionId, { atPeriodEnd: false });
        } catch (err) {
          ctx.req.log.error({ err, companyId: sub.companyId }, 'cancelling the subscription for an account deletion failed');
          throw upstream('SUBSCRIPTION_CANCEL_FAILED', "We couldn't cancel your subscription just now, so nothing was deleted. Try again in a few minutes.");
        }
      }
    }

    const oldEmail = user.email;
    const oldName = user.name;
    const companyIds = ctx.user.companyIds;
    await ctx.db.transaction(async (tx) => {
      await recordUserChange(tx, ctx.user, companyIds, { action: 'deleted their account', user, deleted: true });
      await revokeAllSessions(tx, user.id, ctx.now);
      await tx.delete(schema.userBranches).where(eq(schema.userBranches.userId, user.id));
      await tx.delete(schema.userCompanies).where(eq(schema.userCompanies.userId, user.id));
      await tx.delete(schema.invites).where(and(eq(schema.invites.userId, user.id), isNull(schema.invites.acceptedAt)));
      await tx.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, user.id));
      await tx.delete(schema.notifications).where(eq(schema.notifications.userId, user.id));
      if (user.phone) await tx.delete(schema.otpRequests).where(eq(schema.otpRequests.phone, user.phone));
      // The row stays, because documents and the audit trail point at it; everything that identifies them goes.
      await tx
        .update(U)
        .set({
          name: 'Deleted user',
          email: `deleted+${user.id}@deleted.invalid`,
          phone: null,
          phoneVerifiedAt: null,
          emailVerifiedAt: null,
          passwordHash: null,
          totpSecretEncrypted: null,
          totpEnabledAt: null,
          totpLastStep: null,
          recoveryCodeHashes: null,
          defaultCompanyId: null,
          status: 'disabled',
          version: user.version + 1,
          updatedAt: ctx.now,
        })
        .where(eq(U.id, user.id));
      if (closing) {
        const purgeAfter = new Date(ctx.now);
        purgeAfter.setUTCFullYear(purgeAfter.getUTCFullYear() + RETENTION_YEARS);
        await tx
          .update(schema.accounts)
          .set({ suspendedAt: ctx.now, suspendedReason: 'owner-deleted', purgeAfter, updatedAt: ctx.now })
          .where(eq(schema.accounts.id, user.accountId));
        for (const c of companies) {
          await tx.insert(schema.subscriptionEvents).values({ id: newId('sev'), companyId: c.id, fromPlan: null, toPlan: 'free', event: 'account.deleted' });
        }
      }
    });

    try {
      const link = ctx.deps.config.APP_URL;
      const keep = closing ? `Your businesses' invoices and records are kept, locked, for ${RETENTION_YEARS} years as GST law requires, then erased.` : 'The business you worked in keeps its own records.';
      await ctx.deps.providers.email.send({
        to: oldEmail,
        subject: 'Your Elixir Books account was deleted',
        text: [`Hi ${oldName},`, '', 'Your Elixir Books account has been deleted, and you have been signed out everywhere.', keep, '', "If you didn't do this, reply to this email straight away."].join('\n'),
        html: renderEmailHtml({
          heading: 'Your account was deleted',
          paragraphs: [`Hi ${oldName},`, 'Your Elixir Books account has been deleted, and you have been signed out everywhere.', keep, "If you didn't do this, reply to this email straight away."],
          buttonLabel: 'Open Elixir Books',
          link,
          footer: 'You can sign up again with this email at any time.',
        }),
      });
    } catch (err) {
      ctx.req.log.error({ err }, 'account deletion email failed');
    }
    return undefined;
  },
});
