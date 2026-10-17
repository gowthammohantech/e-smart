import { and, asc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { schema } from '@esmart/db';
import { nextUserPlan, userLimit } from '@esmart/core/domain/plan';
import type { Schema } from '@esmart/api-contract';
import { hashPassword } from '../../auth/passwords';
import { defineHandlers, type AuthUser, type Ctx } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { ApiError, badRequest, conflict, invalid, notFound, planLimitReached, preconditionFailed, tooManyRequests, upstream } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { randomToken, sha256 } from '../../lib/crypto';
import { buildInviteEmail } from '../../lib/inviteEmail';
import { newId } from '../../lib/ids';
import { avatarColorFor, userToWire } from '../auth/users';
import { issueSession, otherActiveOwners, recordUserChange, revokeAllSessions } from './shared';

const U = schema.users;
const I = schema.invites;
type UserRow = typeof U.$inferSelect;
type Role = Schema<'UserRole'>;

const INVITE_TTL_MS = 7 * 86_400_000;
const RESEND_AFTER_MS = 60_000;
const MIN_PASSWORD = 8;

/** Postgres 23503, whether or not Drizzle wrapped the driver error. */
function isForeignKeyViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === '23503' || e.cause?.code === '23503';
}

const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** Someone on the caller's account; anyone else is a 404. */
async function findAccountUser(db: DbOrTx, accountId: string, id: string): Promise<UserRow> {
  const [row] = await db.select().from(U).where(and(eq(U.id, id), eq(U.accountId, accountId)));
  if (!row) throw notFound('User');
  return row;
}

/** Only an owner may create, change or remove another owner. */
function assertMayManage(actor: AuthUser, target: { role: Role }, nextRole?: Role) {
  if (actor.role !== 'owner' && (target.role === 'owner' || nextRole === 'owner')) {
    throw new ApiError(403, 'ROLE_FORBIDDEN', 'Only an owner can manage owners');
  }
}

/**
 * The companies and branches a user will reach. Companies must be on the
 * caller's account (and, for an admin, ones the admin can reach); branches
 * must belong to those companies. Owners reach every company on the account,
 * as createCompany gives them.
 */
async function resolveAccess(db: DbOrTx, actor: AuthUser, role: Role, companyIds: string[], branchIds: string[]) {
  const C = schema.companies;
  const accountCompanies = await db.select({ id: C.id }).from(C).where(eq(C.accountId, actor.accountId));
  const onAccount = new Set(accountCompanies.map((c) => c.id));
  let companies: string[];
  if (role === 'owner') {
    companies = [...onAccount];
  } else {
    companies = [...new Set(companyIds)];
    const reachable = actor.role === 'owner' ? onAccount : new Set(actor.companyIds.filter((id) => onAccount.has(id)));
    const bad = companies.filter((id) => !reachable.has(id));
    if (bad.length) throw invalid('companyIds', `Unknown company: ${bad.join(', ')}`);
    if (!companies.length) throw invalid('companyIds', 'Give access to at least one company');
  }
  const branches = [...new Set(branchIds)];
  if (branches.length) {
    const rows = companies.length
      ? await db
          .select({ id: schema.branches.id })
          .from(schema.branches)
          .where(and(inArray(schema.branches.id, branches), inArray(schema.branches.companyId, companies)))
      : [];
    const found = new Set(rows.map((r) => r.id));
    const bad = branches.filter((id) => !found.has(id));
    if (bad.length) throw invalid('branchIds', `These branches are not in the selected companies: ${bad.join(', ')}`);
  }
  return { companies, branches };
}

async function replaceAccess(tx: DbOrTx, userId: string, access: { companies: string[]; branches: string[] }) {
  await tx.delete(schema.userCompanies).where(eq(schema.userCompanies.userId, userId));
  await tx.delete(schema.userBranches).where(eq(schema.userBranches.userId, userId));
  if (access.companies.length) await tx.insert(schema.userCompanies).values(access.companies.map((companyId) => ({ userId, companyId })));
  if (access.branches.length) await tx.insert(schema.userBranches).values(access.branches.map((branchId) => ({ userId, branchId })));
}

