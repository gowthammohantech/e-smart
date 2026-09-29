import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { hashPassword } from '../../auth/passwords';
import { defineHandlers, type AuthUser } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { ApiError, badRequest, conflict, invalid, notFound, preconditionFailed, tooManyRequests } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { randomToken, sha256 } from '../../lib/crypto';
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

async function sendInviteEmail(deps: { config: { PUBLIC_BASE_URL: string }; providers: { email: { send: (m: { to: string; subject: string; text: string }) => Promise<unknown> } } }, user: UserRow, inviter: string, token: string) {
  const link = `${deps.config.PUBLIC_BASE_URL}/accept-invite?token=${token}`;
  await deps.providers.email.send({
    to: user.email,
    subject: `${inviter} invited you to Elixir Books`,
    text: `Hi ${user.name},\n\n${inviter} added you to their team on Elixir Books. Set your password and join with this link. It expires in 7 days:\n${link}\n`,
  });
}

/**
 * Users: listUsers, inviteUser, saveUser, removeUser, resendInvite, acceptInvite.
 * The team belongs to the account, not to one company.
 */
export const usersHandlers = defineHandlers({
  async listUsers(ctx) {
    const rows = await ctx.db.select().from(U).where(eq(U.accountId, ctx.user.accountId)).orderBy(asc(U.createdAt), asc(U.id));
    return { data: await Promise.all(rows.map((r) => userToWire(ctx.db, r))) };
  },

  async inviteUser(ctx) {
    const body = ctx.body;
    assertMayManage(ctx.user, { role: body.role }, body.role);
    const email = normalizeEmail(body.email);
    const phone = body.phone?.trim() || null;
    const [taken] = await ctx.db.select({ id: U.id }).from(U).where(eq(U.email, email));
    if (taken) throw conflict('EMAIL_TAKEN', 'Someone already uses this email');
    if (phone) {
      const [phoneTaken] = await ctx.db.select({ id: U.id }).from(U).where(eq(U.phone, phone));
      if (phoneTaken) throw conflict('PHONE_TAKEN', 'This phone number is already registered');
    }
    if (!body.name.trim()) throw invalid('name', 'Name is required');
    const access = await resolveAccess(ctx.db, ctx.user, body.role, body.companyIds, body.branchIds ?? []);

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
    await sendInviteEmail(ctx.deps, user, ctx.user.name, token);
    setEtag(ctx.reply, user.version);
    return userToWire(ctx.db, user);
  },

  /**
   * Role, access and status. The guards reload the user on every request, so
   * a change applies from the target's next call. Email is the sign-in
   * identity and is not changed here.
   */
  async saveUser(ctx) {
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
    if (body.phone !== undefined) {
      const phone = body.phone.trim() || null;
      if (phone && phone !== current.phone) {
        const [taken] = await ctx.db.select({ id: U.id }).from(U).where(eq(U.phone, phone));
        if (taken) throw conflict('PHONE_TAKEN', 'This phone number is already registered');
      }
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
    const user = await findAccountUser(ctx.db, ctx.user.accountId, ctx.params.userId);
    if (user.status !== 'invited') throw conflict('NOT_INVITED', 'This user has already joined');
    assertMayManage(ctx.user, user);
    const [pending] = await ctx.db.select().from(I).where(and(eq(I.userId, user.id), isNull(I.acceptedAt)));
    if (pending && ctx.now.getTime() - pending.lastSentAt.getTime() < RESEND_AFTER_MS) {
      throw tooManyRequests('The invite was just sent; wait a minute before sending it again');
    }
    const token = await ctx.db.transaction((tx) => issueInvite(tx, user, ctx.user.id, ctx.now));
    await sendInviteEmail(ctx.deps, user, ctx.user.name, token);
    return undefined;
  },

  /** Public: the link from the invite email. Sets the password and signs in. */
  async acceptInvite(ctx) {
    const [invite] = await ctx.db
      .select()
      .from(I)
      .where(and(eq(I.tokenHash, sha256(ctx.params.token)), isNull(I.acceptedAt)));
    if (!invite || invite.expiresAt < ctx.now) throw badRequest('INVITE_INVALID', 'This invite link is invalid or has expired');
    const [user] = await ctx.db.select().from(U).where(eq(U.id, invite.userId));
    if (!user || user.status !== 'invited') throw badRequest('INVITE_INVALID', 'This invite link is invalid or has expired');
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
