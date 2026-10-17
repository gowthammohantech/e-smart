import { and, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { defineHandlers } from '../../context';
import { notFound } from '../../http/errors';
import { compact, iso } from '../../lib/wire';
import { newestFirst } from '../audit/keyset';

const N = schema.notifications;
type NotificationRow = typeof N.$inferSelect;

function notificationToWire(row: NotificationRow): Schema<'AppNotification'> {
  return compact({
    id: row.id,
    companyId: row.companyId,
    kind: row.kind,
    title: row.title,
    body: row.body,
    entityType: row.entityType,
    entityId: row.entityId,
    read: row.readAt !== null,
    createdAt: iso(row.createdAt),
  });
}

/**
 * What the caller sees in a company: company-wide rows (no user) and their
 * own, minus cleared ones. Read and cleared state live on the row, so for a
 * company-wide notification they are shared by every member.
 */
function visibleTo(companyId: string, userId: string): SQL {
  return and(eq(N.companyId, companyId), or(isNull(N.userId), eq(N.userId, userId)), isNull(N.clearedAt))!;
}

/**
 * Notifications: listNotifications, clearNotifications, markNotificationRead,
 * markAllNotificationsRead. Rows are written by `lib/notify.ts`.
 */
export const notificationsHandlers = defineHandlers({
  async listNotifications(ctx) {
    const { unread, limit, cursor } = ctx.query;
    const visible = visibleTo(ctx.company.id, ctx.user.id);
    const k = newestFirst({ cursor, limit, at: N.createdAt, id: N.id });
    const rows = await ctx.db
      .select({ row: N, cursorAt: k.cursorColumn })
      .from(N)
      .where(and(visible, unread ? isNull(N.readAt) : undefined, k.where))
      .orderBy(...k.orderBy)
      .limit(k.take);
    const [{ count }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(N)
      .where(and(visible, isNull(N.readAt)));
    const page = k.page(
      rows.slice(0, k.take - 1).map((r) => notificationToWire(r.row)),
      rows.map((r) => ({ cursorAt: r.cursorAt, id: r.row.id })),
    );
    return { ...page, unreadCount: count };
  },

  async clearNotifications(ctx) {
    await ctx.db.update(N).set({ clearedAt: ctx.now }).where(visibleTo(ctx.company.id, ctx.user.id));
    return undefined;
  },

  async markNotificationRead(ctx) {
    const [row] = await ctx.db
      .select({ id: N.id, readAt: N.readAt })
      .from(N)
      .where(and(visibleTo(ctx.company.id, ctx.user.id), eq(N.id, ctx.params.id)));
    if (!row) throw notFound('Notification');
    if (!row.readAt) await ctx.db.update(N).set({ readAt: ctx.now }).where(eq(N.id, row.id));
    return undefined;
  },

  async markAllNotificationsRead(ctx) {
    await ctx.db
      .update(N)
      .set({ readAt: ctx.now })
      .where(and(visibleTo(ctx.company.id, ctx.user.id), isNull(N.readAt)));
    return undefined;
  },
});
