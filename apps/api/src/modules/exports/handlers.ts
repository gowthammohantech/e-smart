import { and, desc, eq } from 'drizzle-orm';
import { schema } from '@esmart/db';
import type { Schema } from '@esmart/api-contract';
import { defineHandlers, type Deps } from '../../context';
import { invalid, notFound } from '../../http/errors';
import { recordChange, type DbOrTx } from '../../lib/audit';
import { newId } from '../../lib/ids';
import { compact, iso } from '../../lib/wire';
import { buildExport } from './build';

const J = schema.exportJobs;
const BS = schema.backupSettings;
type JobRow = typeof J.$inferSelect;

/** How long an export file is kept, and how long one download link works. */
const RETENTION_MS = 7 * 86_400_000;
const LINK_TTL_SECONDS = 3600;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'company';

/** A completed, unexpired job carries a fresh signed link; `expiresAt` is the link's. */
async function jobToWire(deps: Deps, row: JobRow, now: Date, companyName: string): Promise<Schema<'ExportJob'>> {
  let link: { url: string; expiresAt: Date } | undefined;
  if (row.status === 'completed' && row.storageKey && (!row.expiresAt || row.expiresAt > now)) {
    const remaining = row.expiresAt ? Math.floor((row.expiresAt.getTime() - now.getTime()) / 1000) : LINK_TTL_SECONDS;
    const stamp = row.createdAt.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${slug(companyName)}-${row.format}-${stamp}.${row.storageKey.split('.').pop()}`;
    link = await deps.providers.storage.downloadUrl(row.storageKey, { ttlSeconds: Math.max(1, Math.min(LINK_TTL_SECONDS, remaining)), filename });
  }
  return compact({
    id: row.id,
    format: row.format,
    status: row.status,
    downloadUrl: link?.url,
    expiresAt: iso(link?.expiresAt ?? (row.status === 'completed' ? row.expiresAt : null)),
    createdAt: iso(row.createdAt),
  });
}

async function findJob(db: DbOrTx, companyId: string, id: string): Promise<JobRow> {
  const [row] = await db.select().from(J).where(and(eq(J.companyId, companyId), eq(J.id, id)));
  if (!row) throw notFound('Export');
  return row;
}

/** The company's backup settings, created with defaults on first read. */
async function backupSettingsOf(db: DbOrTx, companyId: string) {
  await db.insert(BS).values({ companyId }).onConflictDoNothing();
  const [row] = await db.select().from(BS).where(eq(BS.companyId, companyId));
  return row;
}

function backupToWire(row: typeof BS.$inferSelect): Schema<'BackupSettings'> {
  return compact({ automatic: row.automatic, frequency: row.frequency, destination: row.destination, lastBackupAt: iso(row.lastBackupAt) });
}

/** Exports: createExport, listExports, getExport, getBackupSettings, saveBackupSettings. */
export const exportsHandlers = defineHandlers({
  /**
   * Builds the file in the request for now, so the 202's job is already
   * completed (or failed). A json-backup counts as the company's last backup.
   */
  async createExport(ctx) {
    const { format, from, to, includeAttachments } = ctx.body;
    if (from && to && from > to) throw invalid('to', 'The end date is before the start date');
    const [job] = await ctx.db
      .insert(J)
      .values({ id: newId('exp'), companyId: ctx.company.id, format, status: 'running', trigger: 'manual', requestedBy: ctx.user.id, createdAt: ctx.now })
      .returning();
    let done: JobRow;
    try {
      const file = await buildExport(ctx.db, ctx.deps, format, ctx.company.id, { from, to, includeAttachments }, ctx.now);
      // Short keys: the memory store serves them as one path segment (Fastify caps those at 100 characters).
      const key = `exports/${ctx.company.id}/${job.id}.${file.extension}`;
      await ctx.deps.providers.storage.put(key, file.body, file.contentType);
      done = await ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .update(J)
          .set({ status: 'completed', storageKey: key, completedAt: ctx.now, expiresAt: new Date(ctx.now.getTime() + RETENTION_MS) })
          .where(eq(J.id, job.id))
          .returning();
        if (format === 'json-backup') {
          await backupSettingsOf(tx, ctx.company.id);
          await tx.update(BS).set({ lastBackupAt: ctx.now }).where(eq(BS.companyId, ctx.company.id));
        }
        await recordChange(tx, ctx.user, {
          companyId: ctx.company.id,
          action: 'exported',
          entityType: 'export_job',
          entityId: row.id,
          entityLabel: `${format} export`,
          version: 1,
          after: { format, from, to, includeAttachments: !!includeAttachments },
        });
        return row;
      });
    } catch (err) {
      ctx.req.log.error({ err, jobId: job.id }, 'export failed');
      [done] = await ctx.db.update(J).set({ status: 'failed', error: String((err as Error).message ?? err).slice(0, 1000), completedAt: ctx.now }).where(eq(J.id, job.id)).returning();
    }
    return jobToWire(ctx.deps, done, ctx.now, ctx.company.name);
  },

  async listExports(ctx) {
    const rows = await ctx.db.select().from(J).where(eq(J.companyId, ctx.company.id)).orderBy(desc(J.createdAt), desc(J.id)).limit(100);
    return { data: await Promise.all(rows.map((r) => jobToWire(ctx.deps, r, ctx.now, ctx.company.name))) };
  },

  async getExport(ctx) {
    return jobToWire(ctx.deps, await findJob(ctx.db, ctx.company.id, ctx.params.id), ctx.now, ctx.company.name);
  },

  async getBackupSettings(ctx) {
    return backupToWire(await backupSettingsOf(ctx.db, ctx.company.id));
  },

  /** Backing up to Google Drive needs the Drive integration connected first. */
  async saveBackupSettings(ctx) {
    const current = await backupSettingsOf(ctx.db, ctx.company.id);
    const destination = ctx.body.destination ?? current.destination;
    if (destination === 'google-drive' && destination !== current.destination) {
      const [drive] = await ctx.db
        .select({ connected: schema.companyIntegrations.connected })
        .from(schema.companyIntegrations)
        .where(and(eq(schema.companyIntegrations.companyId, ctx.company.id), eq(schema.companyIntegrations.integrationId, 'int_drive')));
      if (!drive?.connected) throw invalid('destination', 'Connect Google Drive under Integrations first', 'INTEGRATION_NOT_CONNECTED');
    }
    const row = await ctx.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(BS)
        .set({
          automatic: ctx.body.automatic ?? current.automatic,
          frequency: ctx.body.frequency ?? current.frequency,
          destination,
          version: current.version + 1,
          updatedAt: ctx.now,
        })
        .where(eq(BS.companyId, ctx.company.id))
        .returning();
      await recordChange(tx, ctx.user, {
        companyId: ctx.company.id,
        action: 'updated',
        entityType: 'backup_settings',
        entityId: ctx.company.id,
        entityLabel: 'Backup settings',
        version: updated.version,
        before: backupToWire(current),
        after: backupToWire(updated),
      });
      return updated;
    });
    return backupToWire(row);
  },
});
