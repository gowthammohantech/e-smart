import { and, eq, gte, lt, type SQL } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { defineHandlers } from '../../context';
import { compact, iso } from '../../lib/wire';
import { newestFirst } from './keyset';

const A = schema.auditEvents;
type AuditRow = typeof A.$inferSelect;

/** `before` and `after` are JSON snapshots; the contract carries them as strings. */
function auditToWire(row: AuditRow): Schema<'AuditEvent'> {
  return compact({
    id: row.id,
    companyId: row.companyId,
    actorId: row.actorId,
    actorName: row.actorName,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    entityLabel: row.entityLabel,
    before: row.before === null ? undefined : JSON.stringify(row.before),
    after: row.after === null ? undefined : JSON.stringify(row.after),
    device: row.device,
    createdAt: iso(row.createdAt),
  });
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000);

/** Audit: listAuditEvents. Read-only; rows come from `recordChange`. */
export const auditHandlers = defineHandlers({
  /** Newest first. `from` and `to` are inclusive UTC dates. */
  async listAuditEvents(ctx) {
    const { entityType, entityId, actorId, from, to, limit, cursor } = ctx.query;
    const k = newestFirst({ cursor, limit, at: A.createdAt, id: A.id });
    const filters: SQL[] = [eq(A.companyId, ctx.company.id)];
    if (entityType) filters.push(eq(A.entityType, entityType));
    if (entityId) filters.push(eq(A.entityId, entityId));
    if (actorId) filters.push(eq(A.actorId, actorId));
    if (from) filters.push(gte(A.createdAt, new Date(`${from}T00:00:00Z`)));
    if (to) filters.push(lt(A.createdAt, nextDay(to)));
    const rows = await ctx.db
      .select({ row: A, cursorAt: k.cursorColumn })
      .from(A)
      .where(and(...filters, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    return k.page(
      rows.slice(0, k.take - 1).map((r) => auditToWire(r.row)),
      rows.map((r) => ({ cursorAt: r.cursorAt, id: r.row.id })),
    );
  },
});
