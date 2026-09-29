import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Schema } from '@esmart/api-contract';
import { isValidTransporterId, normalizeGstin } from '@esmart/core/domain/gstin';
import { schema } from '@esmart/db';
import { defineHandlers } from '../../context';
import { checkIfMatch, setEtag } from '../../http/etag';
import { conflict, invalid, notFound, preconditionFailed } from '../../http/errors';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { audit, firstUse } from './shared';
import { transporterToWire } from './wire';

const TR = schema.transporters;

async function findTransporter(db: DbOrTx, companyId: string, id: string) {
  const [row] = await db.select().from(TR).where(and(eq(TR.companyId, companyId), eq(TR.id, id)));
  if (!row) throw notFound('Transporter');
  return row;
}

/** Validates the GSTIN or TRANSIN and that no other transporter in the company has it. */
async function columns(db: DbOrTx, companyId: string, body: Schema<'Transporter'>, exceptId?: string) {
  const transporterId = normalizeGstin(body.transporterId);
  if (!isValidTransporterId(transporterId)) throw invalid('transporterId', 'Not a valid GSTIN or TRANSIN (check digit mismatch)');
  if (!body.name.trim()) throw invalid('name', 'Name is required');
  const filters = [eq(TR.companyId, companyId), eq(TR.transporterId, transporterId)];
  if (exceptId) filters.push(ne(TR.id, exceptId));
  const [dupe] = await db.select({ id: TR.id }).from(TR).where(and(...filters));
  if (dupe) throw invalid('transporterId', `Another transporter already uses ${transporterId}`, 'TRANSPORTER_EXISTS');
  return { name: body.name.trim(), transporterId, phone: body.phone ?? null, status: body.status ?? 'active' };
}

export const transporterHandlers = defineHandlers({
  async listTransporters(ctx) {
    const rows = await ctx.db.select().from(TR).where(eq(TR.companyId, ctx.company.id)).orderBy(asc(TR.name));
    return { data: rows.map(transporterToWire) };
  },

  async createTransporter(ctx) {
    const cols = await columns(ctx.db, ctx.company.id, ctx.body);
    const row = await ctx.db.transaction(async (tx) => {
      const [created] = await tx.insert(TR).values({ id: newId('trn'), companyId: ctx.company.id, ...cols }).returning();
      await audit(tx, ctx.user, ctx.company.id, 'transporter', 'created', created, created.name, { after: transporterToWire(created) });
      return created;
    });
    setEtag(ctx.reply, row.version);
    return transporterToWire(row);
  },

  async saveTransporter(ctx) {
    const current = await findTransporter(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const cols = await columns(ctx.db, ctx.company.id, ctx.body, current.id);
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(TR)
        .set({ ...cols, version: current.version + 1, updatedAt: ctx.now })
        .where(and(eq(TR.id, current.id), eq(TR.version, current.version)))
        .returning();
      if (!updated) throw preconditionFailed();
      await audit(tx, ctx.user, ctx.company.id, 'transporter', 'updated', updated, updated.name, { before: transporterToWire(current), after: transporterToWire(updated) });
      return updated;
    });
    setEtag(ctx.reply, row.version);
    return transporterToWire(row);
  },

  /**
   * E-way bills point at the transporter row, so one that carried goods is
   * kept (mark it inactive instead). Being the compliance default is not a
   * reason to keep it: the default is simply cleared.
   */
  async removeTransporter(ctx) {
    const current = await findTransporter(ctx.db, ctx.company.id, ctx.params.id);
    checkIfMatch(ctx.req, current.version);
    const used = await firstUse(ctx.db, [['e-way bills', sql`select 1 from eway_bills where transporter_id = ${current.id} limit 1`]]);
    if (used) throw conflict('TRANSPORTER_IN_USE', 'E-way bills name this transporter; mark it inactive instead');
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(schema.complianceSettings)
        .set({ defaultTransporterId: null, version: sql`${schema.complianceSettings.version} + 1`, updatedAt: ctx.now })
        .where(and(eq(schema.complianceSettings.companyId, ctx.company.id), eq(schema.complianceSettings.defaultTransporterId, current.id)));
      await tx.delete(TR).where(eq(TR.id, current.id));
      await audit(tx, ctx.user, ctx.company.id, 'transporter', 'deleted', current, current.name, { before: transporterToWire(current) });
    });
    return undefined;
  },
});
