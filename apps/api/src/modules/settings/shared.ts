import type { SQL } from 'drizzle-orm';
import type { AuthUser } from '../../context';
import { recordChange, type DbOrTx } from '../../lib/audit';

/** Runs `select 1 … limit 1` probes in order and names the first that finds a row. */
export async function firstUse(db: DbOrTx, checks: [string, SQL][]): Promise<string | null> {
  for (const [what, q] of checks) {
    const res = await db.execute(q);
    if (res.rows.length) return what;
  }
  return null;
}

/** recordChange for a settings master: created, updated or deleted. */
export async function audit(
  tx: DbOrTx,
  user: AuthUser,
  companyId: string,
  entityType: string,
  action: 'created' | 'updated' | 'deleted',
  row: { id: string; version: number },
  label: string,
  wire: { before?: unknown; after?: unknown },
) {
  await recordChange(tx, user, {
    companyId,
    action,
    entityType,
    entityId: row.id,
    entityLabel: label,
    version: action === 'deleted' ? row.version + 1 : row.version,
    deleted: action === 'deleted',
    ...wire,
  });
}
