import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { invalid, notFound, preconditionFailed } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { audit } from './shared';
import { chargeNameToWire } from './wire';

const CN = schema.chargeNames;

async function findChargeName(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(CN).where(and(eq(CN.companyId, companyId), eq(CN.id, id)));
  if (!row) throw notFound('Charge name');
  return row;
}

/** A name, trimmed, that no other of the business's charge names has (whatever its case). */
async function columns(db: DbOrTx, companyId: string, body: Schema<'ChargeName'>, exceptId?: string) {
  const name = body.name.trim().replace(/\s+/g, ' ');
  if (!name) throw invalid('name', 'Name is required');
  if (name.length > 60) throw invalid('name', 'At most 60 characters');
  const filters = [eq(CN.companyId, companyId), sql`lower(${CN.name}) = lower(${name})`];
  if (exceptId) filters.push(ne(CN.id, exceptId));
  const [dupe] = await db.select({ id: CN.id }).from(CN).where(and(...filters));
  if (dupe) throw invalid('name', `There is already a charge named ${name}`, 'CHARGE_NAME_EXISTS');
  return { name, status: body.status ?? 'active' };
}

/**
 * A business's own names for other charges: listed only to it, added from a document's charges
 * list, renamed or hidden later. A document keeps the name it printed (its chargesLabel), so nothing
 * here changes one already made; that is why a name is hidden rather than deleted.
 */
export const chargeNameHandlers = defineHandlers({
  async listChargeNames(ctx) {
    const rows = await ctx.db.select().from(CN).where(eq(CN.companyId, ctx.company.id)).orderBy(asc(CN.name));
    return { data: rows.map(chargeNameToWire) };
  },

  async createChargeName(ctx) {
    const cols = await columns(ctx.db, ctx.company.id, ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      const [created] = await tx.insert(CN).values({ id: newId('chn'), companyId: ctx.company.id, ...cols }).returning();
      await audit(tx, ctx.user, ctx.company.id, 'chargeName', 'created', created, created.name, { after: chargeNameToWire(created) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return chargeNameToWire(row);
  },

  async saveChargeName(ctx) {
    const current = await findChargeName(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const cols = await columns(ctx.db, ctx.company.id, ctx.body, current.id);
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(CN)
        .set({ ...cols, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(CN.id, current.id), eq(CN.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await audit(tx, ctx.user, ctx.company.id, 'chargeName', 'updated', updated, updated.name, { before: chargeNameToWire(current), after: chargeNameToWire(updated) });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return chargeNameToWire(row);
  },
});
