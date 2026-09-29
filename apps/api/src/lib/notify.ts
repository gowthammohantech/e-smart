import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Deps } from '../context';
import type { DbOrTx } from './audit';
import { newId } from './ids';

type Kind = (typeof schema.notifications.$inferInsert)['kind'];

/**
 * Adds an in-app notification for a company (or one user in it) and pushes
 * it to that audience's registered devices. Push is best effort: a failed
 * push never fails the write that caused it.
 */
export async function notify(
  db: DbOrTx,
  deps: Deps,
  n: { companyId: string; userId?: string; kind: Kind; title: string; body: string; entityType?: string; entityId?: string },
): Promise<void> {
  await db.insert(schema.notifications).values({
    id: newId('ntf'),
    companyId: n.companyId,
    userId: n.userId ?? null,
    kind: n.kind,
    title: n.title.slice(0, 200),
    body: n.body,
    entityType: n.entityType ?? null,
    entityId: n.entityId ?? null,
  });
  try {
    const userIds = n.userId
      ? [n.userId]
      : (await db.select({ id: schema.userCompanies.userId }).from(schema.userCompanies).where(eq(schema.userCompanies.companyId, n.companyId))).map((r) => r.id);
    if (!userIds.length) return;
    const tokens = await db.select({ token: schema.pushTokens.token }).from(schema.pushTokens).where(and(inArray(schema.pushTokens.userId, userIds)));
    if (tokens.length) {
      await deps.providers.push.send(
        tokens.map((t) => t.token),
        { title: n.title, body: n.body, data: n.entityId ? { entityType: n.entityType ?? '', entityId: n.entityId } : undefined },
      );
    }
  } catch {
    // Best effort.
  }
}