async function companiesOf(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db.select({ id: schema.userCompanies.companyId }).from(schema.userCompanies).where(eq(schema.userCompanies.userId, userId));
  return rows.map((r) => r.id);
}

/**
 * People holding a seat in a company: active users plus invitations still
 * open. An invitation holds its seat from the moment it is sent, so a plan
 * can't be overfilled by sending many before anyone accepts.
 */
async function seatsUsed(db: DbOrTx, companyId: string, now: Date, exceptUserId?: string): Promise<number> {
  const rows = await db
    .select({ id: U.id, status: U.status, expiresAt: I.expiresAt, acceptedAt: I.acceptedAt })
    .from(schema.userCompanies)
    .innerJoin(U, eq(U.id, schema.userCompanies.userId))
    .leftJoin(I, eq(I.userId, U.id))
    .where(eq(schema.userCompanies.companyId, companyId));
  const holders = new Set<string>();
  for (const r of rows) {
    if (r.id === exceptUserId) continue;
    if (r.status === 'active' || (r.status === 'invited' && r.expiresAt && !r.acceptedAt && r.expiresAt > now)) holders.add(r.id);
  }
  // Someone who already has an account holds a seat from the moment they're invited, too.
  const offered = await db
    .select({ userId: I.userId })
    .from(I)
    .where(and(isNull(I.acceptedAt), sql`${I.expiresAt} > ${now}`, sql`${I.companyIds} @> ${JSON.stringify([companyId])}::jsonb`));
  for (const o of offered) if (o.userId !== exceptUserId) holders.add(o.userId);
  return holders.size;
}

/** Throws PLAN_LIMIT_REACHED when any of these companies has no seat left for one more person. */
async function assertSeatsFree(db: DbOrTx, companyIds: string[], now: Date, exceptUserId?: string) {
  if (!companyIds.length) return;
  const rows = await db.select({ id: schema.companies.id, plan: schema.companies.plan }).from(schema.companies).where(inArray(schema.companies.id, companyIds));
  for (const c of rows) {
    const limit = userLimit(c.plan);
    if (limit !== null && (await seatsUsed(db, c.id, now, exceptUserId)) >= limit) {
      throw planLimitReached(c.plan, limit, nextUserPlan(c.plan));
    }
  }
}

/** A fresh invite token for `user`. Only its hash is stored. */
async function issueInvite(tx: DbOrTx, user: UserRow, invitedBy: string, now: Date): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const [existing] = await tx.select().from(I).where(and(eq(I.userId, user.id), isNull(I.acceptedAt)));
  if (existing) {
    await tx.update(I).set({ tokenHash: sha256(token), expiresAt, lastSentAt: now, invitedBy }).where(eq(I.id, existing.id));
  } else {
    await tx.insert(I).values({ id: newId('inv'), userId: user.id, invitedBy, tokenHash: sha256(token), expiresAt, lastSentAt: now });
  }
  return token;
}

/** Names of the given companies, in the order asked. */
async function businessNames(db: DbOrTx, companyIds: string[]): Promise<string[]> {
  if (!companyIds.length) return [];
  const rows = await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).where(inArray(schema.companies.id, companyIds));
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  return companyIds.map((id) => byId.get(id)).filter((n): n is string => !!n);
}

/** Companies on `accountId`. */
async function accountCompanyIds(db: DbOrTx, accountId: string): Promise<string[]> {
  const rows = await db.select({ id: schema.companies.id }).from(schema.companies).where(eq(schema.companies.accountId, accountId));
  return rows.map((r) => r.id);
}

/**
 * Someone with an account of their own, as the account that invited them sees
 * them: only its businesses, the role they were given there, and "invited"
 * until they accept. Nothing about their other businesses.
 */
