import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Deps } from '../context';
import type { DbOrTx } from './audit';
import { newId } from './ids';
import { enqueue } from '../jobs/queue';

type Kind = (typeof schema.notifications.$inferInsert)['kind'];

/**
 * Adds an in-app notification for a company (or one user in it), and queues the push to that
 * audience's devices. The push goes out from the `push.send` job after the caller's transaction
 * commits, so a rolled-back change never pings anyone, and no HTTP call holds a transaction open.
 */
export async function notify(
  db: DbOrTx,
  _deps: Deps,
  n: { companyId: string; userId?: string; kind: Kind; title: string; body: string; entityType?: string; entityId?: string },
): Promise<void> {
  const id = newId('ntf');
  await db.insert(schema.notifications).values({
    id,
    companyId: n.companyId,
    userId: n.userId ?? null,
    kind: n.kind,
    title: n.title.slice(0, 200),
    body: n.body,
    entityType: n.entityType ?? null,
    entityId: n.entityId ?? null,
  });
  await enqueue(db, 'push.send', { notificationId: id }, { maxAttempts: 3 });
}

/** Android channels, so people can silence one kind in the phone's settings. */
const CHANNEL: Record<string, string> = { paymentReceived: 'payments', invoiceOverdue: 'payments', compliance: 'compliance', lowStock: 'stock' };

/** How long Expo needs before a ticket's receipt says whether the phone got it. */
const RECEIPT_DELAY_MS = 15 * 60_000;

/**
 * The `push.send` job: the notification to everyone it is for who has a device and hasn't muted the
 * kind. Tokens the push service says are gone are removed now; the rest get a receipt check later.
 */
export async function sendPush(deps: Deps, notificationId: string): Promise<number> {
  const [n] = await deps.db.select().from(schema.notifications).where(eq(schema.notifications.id, notificationId));
  if (!n) return 0;
  const audience = n.userId
    ? [n.userId]
    : (await deps.db.select({ id: schema.userCompanies.userId }).from(schema.userCompanies).where(eq(schema.userCompanies.companyId, n.companyId))).map((r) => r.id);
  if (!audience.length) return 0;
  const people = await deps.db.select({ id: schema.users.id, muted: schema.users.pushMuted, status: schema.users.status }).from(schema.users).where(inArray(schema.users.id, audience));
  const userIds = people.filter((p) => p.status === 'active' && !(p.muted ?? []).includes(n.kind)).map((p) => p.id);
  if (!userIds.length) return 0;
  const tokens = (await deps.db.select({ token: schema.pushTokens.token }).from(schema.pushTokens).where(and(inArray(schema.pushTokens.userId, userIds)))).map((t) => t.token);
  if (!tokens.length) return 0;
  const outcome = await deps.providers.push.send(tokens, {
    title: n.title,
    body: n.body,
    channelId: CHANNEL[n.kind] ?? 'general',
    data: { kind: n.kind, ...(n.entityId ? { entityType: n.entityType ?? '', entityId: n.entityId } : {}), companyId: n.companyId },
  });
  if (outcome.deadTokens.length) await deps.db.delete(schema.pushTokens).where(inArray(schema.pushTokens.token, outcome.deadTokens));
  if (outcome.tickets.length) {
    await enqueue(deps.db, 'push.receipts', { tickets: outcome.tickets }, { runAt: new Date(deps.now().getTime() + RECEIPT_DELAY_MS), maxAttempts: 3 });
  }
  return tokens.length;
}

/** The `push.receipts` job: forgets the devices whose receipts say they are gone. */
export async function checkPushReceipts(deps: Deps, tickets: { token: string; ticketId: string }[]): Promise<number> {
  const dead = new Set(await deps.providers.push.deadTickets(tickets.map((t) => t.ticketId)));
  const gone = tickets.filter((t) => dead.has(t.ticketId)).map((t) => t.token);
  if (gone.length) await deps.db.delete(schema.pushTokens).where(inArray(schema.pushTokens.token, gone));
  return gone.length;
}
