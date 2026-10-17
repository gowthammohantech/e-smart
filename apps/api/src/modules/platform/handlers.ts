import { and, asc, count, desc, eq, exists, gte, ilike, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { defineHandlers, type AuthUser, type Ctx } from '../../context';
import { badRequest, conflict, invalid, notFound } from '../../http/errors';
import { recordChange } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { compact, iso } from '../../lib/wire';
import { newestFirst } from '../audit/keyset';
import { subscriptionToWire } from '../billing/handlers';
import { recordUserChange, revokeAllSessions } from '../users/shared';
import { recordPlatformAction } from './audit';
import { accountRow, accountsToPlatform, companyToPlatform, subscriptionStatuses, userToPlatform } from './wire';

const A = schema.accounts;
const C = schema.companies;
const U = schema.users;
const PAE = schema.platformAuditEvents;
const PLAN_TIERS: Schema<'PlanTier'>[] = ['free', 'basic', 'pro', 'business'];
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (d: string) => new Date(`${d}T00:00:00Z`);

function reasonOf(body: { reason: string }) {
  const reason = body.reason.trim();
  if (reason.length < 3) throw invalid('reason', 'Give a reason of at least 3 characters');
  return reason;
}

/** How a platform operator shows up in a tenant's own audit trail. */
const asSupport = (user: AuthUser): AuthUser => ({ ...user, name: `${user.name} (platform support)` });

/** Every day from `from` to `to` inclusive, with the counts in `rows` or zero. */
function zeroFill<T extends Record<string, number>>(from: string, to: string, rows: Map<string, T>, empty: T) {
  const out: ({ date: string } & T)[] = [];
  for (let t = utcDay(from).getTime(); t <= utcDay(to).getTime(); t += DAY_MS) {
    const date = isoDate(new Date(t));
    out.push({ date, ...(rows.get(date) ?? empty) });
  }
  return out;
}

const perDay = (col: PgColumn) => sql<string>`to_char((${col} at time zone 'UTC')::date, 'YYYY-MM-DD')`;

/**
 * Platform: cross-tenant reads and the few actions operators take on
 * accounts, companies and users. The guard has already checked
 * `x-platform-roles`; every write records a platform audit event in the
 * same transaction.
 */
export const platformHandlers = defineHandlers({
  async getPlatformOverview(ctx) {
    const to = ctx.query.to ?? isoDate(ctx.now);
    const from = ctx.query.from ?? isoDate(new Date(utcDay(to).getTime() - 29 * DAY_MS));
    const days = (utcDay(to).getTime() - utcDay(from).getTime()) / DAY_MS;
    if (days < 0) throw badRequest('INVALID_RANGE', '`from` must be on or before `to`');
    if (days >= MAX_RANGE_DAYS) throw badRequest('INVALID_RANGE', `The range can be at most ${MAX_RANGE_DAYS} days`);
    const start = utcDay(from);
    const end = new Date(utcDay(to).getTime() + DAY_MS);
    const D = schema.documents;
    const n = sql<number>`count(*)::int`;

    const [[accounts], [companies], [users], plans, accountDays, companyDays, documentDays] = await Promise.all([
      ctx.db.select({ total: n, suspended: sql<number>`count(${A.suspendedAt})::int` }).from(A),
      ctx.db.select({ total: n }).from(C),
      ctx.db
        .select({ total: n, active: sql<number>`(count(*) filter (where ${U.lastActiveAt} >= ${new Date(ctx.now.getTime() - 30 * DAY_MS)}))::int` })
        .from(U),
      ctx.db.select({ plan: C.plan, companies: n }).from(C).groupBy(C.plan),
      ctx.db
        .select({ date: perDay(A.createdAt), n })
        .from(A)
        .where(and(gte(A.createdAt, start), lt(A.createdAt, end)))
        .groupBy(perDay(A.createdAt)),
      ctx.db
        .select({ date: perDay(C.createdAt), n })
        .from(C)
        .where(and(gte(C.createdAt, start), lt(C.createdAt, end)))
        .groupBy(perDay(C.createdAt)),
      ctx.db
        .select({ date: perDay(D.createdAt), n })
        .from(D)
        .where(and(gte(D.createdAt, start), lt(D.createdAt, end)))
        .groupBy(perDay(D.createdAt)),
    ]);

    const signups = new Map<string, { accounts: number; companies: number }>();
    for (const r of accountDays) signups.set(r.date, { accounts: r.n, companies: 0 });
    for (const r of companyDays) signups.set(r.date, { accounts: signups.get(r.date)?.accounts ?? 0, companies: r.n });
    const planCounts = new Map(plans.map((p) => [p.plan, p.companies]));

    return {
      from,
      to,
      totals: {
        accounts: accounts.total,
        suspendedAccounts: accounts.suspended,
        companies: companies.total,
        users: users.total,
        activeUsers30d: users.active,
      },
      plans: PLAN_TIERS.map((plan) => ({ plan, companies: planCounts.get(plan) ?? 0 })),
      signups: zeroFill(from, to, signups, { accounts: 0, companies: 0 }),
      documents: zeroFill(from, to, new Map(documentDays.map((r) => [r.date, { count: r.n }])), { count: 0 }),
    };
  },

  /** Newest first. `q` matches the account, its owner, or any of its companies. */
  async listPlatformAccounts(ctx) {
    const { q, status, plan, limit, cursor } = ctx.query;
    const k = newestFirst({ cursor, limit, at: A.createdAt, id: A.id });
    const filters: SQL[] = [];
    if (status === 'suspended') filters.push(isNotNull(A.suspendedAt));
    if (status === 'active') filters.push(isNull(A.suspendedAt));
    if (plan) filters.push(exists(ctx.db.select({ one: sql`1` }).from(C).where(and(eq(C.accountId, A.id), eq(C.plan, plan)))));
    if (q?.trim()) {
      const like = `%${q.trim()}%`;
      filters.push(
        or(
          ilike(A.name, like),
          exists(ctx.db.select({ one: sql`1` }).from(U).where(and(eq(U.id, A.ownerUserId), or(ilike(U.name, like), ilike(U.email, like))))),
          exists(ctx.db.select({ one: sql`1` }).from(C).where(and(eq(C.accountId, A.id), ilike(C.name, like)))),
        )!,
      );
    }
    const rows = await ctx.db
      .select({ row: A, cursorAt: k.cursorColumn })
      .from(A)
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    const page = rows.slice(0, k.take - 1);
    return k.page(
      await accountsToPlatform(ctx.db, page.map((r) => r.row)),
      rows.map((r) => ({ cursorAt: r.cursorAt, id: r.row.id })),
    );
  },

  async getPlatformAccount(ctx) {
    const account = await accountRow(ctx.db, ctx.params.accountId);
    if (!account) throw notFound('Account');
    const [companies, users] = await Promise.all([
      ctx.db.select().from(C).where(eq(C.accountId, account.id)).orderBy(asc(C.createdAt)),
      ctx.db.select().from(U).where(eq(U.accountId, account.id)).orderBy(asc(U.createdAt)),
    ]);
    const statuses = await subscriptionStatuses(ctx.db, companies.map((c) => c.id));
    const [wire] = await accountsToPlatform(ctx.db, [account]);
    return {
      account: wire,
      companies: companies.map((c) => companyToPlatform(c, statuses.get(c.id))),
      users: users.map((u) => userToPlatform(u, account)),
    };
  },

  /** Locks the whole account out now: every session is revoked, and sign-in and refresh refuse it. */
  async suspendAccount(ctx) {
    const reason = reasonOf(ctx.body);
    const account = await ctx.db.transaction(async (tx) => {
      const [current] = await tx.select().from(A).where(eq(A.id, ctx.params.accountId)).for('update');
      if (!current) throw notFound('Account');
      if (current.suspendedAt) throw conflict('ALREADY_SUSPENDED', 'This account is already suspended');
      const users = await tx.select({ id: U.id, platformRole: U.platformRole }).from(U).where(eq(U.accountId, current.id));
      // Also stops an operator locking out their own account.
      if (users.some((u) => u.platformRole)) {
        throw conflict('PLATFORM_ACCOUNT', 'This account has platform operators; remove their platform role first');
      }
      const [updated] = await tx
        .update(A)
        .set({ suspendedAt: ctx.now, suspendedReason: reason, suspendedBy: ctx.user.id, updatedAt: ctx.now })
        .where(eq(A.id, current.id))
        .returning();
      for (const u of users) await revokeAllSessions(tx, u.id, ctx.now);
      await recordPlatformAction(tx, ctx.user, ctx.req, {
        action: 'account.suspend',
        target: { type: 'account', id: current.id, label: current.name },
        reason,
        before: { suspended: false },
        after: { suspended: true, revokedUsers: users.length },
      });
      return updated;
    });
    const [wire] = await accountsToPlatform(ctx.db, [account]);
    return wire;
  },

  /** Users sign in again; the sessions revoked at suspension stay revoked. */
  async reactivateAccount(ctx) {
    const reason = reasonOf(ctx.body);
    const account = await ctx.db.transaction(async (tx) => {
      const [current] = await tx.select().from(A).where(eq(A.id, ctx.params.accountId)).for('update');
      if (!current) throw notFound('Account');
      if (!current.suspendedAt) throw conflict('NOT_SUSPENDED', 'This account is not suspended');
      const [updated] = await tx
        .update(A)
        .set({ suspendedAt: null, suspendedReason: null, suspendedBy: null, updatedAt: ctx.now })
        .where(eq(A.id, current.id))
        .returning();
      await recordPlatformAction(tx, ctx.user, ctx.req, {
        action: 'account.reactivate',
        target: { type: 'account', id: current.id, label: current.name },
        reason,
        before: { suspended: true, suspendedReason: current.suspendedReason },
        after: { suspended: false },
      });
      return updated;
    });
    const [wire] = await accountsToPlatform(ctx.db, [account]);
    return wire;
  },

  async getPlatformCompany(ctx) {
    const [company] = await ctx.db.select().from(C).where(eq(C.id, ctx.params.companyId));
    if (!company) throw notFound('Company');
    const SE = schema.subscriptionEvents;
    const D = schema.documents;
    const [[account], [subscription], history, documents, [members]] = await Promise.all([
      ctx.db.select().from(A).where(eq(A.id, company.accountId)),
      ctx.db.select().from(schema.subscriptions).where(eq(schema.subscriptions.companyId, company.id)),
      ctx.db.select().from(SE).where(eq(SE.companyId, company.id)).orderBy(desc(SE.createdAt), desc(SE.id)).limit(50),
      ctx.db.select({ kind: D.kind, count: sql<number>`count(*)::int` }).from(D).where(eq(D.companyId, company.id)).groupBy(D.kind).orderBy(asc(D.kind)),
      ctx.db.select({ n: count() }).from(schema.userCompanies).where(eq(schema.userCompanies.companyId, company.id)),
    ]);
    return {
      company: companyToPlatform(company, subscription?.status),
      accountName: account.name,
      accountSuspended: account.suspendedAt !== null,
      subscription: subscription ? subscriptionToWire(company.id, company.plan, subscription) : null,
      planHistory: history.map((h) => ({ id: h.id, fromPlan: h.fromPlan, toPlan: h.toPlan, event: h.event, createdAt: h.createdAt.toISOString() })),
      documentCounts: documents,
      userCount: members.n,
    };
  },

  /**
   * Sets the plan by hand. The provider fields are left alone, so a
   * provider-billed company can still be changed back by its next webhook;
   * the response warns about that.
   */
  async overrideCompanyPlan(ctx) {
    const reason = reasonOf(ctx.body);
    const { plan } = ctx.body;
    const periodEnd = ctx.body.currentPeriodEnd ? new Date(ctx.body.currentPeriodEnd) : null;
    if (periodEnd && (Number.isNaN(periodEnd.getTime()) || periodEnd <= ctx.now)) {
      throw invalid('currentPeriodEnd', 'The period end must be in the future');
    }
    const S = schema.subscriptions;
    const result = await ctx.db.transaction(async (tx) => {
      const [company] = await tx.select().from(C).where(eq(C.id, ctx.params.companyId)).for('update');
      if (!company) throw notFound('Company');
      const [current] = await tx.select().from(S).where(eq(S.companyId, company.id));
      const values = {
        plan,
        cycle: ctx.body.cycle ?? current?.cycle ?? 'monthly',
        status: ctx.body.status ?? 'active',
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        updatedAt: ctx.now,
      };
      const [subscription] = await tx
        .insert(S)
        .values({ companyId: company.id, ...values })
        .onConflictDoUpdate({ target: S.companyId, set: { ...values, version: (current?.version ?? 0) + 1 } })
        .returning();
      await tx.insert(schema.subscriptionEvents).values({ id: newId('sev'), companyId: company.id, fromPlan: company.plan, toPlan: plan, event: 'adminOverride' });

      let updated = company;
      const support = asSupport(ctx.user);
      if (company.plan !== plan) {
        [updated] = await tx.update(C).set({ plan, version: company.version + 1, updatedAt: ctx.now }).where(eq(C.id, company.id)).returning();
        await recordChange(tx, support, {
          companyId: company.id,
          action: `plan changed to ${plan}`,
          entityType: 'company',
          entityId: company.id,
          entityLabel: company.name,
          version: updated.version,
          before: { plan: company.plan },
          after: { plan },
        });
      }
      await recordChange(tx, support, { companyId: company.id, action: 'adminOverride', entityType: 'subscription', entityId: company.id, entityLabel: plan, version: subscription.version });

      const snapshot = (s: typeof current | undefined, p: string) =>
        compact({ plan: p, status: s?.status ?? 'none', cycle: s?.cycle, currentPeriodEnd: iso(s?.currentPeriodEnd) });
      await recordPlatformAction(tx, ctx.user, ctx.req, {
        action: 'company.plan.override',
        target: { type: 'company', id: company.id, label: company.name },
        reason,
        before: snapshot(current, company.plan),
        after: snapshot(subscription, plan),
      });
      return { company: updated, subscription };
    });
    const provider = result.subscription.provider;
    return {
      company: companyToPlatform(result.company, result.subscription.status),
      subscription: subscriptionToWire(result.company.id, result.company.plan, result.subscription),
      warning: provider ? `This subscription is billed through ${provider}; its next billing event may change the plan back.` : null,
    };
  },

  /** Newest first, across every account. */
  async listPlatformUsers(ctx) {
    const { q, status, accountId, limit, cursor } = ctx.query;
    const k = newestFirst({ cursor, limit, at: U.createdAt, id: U.id });
    const filters: SQL[] = [];
    if (status) filters.push(eq(U.status, status));
    if (accountId) filters.push(eq(U.accountId, accountId));
    if (q?.trim()) {
      const like = `%${q.trim()}%`;
      filters.push(or(ilike(U.name, like), ilike(U.email, like), ilike(U.phone, like))!);
    }
    const rows = await ctx.db
      .select({ row: U, account: { name: A.name, suspendedAt: A.suspendedAt }, cursorAt: k.cursorColumn })
      .from(U)
      .innerJoin(A, eq(A.id, U.accountId))
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    return k.page(
      rows.slice(0, k.take - 1).map((r) => userToPlatform(r.row, r.account)),
      rows.map((r) => ({ cursorAt: r.cursorAt, id: r.row.id })),
    );
  },

  async disablePlatformUser(ctx) {
    return setUserEnabled(ctx, false);
  },

  async enablePlatformUser(ctx) {
    return setUserEnabled(ctx, true);
  },

  /** Newest first. `from` and `to` are inclusive UTC dates. */
  async listPlatformAuditEvents(ctx) {
    const { actorId, targetType, targetId, from, to, limit, cursor } = ctx.query;
    const k = newestFirst({ cursor, limit, at: PAE.createdAt, id: PAE.id });
    const filters: SQL[] = [];
    if (actorId) filters.push(eq(PAE.actorId, actorId));
    if (targetType) filters.push(eq(PAE.targetType, targetType));
    if (targetId) filters.push(eq(PAE.targetId, targetId));
    if (from) filters.push(gte(PAE.createdAt, utcDay(from)));
    if (to) filters.push(lt(PAE.createdAt, new Date(utcDay(to).getTime() + DAY_MS)));
    const rows = await ctx.db
      .select({ row: PAE, cursorAt: k.cursorColumn })
      .from(PAE)
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    return k.page(
      rows.slice(0, k.take - 1).map(({ row }) =>
        compact({
          id: row.id,
          actorId: row.actorId,
          actorEmail: row.actorEmail,
          action: row.action,
          targetType: row.targetType as Schema<'PlatformAuditEvent'>['targetType'],
          targetId: row.targetId,
          targetLabel: row.targetLabel,
          reason: row.reason,
          before: row.before === null ? undefined : JSON.stringify(row.before),
          after: row.after === null ? undefined : JSON.stringify(row.after),
          ipAddress: row.ipAddress ?? undefined,
          createdAt: row.createdAt.toISOString(),
        }),
      ),
      rows.map((r) => ({ cursorAt: r.cursorAt, id: r.row.id })),
    );
  },
});

type UserToggleCtx = Ctx<'disablePlatformUser'> | Ctx<'enablePlatformUser'>;

/**
 * Disabling signs the user out everywhere. Enabling restores `active`, or
 * `invited` for someone who never set a password.
 */
async function setUserEnabled(ctx: UserToggleCtx, enable: boolean): Promise<Schema<'PlatformUser'>> {
  const reason = reasonOf(ctx.body);
  const { user, account } = await ctx.db.transaction(async (tx) => {
    const [current] = await tx.select().from(U).where(eq(U.id, ctx.params.userId)).for('update');
    if (!current) throw notFound('User');
    if (current.platformRole) throw conflict('PLATFORM_OPERATOR', 'Platform operators are managed with db:platform-admin, not here');
    if (enable && current.status !== 'disabled') throw conflict('NOT_DISABLED', 'This user is not disabled');
    if (!enable && current.status === 'disabled') throw conflict('ALREADY_DISABLED', 'This user is already disabled');
    const status = enable ? (current.passwordHash ? 'active' : 'invited') : 'disabled';
    const [updated] = await tx
      .update(U)
      .set({ status, version: current.version + 1, updatedAt: ctx.now })
      .where(eq(U.id, current.id))
      .returning();
    if (!enable) await revokeAllSessions(tx, current.id, ctx.now);
    const companyIds = (await tx.select({ id: schema.userCompanies.companyId }).from(schema.userCompanies).where(eq(schema.userCompanies.userId, current.id))).map(
      (r) => r.id,
    );
    await recordUserChange(tx, asSupport(ctx.user), companyIds, {
      action: enable ? 'enabled' : 'disabled',
      user: updated,
      before: { status: current.status },
      after: { status },
    });
    await recordPlatformAction(tx, ctx.user, ctx.req, {
      action: enable ? 'user.enable' : 'user.disable',
      target: { type: 'user', id: current.id, label: `${current.name} <${current.email}>` },
      reason,
      before: { status: current.status },
      after: { status },
    });
    const [acct] = await tx.select({ name: A.name, suspendedAt: A.suspendedAt }).from(A).where(eq(A.id, current.accountId));
    return { user: updated, account: acct };
  });
  return userToPlatform(user, account);
}