async function guestToWire(db: DbOrTx, row: UserRow, accountCompanies: string[]): Promise<Schema<'User'>> {
  const mine = new Set(accountCompanies);
  const [held, offers, branchRows] = await Promise.all([
    db.select({ companyId: schema.userCompanies.companyId, role: schema.userCompanies.role }).from(schema.userCompanies).where(eq(schema.userCompanies.userId, row.id)),
    db.select().from(I).where(and(eq(I.userId, row.id), isNull(I.acceptedAt), isNotNull(I.companyIds))),
    db
      .select({ id: schema.userBranches.branchId, companyId: schema.branches.companyId })
      .from(schema.userBranches)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.userBranches.branchId))
      .where(eq(schema.userBranches.userId, row.id)),
  ]);
  const heldHere = held.filter((h) => mine.has(h.companyId));
  const offerHere = offers.filter((o) => (o.companyIds ?? []).some((id) => mine.has(id)));
  const wire = await userToWire(db, row);
  const companyIds = heldHere.length ? heldHere.map((h) => h.companyId) : [...new Set(offerHere.flatMap((o) => (o.companyIds ?? []).filter((id) => mine.has(id))))];
  return {
    ...wire,
    role: heldHere[0]?.role ?? offerHere[0]?.role ?? wire.role,
    companyIds,
    branchIds: heldHere.length ? branchRows.filter((b) => mine.has(b.companyId)).map((b) => b.id) : (offerHere.flatMap((o) => o.branchIds ?? [])),
    status: heldHere.length ? wire.status : 'invited',
    lastActiveAt: undefined,
  };
}

/** The offer of access to `userId`, from `inviterId`'s account, pending or refreshed. Returns the raw token. */
async function issueGuestInvite(
  tx: DbOrTx,
  userId: string,
  inviter: { id: string; accountId: string },
  offer: { role: Role; companies: string[]; branches: string[] },
  now: Date,
): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const [existing] = await tx
    .select({ id: I.id })
    .from(I)
    .innerJoin(U, eq(U.id, I.invitedBy))
    .where(and(eq(I.userId, userId), isNull(I.acceptedAt), isNotNull(I.companyIds), eq(U.accountId, inviter.accountId)));
  const fields = { tokenHash: sha256(token), expiresAt, lastSentAt: now, invitedBy: inviter.id, role: offer.role, companyIds: offer.companies, branchIds: offer.branches };
  if (existing) await tx.update(I).set(fields).where(eq(I.id, existing.id));
  else await tx.insert(I).values({ id: newId('inv'), userId, ...fields });
  return token;
}

/** People from other accounts who have, or have been offered, access to this account's businesses. */
async function guestsOf(db: DbOrTx, accountId: string): Promise<{ row: UserRow; companies: string[] }[]> {
  const companies = await accountCompanyIds(db, accountId);
  if (!companies.length) return [];
  const [members, offers] = await Promise.all([
    db
      .selectDistinct({ id: schema.userCompanies.userId })
      .from(schema.userCompanies)
      .innerJoin(U, eq(U.id, schema.userCompanies.userId))
      .where(and(inArray(schema.userCompanies.companyId, companies), ne(U.accountId, accountId))),
    db
      .select({ userId: I.userId })
      .from(I)
      .innerJoin(U, eq(U.id, I.userId))
      .where(and(isNull(I.acceptedAt), isNotNull(I.companyIds), ne(U.accountId, accountId), or(...companies.map((c) => sql`${I.companyIds} @> ${JSON.stringify([c])}::jsonb`)))),
  ]);
  const ids = [...new Set([...members.map((m) => m.id), ...offers.map((o) => o.userId)])];
  if (!ids.length) return [];
  const rows = await db.select().from(U).where(inArray(U.id, ids)).orderBy(asc(U.createdAt), asc(U.id));
  return rows.map((row) => ({ row, companies }));
}

/** A person from another account who has, or is offered, access here. 404 for anyone else. */
async function findGuest(db: DbOrTx, accountId: string, id: string): Promise<{ row: UserRow; companies: string[] }> {
  const guest = (await guestsOf(db, accountId)).find((g) => g.row.id === id);
  if (!guest) throw notFound('User');
  return guest;
}

/** The user at `id` when they belong to a different account than `accountId`; undefined otherwise. */
async function otherAccountUser(db: DbOrTx, accountId: string, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(U).where(and(eq(U.id, id), ne(U.accountId, accountId)));
  return row;
}

const INVITE_INVALID = 'This invite link is invalid or has expired';

