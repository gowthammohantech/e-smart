import { schema, type Db } from '@esmart/db';
import type { AuthUser } from '../context';
import { newId } from './ids';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export type Change = {
  companyId: string;
  /** e.g. `created`, `updated`, `finalized`, `marked sent`. */
  action: string;
  entityType: string;
  entityId: string;
  /** What a person reads in the audit trail: `INV/26-27/0004`, `Acme Traders`. */
  entityLabel: string;
  /** The entity's version after the change; drives /sync/pull. */
  version: number;
  deleted?: boolean;
  before?: unknown;
  after?: unknown;
};

/**
 * Records a change twice: in the append-only audit trail people read, and in
 * the change log that /sync/pull pages through. Call it inside the same
 * transaction as the write, so neither can exist without the other.
 */
export async function recordChange(db: DbOrTx, actor: AuthUser, change: Change, meta: { device?: string; ip?: string } = {}) {
  await db.insert(schema.auditEvents).values({
    id: newId('aud'),
    companyId: change.companyId,
    actorId: actor.id,
    actorName: actor.name,
    action: change.action,
    entityType: change.entityType,
    entityId: change.entityId,
    entityLabel: change.entityLabel.slice(0, 200),
    before: change.before ?? null,
    after: change.after ?? null,
    device: meta.device?.slice(0, 100) ?? null,
    ipAddress: meta.ip ?? null,
  });
  await db.insert(schema.changeLog).values({
    companyId: change.companyId,
    entityType: change.entityType,
    entityId: change.entityId,
    op: change.deleted ? 'delete' : 'upsert',
    version: change.version,
  });
}
