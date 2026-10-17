import type { FastifyRequest } from 'fastify';
import { schema } from '@esmart/db';
import type { AuthUser } from '../../context';
import type { DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';

export type PlatformTarget = { type: 'account' | 'company' | 'user'; id: string; label: string };

/**
 * Records what a platform operator did. Call it inside the same transaction
 * as the change, so an action can't happen without its audit row.
 */
export async function recordPlatformAction(
  db: DbOrTx,
  actor: AuthUser,
  req: FastifyRequest,
  action: { action: string; target: PlatformTarget; reason: string; before?: unknown; after?: unknown },
) {
  await db.insert(schema.platformAuditEvents).values({
    id: newId('pae'),
    actorId: actor.id,
    actorEmail: actor.email,
    action: action.action,
    targetType: action.target.type,
    targetId: action.target.id,
    targetLabel: action.target.label.slice(0, 200),
    reason: action.reason,
    before: action.before ?? null,
    after: action.after ?? null,
    ipAddress: req.ip ?? null,
  });
}
