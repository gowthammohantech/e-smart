import { and, asc, desc, eq, ne, sql, type SQL } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { defineHandlers, type AuthUser } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, invalid, notFound, preconditionFailed } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { addressTo } from '../../lib/wire';
import { branchToWire } from './wire';

const B = schema.branches;
type BranchRow = typeof B.$inferSelect;

async function findBranch(db: DbOrTx, companyId: string, id: string): Promise<BranchRow> {
  const [row] = await db.select().from(B).where(and(eq(B.companyId, companyId), eq(B.id, id)));
  if (!row) throw notFound('Branch');
  return row;
}

function branchColumns(body: Schema<'Branch'>) {
  const name = body.name.trim();
  const code = body.code.trim().toUpperCase();
  if (!name) throw invalid('name', 'Name is required');
  if (!/^[A-Z0-9]{1,6}$/.test(code)) throw invalid('code', 'Use 1 to 6 letters or digits');
  return { name, code, ...addressTo('address', body.address), phone: body.phone ?? null };
}

async function assertCodeFree(db: DbOrTx, companyId: string, code: string, exceptId?: string) {
  const filters = [eq(B.companyId, companyId), eq(B.code, code)];
  if (exceptId) filters.push(ne(B.id, exceptId));
  const [dupe] = await db.select({ id: B.id }).from(B).where(and(...filters));
  if (dupe) throw conflict('BRANCH_CODE_TAKEN', `Another branch already uses the code ${code}`);
}

/** Exactly one primary per company: promoting one demotes the rest. */
async function demoteOthers(tx: DbOrTx, actor: AuthUser, companyId: string, keepId: string, now: Date) {
  const others = await tx.select().from(B).where(and(eq(B.companyId, companyId), eq(B.isPrimary, true), ne(B.id, keepId)));
  for (const o of others) {
    const [d] = await tx.update(B).set({ isPrimary: false, version: o.version + 1, updatedAt: now }).where(eq(B.id, o.id)).returning();
    await recordChange(tx, actor, { companyId, action: 'updated', entityType: 'branch', entityId: d.id, entityLabel: d.name, version: d.version, before: branchToWire(o), after: branchToWire(d) });
  }
}

/** What still points at a branch, in the words the 409 uses. */
async function branchUsage(db: DbOrTx, companyId: string, branchId: string): Promise<string | null> {
  const checks: [string, SQL][] = [
    ['documents', sql`select 1 from documents where company_id = ${companyId} and branch_id = ${branchId} limit 1`],
    ['payments', sql`select 1 from payments where company_id = ${companyId} and branch_id = ${branchId} limit 1`],
    ['expenses', sql`select 1 from expenses where company_id = ${companyId} and branch_id = ${branchId} limit 1`],
    ['stock movements', sql`select 1 from stock_movements where company_id = ${companyId} and branch_id = ${branchId} limit 1`],
    ['users limited to it', sql`select 1 from user_branches where branch_id = ${branchId} limit 1`],
  ];
  for (const [what, q] of checks) {
    const res = await db.execute(q);
    if (res.rows.length) return what;
  }
  return null;
}

/** Branches: listBranches, createBranch, saveBranch, removeBranch. */
export const branchHandlers = defineHandlers({
  /** A user limited to some of this company's branches sees only those. */
  async listBranches(ctx) {
    const rows = await ctx.db.select().from(B).where(eq(B.companyId, ctx.company.id)).orderBy(desc(B.isPrimary), asc(B.name), asc(B.id));
    const limited = ctx.user.branchIds.length ? rows.filter((r) => ctx.user.branchIds.includes(r.id)) : [];
    return { data: (limited.length ? limited : rows).map(branchToWire) };
  },

  async createBranch(ctx) {
    const cols = branchColumns(ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      await assertCodeFree(tx, ctx.company.id, cols.code);
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(B).where(eq(B.companyId, ctx.company.id));
      const isPrimary = n === 0 || !!ctx.body.isPrimary;
      const [created] = await tx
        .insert(B)
        .values({ id: newId('brn'), companyId: ctx.company.id, ...cols, isPrimary })
        .returning();
      if (isPrimary) await demoteOthers(tx, ctx.user, ctx.company.id, created.id, ctx.now);
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'branch', entityId: created.id, entityLabel: created.name, version: created.version, after: branchToWire(created) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return branchToWire(row);
  },

  /** Unsetting the primary flag is refused: promote another branch instead. */
  async saveBranch(ctx) {
    const current = await findBranch(ctx.db, ctx.company.id, ctx.params.branchId);
    checkIfMatch(ctx.req, current.version);
    const cols = branchColumns(ctx.body);
    const isPrimary = ctx.body.isPrimary ?? current.isPrimary;
    if (current.isPrimary && !isPrimary) {
      throw conflict('PRIMARY_BRANCH_REQUIRED', 'Mark another branch as primary instead; a company always has one');
    }
    const row = await ctx.db.transaction(async (tx) => {
      if (cols.code !== current.code) await assertCodeFree(tx, ctx.company.id, cols.code, current.id);
      const [updated] = await tx
        .update(B)
        .set({ ...cols, isPrimary, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(B.id, current.id), eq(B.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      if (isPrimary && !current.isPrimary) await demoteOthers(tx, ctx.user, ctx.company.id, updated.id, ctx.now);
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'updated',
        entityType: 'branch',
        entityId: updated.id,
        entityLabel: updated.name,
        version: updated.version,
        before: branchToWire(current),
        after: branchToWire(updated),
      });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return branchToWire(row);
  },

  async removeBranch(ctx) {
    const current = await findBranch(ctx.db, ctx.company.id, ctx.params.branchId);
    checkIfMatch(ctx.req, current.version);
    if (current.isPrimary) throw conflict('BRANCH_IN_USE', 'The primary branch cannot be deleted; make another branch primary first');
    const used = await branchUsage(ctx.db, ctx.company.id, current.id);
    if (used) throw conflict('BRANCH_IN_USE', `This branch has ${used}`);
    await ctx.db.transaction(async (tx) => {
      await tx.delete(B).where(and(eq(B.id, current.id), eq(B.version, current.version)));
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'deleted',
        entityType: 'branch',
        entityId: current.id,
        entityLabel: current.name,
        version: current.version + 1,
        deleted: true,
        before: branchToWire(current),
      });
    });
    return undefined;
  },
});