/** The open invitation behind a link token, who it is for and who sent it. */
async function openInvite(db: DbOrTx, token: string, now: Date) {
  const [invite] = await db.select().from(I).where(and(eq(I.tokenHash, sha256(token)), isNull(I.acceptedAt)));
  if (!invite || invite.expiresAt < now) throw badRequest('INVITE_INVALID', INVITE_INVALID);
  const [user] = await db.select().from(U).where(eq(U.id, invite.userId));
  // A new person is still `invited`; someone offered access to another account is `active`,
  // or still `invited` if they never finished joining the account they were first invited to.
  const ok = invite.companyIds !== null ? user?.status === 'active' || user?.status === 'invited' : user?.status === 'invited';
  if (!user || !ok) throw badRequest('INVITE_INVALID', INVITE_INVALID);
  const [inviter] = await db.select().from(U).where(eq(U.id, invite.invitedBy));
  if (!inviter) throw badRequest('INVITE_INVALID', INVITE_INVALID);
  return { invite, user, inviter };
}

/** The businesses an offer still reaches: ones that exist and are still the inviter's account's. */
async function offeredCompanies(db: DbOrTx, invite: typeof I.$inferSelect, inviter: UserRow): Promise<string[]> {
  const ids = invite.companyIds ?? [];
  if (!ids.length) return [];
  const rows = await db
    .select({ id: schema.companies.id })
    .from(schema.companies)
    .where(and(inArray(schema.companies.id, ids), eq(schema.companies.accountId, inviter.accountId)));
  return rows.map((r) => r.id);
}

type MailDeps = { config: { APP_URL: string }; providers: { email: { send: (m: { to: string; subject: string; text: string; html?: string }) => Promise<unknown> } } };

/**
 * Emails the invitation link. The invite is already saved by now, so a failed
 * send is reported as such and the inviter can use "Resend invite".
 */
async function sendInviteEmail(
  deps: MailDeps,
  db: DbOrTx,
  log: { error: (obj: unknown, msg: string) => void },
  user: UserRow,
  inviterName: string,
  businesses: string[],
  token: string,
  existingUser = false,
) {
  const mail = buildInviteEmail({
    appUrl: deps.config.APP_URL,
    token,
    inviteeName: user.name,
    inviterName,
    businesses,
    role: user.role,
    expiresInDays: INVITE_TTL_MS / 86_400_000,
    existingUser,
  });
  try {
    await deps.providers.email.send({ to: user.email, ...mail });
  } catch (err) {
    log.error({ err, to: user.email }, 'invite email failed');
    // Nothing was sent, so "Resend invite" shouldn't make them wait a minute.
    await db.update(I).set({ lastSentAt: new Date(0) }).where(and(eq(I.userId, user.id), isNull(I.acceptedAt)));
    throw upstream('EMAIL_SEND_FAILED', `The invitation for ${user.email} was saved, but the email could not be sent. Use "Resend invite" to try again.`);
  }
}

/** Invites someone who already has an account: they get access to these businesses once they accept. */
async function inviteExistingUser(ctx: Ctx<'inviteUser'>, existing: UserRow, body: Ctx<'inviteUser'>['body']) {
  if (!body.name.trim()) throw invalid('name', 'Name is required');
  const access = await resolveAccess(ctx.db, ctx.user, body.role, body.companyIds, body.branchIds ?? []);
  const already = await ctx.db
    .select({ id: schema.userCompanies.companyId })
    .from(schema.userCompanies)
    .where(and(eq(schema.userCompanies.userId, existing.id), inArray(schema.userCompanies.companyId, access.companies)));
  if (already.length) throw conflict('ALREADY_MEMBER', `${existing.name} already has access to ${(await businessNames(ctx.db, already.map((a) => a.id))).join(', ')}`);
  await assertSeatsFree(ctx.db, access.companies, ctx.now, existing.id);

  const token = await ctx.db.transaction(async (tx) => {
    const t = await issueGuestInvite(tx, existing.id, ctx.user, { role: body.role, companies: access.companies, branches: access.branches }, ctx.now);
    await recordUserChange(tx, ctx.user, access.companies, { action: 'invited', user: existing, after: { email: existing.email, role: body.role, companyIds: access.companies } });
    return t;
  });
  await sendInviteEmail(ctx.deps, ctx.db, ctx.req.log, existing, ctx.user.name, await businessNames(ctx.db, access.companies), token, true);
  return guestToWire(ctx.db, existing, await accountCompanyIds(ctx.db, ctx.user.accountId));
}

