import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, notFound, preconditionFailed, unprocessable, type Issue } from '../../http/errors';
import { keyset } from '../../http/pagination';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { compact, versioned } from '../../lib/wire';

const CC = schema.costCentres;
type Row = typeof CC.$inferSelect;

function toWire(row: Row): Schema<'CostCentre'> {
  return compact({ id: row.id, companyId: row.companyId, name: row.name, category: row.category, parentId: row.parentId, status: row.status, ...versioned(row) });
}

/** The cost centres named on a document, expense or voucher, as validation issues when one isn't this company's. */
export async function costCentreIssues(db: DbOrTx, companyId: string, refs: { field: string; id?: string | null }[]): Promise<Issue[]> {
  const ids = [...new Set(refs.map((r) => r.id).filter((x): x is string => !!x))];
  if (!ids.length) return [];
  const found = new Set((await db.select({ id: CC.id }).from(CC).where(and(eq(CC.companyId, companyId), inArray(CC.id, ids)))).map((r) => r.id));
  return refs.filter((r) => r.id && !found.has(r.id)).map((r) => ({ field: r.field, message: 'No such cost centre in this company', severity: 'blocking' as const }));
}

async function find(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(CC).where(and(eq(CC.companyId, companyId), eq(CC.id, id)));
  if (!row) throw notFound('Cost centre');
  return row;
}

async function columns(db: DbOrTx, companyId: string, body: Schema<'CostCentre'>, selfId?: string) {
  const issues: Issue[] = [];
  const name = body.name.trim();
  if (!name) issues.push({ field: 'name', message: 'Give the cost centre a name', severity: 'blocking' });
  const [same] = await db.select({ id: CC.id }).from(CC).where(and(eq(CC.companyId, companyId), eq(CC.name, name), selfId ? ne(CC.id, selfId) : undefined));
  if (same) issues.push({ field: 'name', message: `There is already a cost centre called ${name}`, severity: 'blocking' });
  if (body.parentId) {
    // The parent must be this company's, and not the centre itself or one under it.
    const all = await db.select({ id: CC.id, parentId: CC.parentId }).from(CC).where(eq(CC.companyId, companyId));
    const parentOf = new Map(all.map((c) => [c.id, c.parentId]));
    if (!parentOf.has(body.parentId)) issues.push({ field: 'parentId', message: 'No such cost centre in this company', severity: 'blocking' });
    else {
      for (let at: string | null | undefined = body.parentId, hops = 0; at && hops <= all.length; at = parentOf.get(at), hops++) {
        if (at === selfId) {
          issues.push({ field: 'parentId', message: 'A cost centre cannot sit under itself', severity: 'blocking' });
          break;
        }
      }
    }
  }
  if (issues.length) throw unprocessable(issues);
  return { name, category: body.category?.trim() || null, parentId: body.parentId || null, status: body.status ?? ('active' as const) };
}

/** Cost centres: projects, departments and the like, for profit by cost centre. */
export const costCentreHandlers = defineHandlers({
  async listCostCentres(ctx) {
    const k = keyset({ cursor: ctx.query.cursor, limit: ctx.query.limit, sort: CC.name, id: CC.id, order: 'asc' });
    const rows = await ctx.db.select().from(CC).where(and(eq(CC.companyId, ctx.company.id), k.where)).orderBy(...k.orderBy).limit(k.take);
    return k.page(rows.slice(0, k.take - 1).map(toWire), rows);
  },

  async createCostCentre(ctx) {
    const cols = await columns(ctx.db, ctx.company.id, ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      const [created] = await tx.insert(CC).values({ id: newId('ccn'), companyId: ctx.company.id, ...cols, createdAt: ctx.now, updatedAt: ctx.now }).returning();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'created', entityType: 'cost_centre', entityId: created.id, entityLabel: created.name, version: created.version });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return toWire(row);
  },

  async getCostCentre(ctx) {
    const row = await find(ctx.db, ctx.company.id, ctx.params.id);
    setEtag(ctx.reply, row.version);
    return toWire(row);
  },

  async saveCostCentre(ctx) {
    const current = await find(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const cols = await columns(ctx.db, ctx.company.id, ctx.body, current.id);
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx.update(CC).set({ ...cols, version: current.version + 1, updatedAt: ctx.now }).where(and(eq(CC.id, current.id), eq(CC.version, current.version))).returning();
      if (!updated) throw preconditionFailed();
      await recordChange(tx, ctx.user, { companyId: ctx.company.id, action: 'updated', entityType: 'cost_centre', entityId: updated.id, entityLabel: updated.name, version: updated.version, before: { name: current.name, parentId: current.parentId }, after: { name: updated.name, parentId: updated.parentId } });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return toWire(row);
  },

  async removeCostCentre(ctx) {
    const current = await find(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const c = ctx.company.id;
    const [doc] = await ctx.db.select({ n: schema.documents.number }).from(schema.documents).where(and(eq(schema.documents.companyId, c), eq(schema.documents.costCentreId, current.id))).limit(1);
    const [line] = await ctx.db
      .select({ n: schema.documents.number })
      .from(schema.documentLines)
      .innerJoin(schema.documents, eq(schema.documents.id, schema.documentLines.documentId))
      .where(and(eq(schema.documents.companyId, c), eq(schema.documentLines.costCentreId, current.id)))
      .limit(1);
    const [exp] = await ctx.db.select({ n: schema.expenses.number }).from(schema.expenses).where(and(eq(schema.expenses.companyId, c), eq(schema.expenses.costCentreId, current.id))).limit(1);
    const [vch] = await ctx.db
      .select({ n: schema.vouchers.number })
      .from(schema.vouchers)
      .where(and(eq(schema.vouchers.companyId, c), sql`${schema.vouchers.lines} @> ${JSON.stringify([{ costCentreId: current.id }])}::jsonb`))
      .limit(1);
    const [child] = await ctx.db.select({ n: CC.name }).from(CC).where(and(eq(CC.companyId, c), eq(CC.parentId, current.id))).limit(1);
    const used = doc?.n ?? line?.n ?? exp?.n ?? vch?.n;
    if (used) throw conflict('COST_CENTRE_IN_USE', `${current.name} is on ${used}; mark it inactive instead`);
    if (child) throw conflict('COST_CENTRE_IN_USE', `${child.n} sits under ${current.name}; move it first`);
    await ctx.db.transaction(async (tx) => {
      const deleted = await tx.delete(CC).where(and(eq(CC.id, current.id), eq(CC.version, current.version))).returning({ id: CC.id });
      if (!deleted.length) throw preconditionFailed();
      await recordChange(tx, ctx.user, { companyId: c, action: 'deleted', entityType: 'cost_centre', entityId: current.id, entityLabel: current.name, version: current.version + 1, deleted: true });
    });
    return undefined;
  },
});