/**
 * Users: listUsers, inviteUser, saveUser, removeUser, resendInvite, getInvite, acceptInvite.
 * The team belongs to the account, not to one company.
 */
export const usersHandlers = defineHandlers({
  async listUsers(ctx) {
    const rows = await ctx.db.select().from(U).where(eq(U.accountId, ctx.user.accountId)).orderBy(asc(U.createdAt), asc(U.id));
    const team = await Promise.all(rows.map((r) => userToWire(ctx.db, r)));
    const guests = await guestsOf(ctx.db, ctx.user.accountId);
    return { data: [...team, ...(await Promise.all(guests.map((g) => guestToWire(ctx.db, g.row, g.companies))))] };
  },

  async inviteUser(ctx) {
    const body = ctx.body;
    assertMayManage(ctx.user, { role: body.role }, body.role);
    const email = normalizeEmail(body.email);
    const phone = body.phone?.trim() || null;
    const [taken] = await ctx.db.select().from(U).where(eq(U.email, email));
    if (taken) {
      if (taken.accountId === ctx.user.accountId) throw conflict('EMAIL_TAKEN', 'This person is already on your team');
      // They have an account of their own: offer them access, which they accept by email.
      if (taken.status === 'disabled') throw conflict('EMAIL_TAKEN', 'Someone already uses this email');
      return inviteExistingUser(ctx, taken, body);
    }
    if (!body.name.trim()) throw invalid('name', 'Name is required');
    const access = await resolveAccess(ctx.db, ctx.user, body.role, body.companyIds, body.branchIds ?? []);
    await assertSeatsFree(ctx.db, access.companies, ctx.now);

    const { user, token } = await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(U)
        .values({
          id: newId('usr'),
          accountId: ctx.user.accountId,
          name: body.name.trim(),
          email,
          phone,
          passwordHash: null,
          role: body.role,
          avatarColor: avatarColorFor(email),
          status: 'invited',
          defaultCompanyId: access.companies[0] ?? null,
        })
        .returning();
      await replaceAccess(tx, created.id, access);
      const token = await issueInvite(tx, created, ctx.user.id, ctx.now);
      await recordUserChange(tx, ctx.user, access.companies, { action: 'invited', user: created, after: await userToWire(tx, created) });
      return { user: created, token };
    });
    await sendInviteEmail(ctx.deps, ctx.db, ctx.req.log, user, ctx.user.name, await businessNames(ctx.db, access.companies), token);
    setEtag(ctx.reply, user.version);
    return userToWire(ctx.db, user);
  },

  /**
   * Role, access and status. The guards reload the user on every request, so
   * a change applies from the target's next call. Email is the sign-in
   * identity and is not changed here.
   */
  async saveUser(ctx) {
    if (await otherAccountUser(ctx.db, ctx.user.accountId, ctx.params.userId)) {
      await findGuest(ctx.db, ctx.user.accountId, ctx.params.userId);
      throw conflict('GUEST_MANAGED', 'This person has their own account. Remove them and invite them again to change their access.');
    }
    const current = await findAccountUser(ctx.db, ctx.user.accountId, ctx.params.userId);
    checkIfMatch(ctx.req, current.version);
    const body = ctx.body;
    const role = body.role ?? current.role;
    assertMayManage(ctx.user, current, role);

    // An invited user stays invited until they accept; otherwise active or disabled.
    let status = current.status;
    if (body.status === 'disabled') status = 'disabled';
    else if (body.status === 'active' && current.status === 'disabled') status = current.passwordHash ? 'active' : 'invited';

    const self = current.id === ctx.user.id;
    if (self && status === 'disabled') throw conflict('CANNOT_DISABLE_SELF', "You can't disable yourself");
    const losesOwner = current.role === 'owner' && current.status === 'active' && (role !== 'owner' || status !== 'active');
    if (losesOwner && (await otherActiveOwners(ctx.db, ctx.user.accountId, current.id)) === 0) {
      throw conflict('LAST_OWNER', 'The account needs at least one active owner');
    }

    const beforeCompanies = await companiesOf(ctx.db, current.id);
    const branchRows = await ctx.db.select({ id: schema.userBranches.branchId }).from(schema.userBranches).where(eq(schema.userBranches.userId, current.id));
    const access = await resolveAccess(
      ctx.db,
      ctx.user,
      role,
      body.companyIds ?? beforeCompanies,
      body.branchIds ?? branchRows.map((b) => b.id),
    );
    // Turning someone back on, or giving them another business, takes a seat there.
    if (status !== 'disabled') {
      const reactivated = current.status === 'disabled';
      await assertSeatsFree(ctx.db, reactivated ? access.companies : access.companies.filter((id) => !beforeCompanies.includes(id)), ctx.now, current.id);
    }
    const row = await ctx.db.transaction(async (tx) => {
      const before = await userToWire(tx, current);
      const phone = body.phone === undefined ? current.phone : body.phone.trim() || null;
      const [updated] = await tx
        .update(U)
        .set({
          name: body.name?.trim() || current.name,
          phone,
          phoneVerifiedAt: phone === current.phone ? current.phoneVerifiedAt : null,
          avatarColor: body.avatarColor ?? current.avatarColor,
          role,
          status,
          defaultCompanyId: current.defaultCompanyId && access.companies.includes(current.defaultCompanyId) ? current.defaultCompanyId : (access.companies[0] ?? null),
          version: current.version + 1,
          updatedAt: ctx.now,
        })
        .where(and(eq(U.id, current.id), eq(U.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await replaceAccess(tx, updated.id, access);
      if (status === 'disabled' && current.status !== 'disabled') await revokeAllSessions(tx, updated.id, ctx.now);
      await recordUserChange(tx, ctx.user, [...beforeCompanies, ...access.companies], {
        action: 'updated',
        user: updated,
        before,
        after: await userToWire(tx, updated),
      });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return userToWire(ctx.db, row);
  },

  /**
   * Revokes every session and all access. The row itself goes too unless
   * records point at it (documents they created, the audit trail), in which
   * case the user is kept, disabled, so history still names them.
   */
  async removeUser(ctx) {
    const other = await otherAccountUser(ctx.db, ctx.user.accountId, ctx.params.userId);
    if (other) {
      // They keep their account; only their way into this account's businesses goes.
      const { row, companies } = await findGuest(ctx.db, ctx.user.accountId, other.id);
      const wire = await guestToWire(ctx.db, row, companies);
      assertMayManage(ctx.user, { role: wire.role ?? 'viewer' });
      await ctx.db.transaction(async (tx) => {
        await tx.delete(schema.userBranches).where(and(eq(schema.userBranches.userId, row.id), inArray(schema.userBranches.branchId, tx.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.companyId, companies)))));
        await tx.delete(schema.userCompanies).where(and(eq(schema.userCompanies.userId, row.id), inArray(schema.userCompanies.companyId, companies)));
        await tx.delete(I).where(and(eq(I.userId, row.id), isNull(I.acceptedAt), isNotNull(I.companyIds), inArray(I.invitedBy, tx.select({ id: U.id }).from(U).where(eq(U.accountId, ctx.user.accountId)))));
        await recordUserChange(tx, ctx.user, wire.companyIds ?? [], { action: 'removed', user: row, before: wire, deleted: false });
      });
      return undefined;
    }
    const current = await findAccountUser(ctx.db, ctx.user.accountId, ctx.params.userId);
    checkIfMatch(ctx.req, current.version);
    if (current.id === ctx.user.id) throw conflict('CANNOT_REMOVE_SELF', "You can't remove yourself");
    assertMayManage(ctx.user, current);
    if (current.role === 'owner' && current.status === 'active' && (await otherActiveOwners(ctx.db, ctx.user.accountId, current.id)) === 0) {
      throw conflict('LAST_OWNER', 'The account needs at least one active owner');
    }
    const companies = await companiesOf(ctx.db, current.id);
    await ctx.db.transaction(async (tx) => {
      const before = await userToWire(tx, current);
      await revokeAllSessions(tx, current.id, ctx.now);
      await replaceAccess(tx, current.id, { companies: [], branches: [] });
      await tx.delete(I).where(eq(I.userId, current.id));
      if (current.passwordHash) {
        // They have a login of their own, so losing access here is not the end of
        // their account: they move to a fresh account of their own, can still sign
        // in, and set up a business when they have none.
        const accountId = newId('acc');
        await tx.insert(schema.accounts).values({ id: accountId, name: current.name, ownerUserId: null });
        await tx
          .update(U)
          .set({ accountId, role: 'owner', defaultCompanyId: null, version: current.version + 1, updatedAt: ctx.now })
          .where(eq(U.id, current.id));
        await tx.update(schema.accounts).set({ ownerUserId: current.id }).where(eq(schema.accounts.id, accountId));
        await recordUserChange(tx, ctx.user, companies, { action: 'removed', user: { ...current, version: current.version + 1 }, deleted: true, before });
        return;
      }
      let deleted = true;
      try {
        await tx.transaction(async (sp) => {
          await sp.delete(schema.deviceSessions).where(eq(schema.deviceSessions.userId, current.id));
          await sp.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, current.id));
          await sp.delete(schema.idempotencyKeys).where(eq(schema.idempotencyKeys.userId, current.id));
          await sp.delete(schema.clientIdMappings).where(eq(schema.clientIdMappings.userId, current.id));
          await sp.delete(U).where(eq(U.id, current.id));
        });
      } catch (err) {
        if (!isForeignKeyViolation(err)) throw err;
        deleted = false;
        await tx.update(U).set({ status: 'disabled', version: current.version + 1, updatedAt: ctx.now }).where(eq(U.id, current.id));
      }
      await recordUserChange(tx, ctx.user, companies, {
        action: 'removed',
        user: { ...current, version: current.version + 1 },
        deleted,
        before,
      });
    });
    return undefined;
  },

  async resendInvite(ctx) {
    const other = await otherAccountUser(ctx.db, ctx.user.accountId, ctx.params.userId);
    if (other) {
      const { row, companies } = await findGuest(ctx.db, ctx.user.accountId, other.id);
      const [offer] = await ctx.db
        .select({ i: I })
        .from(I)
        .innerJoin(U, eq(U.id, I.invitedBy))
        .where(and(eq(I.userId, row.id), isNull(I.acceptedAt), isNotNull(I.companyIds), eq(U.accountId, ctx.user.accountId)));
      if (!offer) throw conflict('NOT_INVITED', 'This user has already joined');
      assertMayManage(ctx.user, { role: offer.i.role ?? 'viewer' });
      if (ctx.now.getTime() - offer.i.lastSentAt.getTime() < RESEND_AFTER_MS) {
        throw tooManyRequests('The invite was just sent; wait a minute before sending it again');
      }
      const here = (offer.i.companyIds ?? []).filter((id) => companies.includes(id));
      const token = await ctx.db.transaction((tx) =>
        issueGuestInvite(tx, row.id, ctx.user, { role: offer.i.role ?? 'viewer', companies: here, branches: offer.i.branchIds ?? [] }, ctx.now),
      );
      await sendInviteEmail(ctx.deps, ctx.db, ctx.req.log, row, ctx.user.name, await businessNames(ctx.db, here), token, true);
      return undefined;
    }
    const user = await findAccountUser(ctx.db, ctx.user.accountId, ctx.params.userId);
    if (user.status !== 'invited') throw conflict('NOT_INVITED', 'This user has already joined');
    assertMayManage(ctx.user, user);
    const [pending] = await ctx.db.select().from(I).where(and(eq(I.userId, user.id), isNull(I.acceptedAt)));
    if (pending && ctx.now.getTime() - pending.lastSentAt.getTime() < RESEND_AFTER_MS) {
      throw tooManyRequests('The invite was just sent; wait a minute before sending it again');
    }
    const token = await ctx.db.transaction((tx) => issueInvite(tx, user, ctx.user.id, ctx.now));
    await sendInviteEmail(ctx.deps, ctx.db, ctx.req.log, user, ctx.user.name, await businessNames(ctx.db, await companiesOf(ctx.db, user.id)), token);
    return undefined;
  },

  /** Public: what the invite link is for, so the page can ask "join this business?" before anything is changed. */
  async getInvite(ctx) {
    const { invite, user, inviter } = await openInvite(ctx.db, ctx.params.token, ctx.now);
    const guest = invite.companyIds !== null;
    const companyIds = guest ? await offeredCompanies(ctx.db, invite, inviter) : await companiesOf(ctx.db, user.id);
    return {
      email: user.email,
      name: user.name,
      role: guest ? (invite.role ?? user.role) : user.role,
      inviterName: inviter.name,
      businesses: await businessNames(ctx.db, companyIds),
      companyIds,
      // Someone who never set a password still has to choose one when they accept.
      existingUser: guest && !!user.passwordHash,
      expiresAt: invite.expiresAt.toISOString(),
    };
  },

  /**
   * Public: the link from the invite email. A new person sets their password;
   * someone who already has an account just accepts (the emailed link is the
   * proof, as with a password reset). Either way they are signed in.
   */
  async acceptInvite(ctx) {
    const { invite, user, inviter } = await openInvite(ctx.db, ctx.params.token, ctx.now);

    if (invite.companyIds !== null) {
      const companies = await offeredCompanies(ctx.db, invite, inviter);
      if (!companies.length) throw badRequest('INVITE_INVALID', 'This invite link is invalid or has expired');
      const branches = invite.branchIds?.length
        ? (await ctx.db.select({ id: schema.branches.id }).from(schema.branches).where(and(inArray(schema.branches.id, invite.branchIds), inArray(schema.branches.companyId, companies)))).map((b) => b.id)
        : [];
      const role = invite.role ?? 'viewer';
      let member = user;
      const needsPassword = !user.passwordHash;
      const password = ctx.body?.password ?? '';
      if (needsPassword && password.length < MIN_PASSWORD) throw invalid('password', `Choose a password of at least ${MIN_PASSWORD} characters`);
      const passwordHash = needsPassword ? await hashPassword(password) : null;
      await ctx.db.transaction(async (tx) => {
        if (passwordHash) {
          const [activated] = await tx
            .update(U)
            .set({ passwordHash, status: 'active', emailVerifiedAt: ctx.now, version: user.version + 1, updatedAt: ctx.now })
            .where(and(eq(U.id, user.id), isNull(U.passwordHash)))
            .returning();
          if (!activated) throw badRequest('INVITE_INVALID', INVITE_INVALID);
          member = activated;
          // Their first invitation (to their own account) is settled by the same step.
          await tx.update(I).set({ acceptedAt: ctx.now }).where(and(eq(I.userId, user.id), isNull(I.acceptedAt), isNull(I.companyIds)));
        }
        const [claimed] = await tx.update(I).set({ acceptedAt: ctx.now }).where(and(eq(I.id, invite.id), isNull(I.acceptedAt))).returning({ id: I.id });
        if (!claimed) throw badRequest('INVITE_INVALID', 'This invite link is invalid or has expired');
        await tx.insert(schema.userCompanies).values(companies.map((companyId) => ({ userId: user.id, companyId, role }))).onConflictDoNothing();
        if (branches.length) await tx.insert(schema.userBranches).values(branches.map((branchId) => ({ userId: user.id, branchId }))).onConflictDoNothing();
        await recordUserChange(tx, user, companies, { action: 'joined', user, after: { email: user.email, role, companyIds: companies } });
      });
      return issueSession(ctx.req, ctx.deps, ctx.now, member);
    }

    const password = ctx.body?.password ?? '';
    if (password.length < MIN_PASSWORD) throw invalid('password', `Choose a password of at least ${MIN_PASSWORD} characters`);
    const passwordHash = await hashPassword(password);
    const activated = await ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .update(U)
        .set({ passwordHash, status: 'active', emailVerifiedAt: ctx.now, version: user.version + 1, updatedAt: ctx.now })
        .where(and(eq(U.id, user.id), eq(U.status, 'invited')))
        .returning();
      if (!row) throw badRequest('INVITE_INVALID', 'This invite link is invalid or has expired');
      await tx.update(I).set({ acceptedAt: ctx.now }).where(eq(I.id, invite.id));
      const companies = await companiesOf(tx, row.id);
      await recordUserChange(tx, row, companies, { action: 'joined', user: row, after: await userToWire(tx, row) });
      return row;
    });
    return issueSession(ctx.req, ctx.deps, ctx.now, activated);
  },
});
